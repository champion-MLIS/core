/**
 * Prayer Response Agent — orchestrator.
 *
 * Triggered by an engagement_signal with kind='prayer_request' that is
 * classified personal_or_sensitive. Per ADR-004 the agent:
 *
 *   1. Creates a prayer_requests row from the signal.
 *   2. Drafts a calibrated acknowledgment (no scripture, no resources,
 *      no characterization) — see prompts.ts and draft.ts.
 *   3. Voice-checks the draft.
 *   4. If constraint scan flags anything, holds without sending.
 *   5. Sends the acknowledgment via the original channel.
 *   6. Inserts the Day-11 contextual reference touch into the journey
 *      (if a journey exists for this person).
 *   7. Logs the alert assignment (PCPOC defaults to Becky).
 *   8. Returns telemetry the caller surfaces to the dashboard.
 *
 * Pastoral override takes precedence over this agent — if a pastoral_flag
 * is active for the person, the agent yields. The acknowledgment is NOT
 * sent and no contextual reference touch is inserted.
 */

import type { ClaudeClient } from '../claude.ts';
import { loadVoiceRules } from '../voice-rules.ts';
import { checkVoice, type VoiceCheckResult } from '../voice-check.ts';
import { draftAcknowledgment, type AckDraftResult } from './draft.ts';
import type { Sender } from './sender.ts';
import { insertContextualReferenceTouch } from './contextual-reference.ts';
import type {
  Db,
  EngagementSignalRow,
  Json,
  PersonRow,
  PrayerRequestRow,
  PrayerRequestChannel,
  StaffProfileRow,
} from '../../db/index.ts';

export interface PrayerResponseConfig {
  draftModel: string;
  voiceCheckModel: string;
  /** Window the body promises a human response within — surfaced in draft. */
  followUpWindow?: string;
  /** Skip sending the actual message (still creates prayer_request + alert). */
  dryRun?: boolean;
  now?: () => Date;
}

export type ProcessOutcome =
  | 'acknowledged'
  | 'held_constraint_violation'
  | 'held_voice_check_failed'
  | 'held_no_contact'
  | 'blocked_pastoral_flag'
  | 'already_captured';

export interface PrayerResponseResult {
  outcome: ProcessOutcome;
  prayerRequestId: string | null;
  acknowledgmentSent: boolean;
  contextualReferenceTouchId: string | null;
  pcpocAssignedTo: string | null;
  concerns: string[];
}

/**
 * Process a single prayer_request engagement signal.
 *
 * The signal is provided pre-fetched so callers (CLI, dashboard route, or
 * a future poller) can do their own filtering and idempotency tracking.
 */
export async function processPrayerSignal(
  db: Db,
  claude: ClaudeClient,
  sender: Sender,
  signal: EngagementSignalRow,
  config: PrayerResponseConfig,
): Promise<PrayerResponseResult> {
  const now = (config.now ?? (() => new Date()))();
  const concerns: string[] = [];

  // 1. Pastoral override re-check — supreme.
  const { data: flag, error: fErr } = await db
    .from('pastoral_flags')
    .select('id, reason')
    .eq('person_pco_id', signal.person_pco_id)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (fErr) throw new Error(`pastoral_flags lookup failed: ${fErr.message}`);
  if (flag) {
    return {
      outcome: 'blocked_pastoral_flag',
      prayerRequestId: null,
      acknowledgmentSent: false,
      contextualReferenceTouchId: null,
      pcpocAssignedTo: null,
      concerns: [`pastoral_flag ${flag.id} active (${flag.reason})`],
    };
  }

  // 2. Idempotency — has this signal already been captured?
  const { data: existing, error: eErr } = await db
    .from('prayer_requests')
    .select('id, acknowledged_at')
    .eq('source_signal_id', signal.id)
    .maybeSingle();
  if (eErr) throw new Error(`prayer_requests lookup failed: ${eErr.message}`);
  if (existing) {
    return {
      outcome: 'already_captured',
      prayerRequestId: existing.id as string,
      acknowledgmentSent: existing.acknowledged_at !== null,
      contextualReferenceTouchId: null,
      pcpocAssignedTo: null,
      concerns: [],
    };
  }

  // 3. Resolve channel + content from the signal payload.
  const captured = extractFromSignal(signal);
  const channel: PrayerRequestChannel = captured.channel;
  const content = captured.content;

  // 4. PCPOC routing — pick the default-marked staff profile, fall back to
  //    any pastoral_care alert recipient, fall back to null.
  const pcpoc = await fetchDefaultPcpoc(db);
  const pcpocEmail = pcpoc?.email ?? null;
  const pcpocFirstName = pcpoc?.full_name.split(' ')[0] ?? 'someone from our team';

  // 5. Person mirror — required for name in the acknowledgment.
  const person = await fetchPerson(db, signal.person_pco_id);
  const name = person
    ? (person.preferred_name ?? person.first_name ?? '(friend)')
    : '(friend)';

  // 6. Create the prayer_requests row before drafting so we have an id to
  //    reference and so the precious_cargo_refs array stays in sync.
  const { data: created, error: cErr } = await db
    .from('prayer_requests')
    .insert({
      person_pco_id: signal.person_pco_id,
      captured_at: signal.occurred_at,
      source_signal_id: signal.id,
      content,
      channel,
      status: 'open',
      assigned_to: pcpocEmail,
    })
    .select('*')
    .single();
  if (cErr) throw new Error(`prayer_requests insert failed: ${cErr.message}`);
  if (!created) throw new Error('prayer_requests insert returned no row');
  const prayerRequest = created as PrayerRequestRow;

  // 7. Append the id to people.precious_cargo_refs (idempotent dedupe).
  if (person) {
    const existingRefs = person.precious_cargo_refs ?? [];
    if (!existingRefs.includes(prayerRequest.id)) {
      const nextRefs = [...existingRefs, prayerRequest.id];
      const { error: uErr } = await db
        .from('people')
        .update({ precious_cargo_refs: nextRefs })
        .eq('pco_id', person.pco_id);
      if (uErr) throw new Error(`people precious_cargo_refs update failed: ${uErr.message}`);
    }
  }

  // 8. Draft the acknowledgment.
  const voiceRules = await loadVoiceRules();
  const draftResult: AckDraftResult = await draftAcknowledgment(
    claude,
    {
      name,
      channel,
      pcpoc_first_name: pcpocFirstName,
      follow_up_window: config.followUpWindow ?? 'within 24 hours',
    },
    voiceRules,
    config.draftModel,
  );

  if (draftResult.constraintConcerns.length > 0) {
    // The model violated an inviolable rule. Hold; do not send. Surface
    // for human review.
    concerns.push(...draftResult.constraintConcerns);
    await stampAckMetadata(db, prayerRequest.id, {
      draft: draftResult.draft as unknown as Json,
      constraint_concerns: draftResult.constraintConcerns,
      held_at: now.toISOString(),
      held_reason: 'constraint_violation',
    });
    return {
      outcome: 'held_constraint_violation',
      prayerRequestId: prayerRequest.id,
      acknowledgmentSent: false,
      contextualReferenceTouchId: null,
      pcpocAssignedTo: pcpocEmail,
      concerns,
    };
  }

  // 9. Voice check.
  const voice: VoiceCheckResult = await checkVoice(
    claude,
    {
      email: draftResult.draft.email,
      sms: draftResult.draft.sms,
      voice_notes: draftResult.draft.voice_notes,
    },
    voiceRules,
    config.voiceCheckModel,
  );

  if (voice.check.overall !== 'pass') {
    concerns.push(...voice.check.concerns);
    await stampAckMetadata(db, prayerRequest.id, {
      draft: draftResult.draft as unknown as Json,
      voice_check: voice.check as unknown as Json,
      held_at: now.toISOString(),
      held_reason: 'voice_check_failed',
    });
    return {
      outcome: 'held_voice_check_failed',
      prayerRequestId: prayerRequest.id,
      acknowledgmentSent: false,
      contextualReferenceTouchId: null,
      pcpocAssignedTo: pcpocEmail,
      concerns,
    };
  }

  // 10. Resolve recipient + send.
  let acknowledgmentText: string | null = null;
  let sentResult: { vendor: string; vendor_id: string; recipient: string } | null = null;

  if (!config.dryRun) {
    if (channel === 'sms' && draftResult.draft.sms?.body) {
      const phone = await fetchPrimaryPhone(db, signal.person_pco_id);
      if (!phone) {
        await stampAckMetadata(db, prayerRequest.id, {
          draft: draftResult.draft as unknown as Json,
          held_at: now.toISOString(),
          held_reason: 'no_phone_for_sms',
        });
        return {
          outcome: 'held_no_contact',
          prayerRequestId: prayerRequest.id,
          acknowledgmentSent: false,
          contextualReferenceTouchId: null,
          pcpocAssignedTo: pcpocEmail,
          concerns: ['No phone number on file for SMS ack.'],
        };
      }
      const sent = await sender.sendSms({ to: phone, body: draftResult.draft.sms.body });
      acknowledgmentText = draftResult.draft.sms.body;
      sentResult = { vendor: sent.vendor, vendor_id: sent.vendor_id, recipient: sent.recipient };
    } else if (draftResult.draft.email?.subject && draftResult.draft.email.body) {
      const email = await fetchPrimaryEmail(db, signal.person_pco_id);
      if (!email) {
        await stampAckMetadata(db, prayerRequest.id, {
          draft: draftResult.draft as unknown as Json,
          held_at: now.toISOString(),
          held_reason: 'no_email_for_email',
        });
        return {
          outcome: 'held_no_contact',
          prayerRequestId: prayerRequest.id,
          acknowledgmentSent: false,
          contextualReferenceTouchId: null,
          pcpocAssignedTo: pcpocEmail,
          concerns: ['No email on file for email ack.'],
        };
      }
      const sent = await sender.sendEmail({
        to: email,
        subject: draftResult.draft.email.subject,
        body: draftResult.draft.email.body,
      });
      acknowledgmentText = `${draftResult.draft.email.subject}\n\n${draftResult.draft.email.body}`;
      sentResult = { vendor: sent.vendor, vendor_id: sent.vendor_id, recipient: sent.recipient };
    } else {
      // Draft has nothing usable for any channel.
      await stampAckMetadata(db, prayerRequest.id, {
        draft: draftResult.draft as unknown as Json,
        held_at: now.toISOString(),
        held_reason: 'empty_draft',
      });
      return {
        outcome: 'held_no_contact',
        prayerRequestId: prayerRequest.id,
        acknowledgmentSent: false,
        contextualReferenceTouchId: null,
        pcpocAssignedTo: pcpocEmail,
        concerns: ['Draft contained no usable body for any channel.'],
      };
    }
  }

  // 11. Stamp acknowledgment + log communication.
  const acknowledgedAt = now.toISOString();
  await db
    .from('prayer_requests')
    .update({
      acknowledged_at: acknowledgedAt,
      acknowledgment_text: acknowledgmentText,
      status: 'in_followup',
    })
    .eq('id', prayerRequest.id);

  if (!config.dryRun && sentResult) {
    await db.from('communications').insert({
      person_pco_id: signal.person_pco_id,
      channel: channel === 'email' || channel === 'connect_card' ? 'email' : 'sms',
      template_used: 'prayer_response_ack',
      sent_at: acknowledgedAt,
      approved_by: 'prayer_response_agent',
      content_summary: acknowledgmentText?.slice(0, 160) ?? null,
      payload: {
        prayer_request_id: prayerRequest.id,
        recipient: sentResult.recipient,
        vendor_response: { vendor: sentResult.vendor, id: sentResult.vendor_id },
      } as unknown as Json,
    });
  }

  // 12. Insert the contextual reference touch on the active journey (if any).
  const ctxRef = await insertContextualReferenceTouch(db, {
    personPcoId: signal.person_pco_id,
    prayerRequestId: prayerRequest.id,
    now: () => now,
  });

  return {
    outcome: 'acknowledged',
    prayerRequestId: prayerRequest.id,
    acknowledgmentSent: !config.dryRun,
    contextualReferenceTouchId: ctxRef.touchId,
    pcpocAssignedTo: pcpocEmail,
    concerns,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFromSignal(signal: EngagementSignalRow): {
  channel: PrayerRequestChannel;
  content: string;
} {
  const p = signal.payload as Record<string, Json> | null;
  let channelHint: PrayerRequestChannel = 'connect_card';
  let content = '';

  if (p && typeof p === 'object' && !Array.isArray(p)) {
    if (typeof p.channel === 'string') {
      const c = p.channel as string;
      if (c === 'email' || c === 'sms' || c === 'connect_card' || c === 'other') {
        channelHint = c;
      }
    }
    if (typeof p.content === 'string') content = p.content;
    else if (typeof p.message === 'string') content = p.message;
    else if (typeof p.notes === 'string') content = p.notes;
    else if (typeof p.response === 'string') content = p.response;
    else if (p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields)) {
      const f = p.fields as Record<string, Json>;
      const candidates = [f.content, f.message, f.notes, f.response, f.prayer_request];
      for (const c of candidates) {
        if (typeof c === 'string' && c.trim()) {
          content = c.trim();
          break;
        }
      }
    }
  }

  if (!content) content = '(no free-text content captured from signal)';
  return { channel: channelHint, content };
}

async function fetchDefaultPcpoc(db: Db): Promise<StaffProfileRow | null> {
  // Default PCPOC first.
  const { data: def, error: dErr } = await db
    .from('staff_profiles')
    .select('*')
    .eq('is_default_pcpoc', true)
    .limit(1)
    .maybeSingle();
  if (dErr) throw new Error(`staff_profiles lookup failed: ${dErr.message}`);
  if (def) return def as StaffProfileRow;

  // Fall back to any pcpoc_alert_recipient.
  const { data: any, error: aErr } = await db
    .from('staff_profiles')
    .select('*')
    .eq('pcpoc_alert_recipient', true)
    .limit(1)
    .maybeSingle();
  if (aErr) throw new Error(`staff_profiles fallback lookup failed: ${aErr.message}`);
  return (any as StaffProfileRow | null) ?? null;
}

async function fetchPerson(db: Db, pcoId: string): Promise<PersonRow | null> {
  const { data, error } = await db
    .from('people')
    .select('*')
    .eq('pco_id', pcoId)
    .maybeSingle();
  if (error) throw new Error(`people fetch failed: ${error.message}`);
  return (data as PersonRow | null) ?? null;
}

async function fetchPrimaryEmail(db: Db, personPcoId: string): Promise<string | null> {
  const { data, error } = await db
    .from('emails')
    .select('address, is_primary')
    .eq('person_pco_id', personPcoId)
    .eq('blocked', false)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`emails fetch failed: ${error.message}`);
  return (data?.address as string | null) ?? null;
}

async function fetchPrimaryPhone(db: Db, personPcoId: string): Promise<string | null> {
  const { data, error } = await db
    .from('phone_numbers')
    .select('number, is_primary')
    .eq('person_pco_id', personPcoId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`phone_numbers fetch failed: ${error.message}`);
  return (data?.number as string | null) ?? null;
}

async function stampAckMetadata(
  db: Db,
  prayerRequestId: string,
  metadata: Record<string, Json>,
): Promise<void> {
  // Use pcpoc_response_notes as the metadata field for held drafts since
  // we don't have a dedicated json column. Empty for clean acks; populated
  // when held. The dashboard UI surfaces this to the PCPOC for review.
  const note = JSON.stringify(metadata);
  await db
    .from('prayer_requests')
    .update({ pcpoc_response_notes: note })
    .eq('id', prayerRequestId);
}
