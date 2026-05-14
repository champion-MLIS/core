/**
 * Signal poller — Step 3 of the Guest Follow-Up workflow.
 *
 * For each PCO form that classifies as a trigger signal (connect_card or
 * prayer_request):
 *   1. Read the watermark for that form
 *   2. Pull form submissions newer than the watermark
 *   3. For each submission:
 *        a. Resolve the person_id from the submission relationship
 *        b. Skip if person isn't yet in our mirror (intake will catch them next poll)
 *        c. Skip if person has an active pastoral_flag (override stop)
 *        d. Insert (or look up) an engagement_signal row
 *        e. If person is currently at 'guest' stage, enqueue a followup
 *   4. Advance the watermark
 *
 * Idempotency:
 *   - engagement_signals: UNIQUE (person_pco_id, kind, source_pco_id)
 *   - followup_queue:     UNIQUE (person_pco_id, workflow, trigger_signal_id)
 * Re-running the poller after a partial run is safe and produces zero net writes.
 *
 * Future work (Step 3.1+): polling PCO Giving for first-time gifts and PCO
 * Check-Ins for child check-ins. Same shape as this module, different sources.
 */

import type { PcoClient } from '../pco/client.ts';
import { listForms, listFormSubmissions, submissionPersonId } from '../pco/forms.ts';
import type { Db } from '../db/index.ts';
import { getWatermark, setWatermark } from './watermarks.ts';
import { classifyForm, type Classification } from './signal-classifier.ts';

const SOURCE = 'pco';
const WORKFLOW = 'guest-follow-up';

type SignalKind = 'connect_card' | 'prayer_request';

export interface PerFormResult {
  formId: string;
  formName: string;
  classifiedAs: Classification;
  submissionsExamined: number;
  signalsRecorded: number;
  signalsAlreadyKnown: number;
  followupsEnqueued: number;
  peopleSkippedNotMirrored: number;
  peopleSkippedFlagged: number;
  peopleSkippedNotGuest: number;
  watermarkBefore: string | null;
  watermarkAfter: string | null;
}

export interface SignalsPollResult {
  formsExamined: number;
  formsWithSignals: number;
  submissionsExamined: number;
  signalsRecorded: number;
  followupsEnqueued: number;
  peopleSkippedNotMirrored: number;
  peopleSkippedFlagged: number;
  byForm: PerFormResult[];
}

export interface SignalsPollOptions {
  /** Per-form page size. PCO max 100. */
  pageSize?: number;
  /** Cold-start lookback window. Default 90 days. */
  coldStartLookback?: { days: number };
  now?: () => Date;
}

export async function runSignalsPoll(
  db: Db,
  pco: PcoClient,
  opts: SignalsPollOptions = {},
): Promise<SignalsPollResult> {
  const { forms } = await listForms(pco);

  const targets: Array<{ form: (typeof forms)[number]; kind: SignalKind }> = [];
  for (const f of forms) {
    const name = typeof f.attributes.name === 'string' ? f.attributes.name : '';
    const k = classifyForm(f.id, name);
    if (k === 'connect_card' || k === 'prayer_request') {
      targets.push({ form: f, kind: k });
    }
  }

  const byForm: PerFormResult[] = [];
  for (const { form, kind } of targets) {
    const name = typeof form.attributes.name === 'string' ? form.attributes.name : '(unnamed)';
    const result = await pollOneForm(db, pco, form.id, name, kind, opts);
    byForm.push(result);
  }

  return {
    formsExamined: forms.length,
    formsWithSignals: targets.length,
    submissionsExamined: byForm.reduce((a, r) => a + r.submissionsExamined, 0),
    signalsRecorded: byForm.reduce((a, r) => a + r.signalsRecorded, 0),
    followupsEnqueued: byForm.reduce((a, r) => a + r.followupsEnqueued, 0),
    peopleSkippedNotMirrored: byForm.reduce((a, r) => a + r.peopleSkippedNotMirrored, 0),
    peopleSkippedFlagged: byForm.reduce((a, r) => a + r.peopleSkippedFlagged, 0),
    byForm,
  };
}

// ---------------------------------------------------------------------------
// Per-form poll
// ---------------------------------------------------------------------------

async function pollOneForm(
  db: Db,
  pco: PcoClient,
  formId: string,
  formName: string,
  kind: SignalKind,
  opts: SignalsPollOptions,
): Promise<PerFormResult> {
  const now = opts.now ?? (() => new Date());
  const pollStartedAt = now().toISOString();
  const resource = `form:${formId}`;

  const watermark = await getWatermark(db, { source: SOURCE, resource });
  const watermarkBefore = watermark?.last_seen_at ?? null;

  const cutoffMs = watermark
    ? Date.parse(watermark.last_seen_at)
    : now().getTime() - (opts.coldStartLookback?.days ?? 90) * 24 * 60 * 60 * 1000;
  const createdSince = new Date(cutoffMs).toISOString();

  const { submissions } = await listFormSubmissions(pco, formId, {
    perPage: opts.pageSize ?? 50,
    order: '-created_at',
    include: ['person'],
    createdSince,
  });

  // Process oldest-first so the watermark advances monotonically.
  const candidates = submissions
    .filter((s) => Date.parse(s.attributes.created_at) > cutoffMs)
    .sort(
      (a, b) =>
        Date.parse(a.attributes.created_at) - Date.parse(b.attributes.created_at),
    );

  let signalsRecorded = 0;
  let signalsAlreadyKnown = 0;
  let followupsEnqueued = 0;
  let peopleSkippedNotMirrored = 0;
  let peopleSkippedFlagged = 0;
  let peopleSkippedNotGuest = 0;
  let latestSeenAt = watermark?.last_seen_at ?? null;
  let latestSeenId = watermark?.last_seen_id ?? null;

  for (const sub of candidates) {
    const personPcoId = submissionPersonId(sub);
    if (!personPcoId) {
      // Submission with no person link — nothing actionable. Skip without
      // advancing the watermark so a later sync (when the person is attached)
      // can revisit. PCO occasionally creates the submission first.
      continue;
    }

    if (!(await personExists(db, personPcoId))) {
      peopleSkippedNotMirrored++;
      // Don't advance watermark for this submission — the next intake:poll
      // will add the person, and the next signal poll will pick it up.
      continue;
    }

    if (await hasActivePastoralFlag(db, personPcoId)) {
      peopleSkippedFlagged++;
      latestSeenAt = sub.attributes.created_at;
      latestSeenId = sub.id;
      continue;
    }

    const signal = await ensureSignal(db, {
      personPcoId,
      kind,
      occurredAt: sub.attributes.created_at,
      sourcePcoId: sub.id,
    });
    if (signal.isNew) signalsRecorded++;
    else signalsAlreadyKnown++;

    const enq = await enqueueFollowupIfGuest(db, {
      personPcoId,
      triggerSignalId: signal.id,
    });
    if (enq === 'enqueued') followupsEnqueued++;
    else if (enq === 'not-guest') peopleSkippedNotGuest++;

    latestSeenAt = sub.attributes.created_at;
    latestSeenId = sub.id;
  }

  if (latestSeenAt && latestSeenAt !== watermark?.last_seen_at) {
    await setWatermark(db, {
      source: SOURCE,
      resource,
      lastSeenAt: latestSeenAt,
      lastSeenId: latestSeenId,
      pollStartedAt,
      pollCompletedAt: now().toISOString(),
      recordsProcessed: signalsRecorded,
    });
  }

  return {
    formId,
    formName,
    classifiedAs: kind,
    submissionsExamined: submissions.length,
    signalsRecorded,
    signalsAlreadyKnown,
    followupsEnqueued,
    peopleSkippedNotMirrored,
    peopleSkippedFlagged,
    peopleSkippedNotGuest,
    watermarkBefore,
    watermarkAfter: latestSeenAt,
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function personExists(db: Db, personPcoId: string): Promise<boolean> {
  const { data, error } = await db
    .from('people')
    .select('pco_id')
    .eq('pco_id', personPcoId)
    .maybeSingle();
  if (error) throw new Error(`people lookup failed: ${error.message}`);
  return data !== null;
}

async function hasActivePastoralFlag(db: Db, personPcoId: string): Promise<boolean> {
  const { data, error } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`pastoral_flags lookup failed: ${error.message}`);
  return data !== null;
}

async function ensureSignal(
  db: Db,
  args: {
    personPcoId: string;
    kind: SignalKind;
    occurredAt: string;
    sourcePcoId: string;
  },
): Promise<{ id: string; isNew: boolean }> {
  // Look first — UNIQUE(person_pco_id, kind, source_pco_id) makes this reliable.
  const { data: existing, error: lookupErr } = await db
    .from('engagement_signals')
    .select('id')
    .eq('person_pco_id', args.personPcoId)
    .eq('kind', args.kind)
    .eq('source_pco_id', args.sourcePcoId)
    .maybeSingle();
  if (lookupErr) throw new Error(`engagement_signals lookup failed: ${lookupErr.message}`);
  if (existing) return { id: existing.id, isNew: false };

  const { data, error } = await db
    .from('engagement_signals')
    .insert({
      person_pco_id: args.personPcoId,
      kind: args.kind,
      occurred_at: args.occurredAt,
      source_pco_id: args.sourcePcoId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`engagement_signals insert failed: ${error.message}`);
  return { id: data.id, isNew: true };
}

type EnqueueResult = 'enqueued' | 'already-queued' | 'not-guest';

async function enqueueFollowupIfGuest(
  db: Db,
  args: { personPcoId: string; triggerSignalId: string },
): Promise<EnqueueResult> {
  const { data: person, error: personErr } = await db
    .from('people')
    .select('current_stage')
    .eq('pco_id', args.personPcoId)
    .single();
  if (personErr) throw new Error(`people stage lookup failed: ${personErr.message}`);
  if (person.current_stage !== 'guest') return 'not-guest';

  const { data: existing, error: existingErr } = await db
    .from('followup_queue')
    .select('id')
    .eq('person_pco_id', args.personPcoId)
    .eq('workflow', WORKFLOW)
    .eq('trigger_signal_id', args.triggerSignalId)
    .maybeSingle();
  if (existingErr) throw new Error(`followup_queue lookup failed: ${existingErr.message}`);
  if (existing) return 'already-queued';

  const { error } = await db.from('followup_queue').insert({
    person_pco_id: args.personPcoId,
    workflow: WORKFLOW,
    trigger_signal_id: args.triggerSignalId,
    status: 'pending',
  });
  if (error) throw new Error(`followup_queue insert failed: ${error.message}`);
  return 'enqueued';
}
