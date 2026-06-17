/**
 * Broadcast response processor (Phase F.2).
 *
 * Sweeps `inbound_responses` that haven't been processed yet and does the
 * heavy, reliable work the webhook deliberately skips (so the instant reply
 * never depends on PCO being up):
 *
 *   1. Dedup by phone against the local mirror — a returning guest who texts
 *      HOME links to their existing record, not a duplicate.
 *   2. If new, create a minimal PCO person + phone (the ONLY live-CRM write
 *      in MLIS), gated behind a feature flag, then mirror locally.
 *   3. Record a `broadcast_response` engagement signal.
 *   4. Free-text scan the message:
 *        - crisis   → raise a pastoral_flag (reason 'crisis'); enrollment then
 *                     self-blocks. A human owns the situation. No journey runs.
 *        - prayer   → create a `prayer_request` signal so the ADR-004 path
 *                     engages in parallel (the welcome already promised a human).
 *        - salvation→ mark high-priority; the journey proceeds.
 *   5. Enroll the 21-day journey (skipping Touch 1 — the auto-ack covered it).
 *   6. Stamp the row processed.
 *
 * Idempotent: person_pco_id + dedup prevent duplicate PCO writes on retry;
 * engagement_signals + enrollGuest are themselves idempotent; `meta.processed_at`
 * marks completion. Safe to run on a one-minute cron.
 *
 * Vendor-free + testable: the live PCO write is injected via PcoPersonWriter.
 */

import type { Db, Json } from '../db/index.ts';
import { enrollGuest } from '../journey/index.ts';
import { scanFreeText } from './free-text-scan.ts';

/** The seam for the live PCO write. Production impl wraps src/pco/people-write. */
export interface PcoPersonWriter {
  createPersonWithPhone(args: {
    phone: string;
    note?: string;
  }): Promise<{ pcoId: string; phonePcoId: string }>;
}

export interface ProcessConfig {
  /** Master switch for the live PCO write. When false, the sweep is a no-op
   *  and rows stay in the callback queue for manual handling (== Phase F). */
  pcoWriteEnabled: boolean;
  /** Injected live-CRM writer. Required when pcoWriteEnabled is true. */
  writer: PcoPersonWriter | null;
  batchSize?: number;
  now?: () => Date;
}

export interface ProcessResult {
  examined: number;
  processed: number;
  pcoCreated: number;
  linkedExisting: number;
  enrolled: number;
  prayerSignals: number;
  salvationFlagged: number;
  crisisFlagged: number;
  skippedDisabled: number;
}

interface PendingRow {
  id: string;
  from_phone: string;
  body_raw: string;
  message_sid: string;
  intent: string;
  keyword: string;
  received_at: string;
  person_pco_id: string | null;
  meta: Json;
}

export async function processInboundResponses(
  db: Db,
  config: ProcessConfig,
): Promise<ProcessResult> {
  const now = (config.now ?? (() => new Date()))();
  const result: ProcessResult = {
    examined: 0,
    processed: 0,
    pcoCreated: 0,
    linkedExisting: 0,
    enrolled: 0,
    prayerSignals: 0,
    salvationFlagged: 0,
    crisisFlagged: 0,
    skippedDisabled: 0,
  };

  const { data, error } = await db
    .from('inbound_responses')
    .select(
      'id, from_phone, body_raw, message_sid, intent, keyword, received_at, person_pco_id, meta',
    )
    .eq('status', 'needs_callback')
    .order('received_at', { ascending: true })
    .limit(config.batchSize ?? 100);
  if (error) throw new Error(`inbound_responses sweep failed: ${error.message}`);

  const rows = (data ?? []) as PendingRow[];

  for (const row of rows) {
    // Skip rows already processed (meta.processed_at present).
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    if (meta['processed_at']) continue;
    result.examined++;

    if (!config.pcoWriteEnabled || !config.writer) {
      // Flag off → leave in the queue for a human. This is Phase F behavior.
      result.skippedDisabled++;
      continue;
    }

    // Atomic claim: only one runner should ever do the expensive PCO work for
    // a row. UPDATE ... WHERE processing_started_at IS NULL succeeds for at
    // most one caller; the other gets a no-op + null result and skips.
    const { data: claim, error: claimErr } = await db
      .from('inbound_responses')
      .update({ processing_started_at: now.toISOString() })
      .eq('id', row.id)
      .is('processing_started_at', null)
      .select('id')
      .maybeSingle();
    if (claimErr) throw new Error(`inbound_responses claim failed: ${claimErr.message}`);
    if (!claim) continue; // another runner already claimed this row

    // 1. Resolve the person: dedup against the local mirror by phone, else
    //    create in PCO and mirror locally.
    const local = await findLocalPersonByPhone(db, row.from_phone);
    let personPcoId: string;
    let pcoAction: 'linked_existing' | 'created';
    if (local) {
      personPcoId = local;
      pcoAction = 'linked_existing';
      result.linkedExisting++;
    } else {
      const created = await config.writer.createPersonWithPhone({
        phone: row.from_phone,
        note: `Texted "${row.keyword}" to Champion on ${row.received_at}. Inbound: ${row.body_raw}`,
      });
      await mirrorNewPerson(db, {
        pcoId: created.pcoId,
        phonePcoId: created.phonePcoId,
        phone: row.from_phone,
        keyword: row.keyword,
        body: row.body_raw,
        now,
      });
      personPcoId = created.pcoId;
      pcoAction = 'created';
      result.pcoCreated++;
    }

    // Link the response to the person immediately so a retry never re-creates.
    await db
      .from('inbound_responses')
      .update({ person_pco_id: personPcoId, updated_at: now.toISOString() })
      .eq('id', row.id);

    // 2. Free-text scan.
    const scan = scanFreeText(row.body_raw);

    // 3. Crisis → pastoral override. Raise a flag; enrollment self-blocks.
    if (scan.crisis) {
      await raiseCrisisFlag(db, personPcoId, row.body_raw, now);
      result.crisisFlagged++;
    }

    // 4. Record the broadcast_response engagement signal (idempotent).
    const broadcastSignalId = await ensureSignal(db, {
      personPcoId,
      kind: 'broadcast_response',
      occurredAt: row.received_at,
      sourcePcoId: row.message_sid,
      payload: { keyword: row.keyword, intent: row.intent, channel: 'sms', body: row.body_raw },
    });

    // 5. Prayer → open the ADR-004 path in parallel by creating a
    //    prayer_request signal. It surfaces in the precious-cargo queue; the
    //    welcome already promised a human, so we don't send a second ack here.
    if (scan.prayer && !scan.crisis) {
      await ensureSignal(db, {
        personPcoId,
        kind: 'prayer_request',
        occurredAt: row.received_at,
        sourcePcoId: row.message_sid,
        payload: { channel: 'sms', content: row.body_raw, source: 'broadcast_response' },
      });
      result.prayerSignals++;
    }

    if (scan.salvation) result.salvationFlagged++;

    // 6. Enroll the 21-day journey (skips Touch 1). enrollGuest self-blocks if
    //    a pastoral_flag is active (e.g. the crisis flag we may have just set).
    const enrollment = await enrollGuest(db, {
      personPcoId,
      signalId: broadcastSignalId,
      enrollmentKind: 'broadcast_response',
      now: () => now,
    });
    if (enrollment.outcome === 'enrolled') result.enrolled++;

    // 7. Stamp processed.
    await db
      .from('inbound_responses')
      .update({
        meta: {
          ...meta,
          processed_at: now.toISOString(),
          pco_action: pcoAction,
          scan: scan.matched as unknown as Json,
          salvation: scan.salvation,
          prayer: scan.prayer,
          crisis: scan.crisis,
          enrollment: enrollment.outcome,
        } as Json,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id);
    result.processed++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Last-10-digits phone match against the local mirror. */
async function findLocalPersonByPhone(db: Db, e164: string): Promise<string | null> {
  const target = last10(e164);
  if (!target) return null;
  const { data, error } = await db.from('phone_numbers').select('number, person_pco_id');
  if (error) throw new Error(`phone_numbers scan failed: ${error.message}`);
  for (const r of data ?? []) {
    if (last10(r.number as string) === target) return r.person_pco_id as string;
  }
  return null;
}

function last10(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function mirrorNewPerson(
  db: Db,
  args: {
    pcoId: string;
    phonePcoId: string;
    phone: string;
    keyword: string;
    body: string;
    now: Date;
  },
): Promise<void> {
  const nowIso = args.now.toISOString();
  const { error: pErr } = await db.from('people').insert({
    pco_id: args.pcoId,
    first_name: 'Friend',
    raw_attributes: {
      source: 'broadcast_response',
      inbound_keyword: args.keyword,
      created_by: 'mlis',
      first_message: args.body,
    } as Json,
    pco_created_at: nowIso,
    synced_at: nowIso,
  });
  if (pErr) throw new Error(`people mirror insert failed: ${pErr.message}`);

  const { error: phErr } = await db.from('phone_numbers').insert({
    pco_id: args.phonePcoId,
    person_pco_id: args.pcoId,
    number: args.phone,
    location: 'Mobile',
    is_primary: true,
  });
  if (phErr) throw new Error(`phone_numbers mirror insert failed: ${phErr.message}`);
}

async function raiseCrisisFlag(
  db: Db,
  personPcoId: string,
  body: string,
  now: Date,
): Promise<void> {
  // Don't double-raise if an active crisis flag already exists.
  const { data: existing } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .eq('reason', 'crisis')
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { error } = await db.from('pastoral_flags').insert({
    person_pco_id: personPcoId,
    reason: 'crisis',
    notes: `Crisis language in inbound broadcast text: "${body}". Automation paused — needs immediate human contact.`,
    raised_at: now.toISOString(),
  });
  if (error) throw new Error(`pastoral_flags insert failed: ${error.message}`);
}

async function ensureSignal(
  db: Db,
  args: {
    personPcoId: string;
    kind: 'broadcast_response' | 'prayer_request';
    occurredAt: string;
    sourcePcoId: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const { data: existing, error: lErr } = await db
    .from('engagement_signals')
    .select('id')
    .eq('person_pco_id', args.personPcoId)
    .eq('kind', args.kind)
    .eq('source_pco_id', args.sourcePcoId)
    .maybeSingle();
  if (lErr) throw new Error(`engagement_signals lookup failed: ${lErr.message}`);
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('engagement_signals')
    .insert({
      person_pco_id: args.personPcoId,
      kind: args.kind,
      occurred_at: args.occurredAt,
      source_pco_id: args.sourcePcoId,
      payload: args.payload as Json,
    })
    .select('id')
    .single();
  if (error) throw new Error(`engagement_signals insert failed: ${error.message}`);
  return data.id as string;
}
