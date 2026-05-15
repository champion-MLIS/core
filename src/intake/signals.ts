/**
 * Signal poller — Step 3 of the Guest Follow-Up workflow.
 *
 * For each CMS form that classifies as a trigger signal (connect_card or
 * prayer_request):
 *   1. Read the watermark for that form
 *   2. Pull form submissions newer than the watermark via the CmsAdapter
 *   3. For each submission:
 *        a. Skip if person isn't yet in our mirror (intake will catch them next poll)
 *        b. Skip if person has an active pastoral_flag (override stop)
 *        c. Insert (or look up) an engagement_signal row
 *        d. If person is currently at 'guest' stage, enqueue a followup
 *        e. If signal kind is "enrolling" (connect_card today), enroll the
 *           person in a 21-day journey
 *   4. Advance the watermark
 *
 * Vendor-neutral: takes a CmsAdapter. Future CMSes plug in without changing
 * this module.
 *
 * Idempotency:
 *   - engagement_signals: UNIQUE (person_pco_id, kind, source_pco_id)
 *   - followup_queue:     UNIQUE (person_pco_id, workflow, trigger_signal_id)
 *   - guest_journeys:     partial UNIQUE (person, version) WHERE active
 * Re-running the poller after a partial run is safe and produces zero net writes.
 */

import type { CmsAdapter } from '../cms/index.ts';
import type { Db } from '../db/index.ts';
import { getWatermark, setWatermark } from './watermarks.ts';
import { classifyForm, type Classification } from './signal-classifier.ts';
import { enrollGuest, type EnrollmentKind } from '../journey/index.ts';

const SOURCE = 'cms';
const WORKFLOW = 'guest-follow-up';

type SignalKind = 'connect_card' | 'prayer_request';

/**
 * Which signal kinds enroll a person into the 21-day journey when fired.
 * prayer_request does NOT auto-enroll — those flow to pastoral staff
 * directly and the journey decision is made by a human.
 */
const ENROLLING_SIGNAL_KINDS = new Set<SignalKind>(['connect_card']);

export interface PerFormResult {
  formId: string;
  formName: string;
  classifiedAs: Classification;
  submissionsExamined: number;
  signalsRecorded: number;
  signalsAlreadyKnown: number;
  followupsEnqueued: number;
  journeysEnrolled: number;
  journeysAlreadyActive: number;
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
  journeysEnrolled: number;
  peopleSkippedNotMirrored: number;
  peopleSkippedFlagged: number;
  byForm: PerFormResult[];
}

export interface SignalsPollOptions {
  pageSize?: number;
  coldStartLookback?: { days: number };
  now?: () => Date;
}

export async function runSignalsPoll(
  db: Db,
  cms: CmsAdapter,
  opts: SignalsPollOptions = {},
): Promise<SignalsPollResult> {
  const forms = await cms.listForms();

  const targets: Array<{ formId: string; formName: string; kind: SignalKind }> = [];
  for (const f of forms) {
    const k = classifyForm(f.cms_id, f.name);
    if (k === 'connect_card' || k === 'prayer_request') {
      targets.push({ formId: f.cms_id, formName: f.name, kind: k });
    }
  }

  const byForm: PerFormResult[] = [];
  for (const t of targets) {
    const result = await pollOneForm(db, cms, t.formId, t.formName, t.kind, opts);
    byForm.push(result);
  }

  return {
    formsExamined: forms.length,
    formsWithSignals: targets.length,
    submissionsExamined: byForm.reduce((a, r) => a + r.submissionsExamined, 0),
    signalsRecorded: byForm.reduce((a, r) => a + r.signalsRecorded, 0),
    followupsEnqueued: byForm.reduce((a, r) => a + r.followupsEnqueued, 0),
    journeysEnrolled: byForm.reduce((a, r) => a + r.journeysEnrolled, 0),
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
  cms: CmsAdapter,
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

  const submissions = await cms.listFormSubmissions(formId, {
    per_page: opts.pageSize ?? 50,
    order: '-created_at',
    created_since: createdSince,
  });

  // Process oldest-first so the watermark advances monotonically.
  const candidates = submissions
    .filter((s) => Date.parse(s.created_at) > cutoffMs)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  let signalsRecorded = 0;
  let signalsAlreadyKnown = 0;
  let followupsEnqueued = 0;
  let journeysEnrolled = 0;
  let journeysAlreadyActive = 0;
  let peopleSkippedNotMirrored = 0;
  let peopleSkippedFlagged = 0;
  let peopleSkippedNotGuest = 0;
  let latestSeenAt = watermark?.last_seen_at ?? null;
  let latestSeenId = watermark?.last_seen_id ?? null;

  for (const sub of candidates) {
    const personPcoId = sub.person_cms_id;
    if (!personPcoId) {
      // Submission with no person link — nothing actionable. Don't advance
      // watermark so a later sync (when the person is attached) can revisit.
      continue;
    }

    if (!(await personExists(db, personPcoId))) {
      peopleSkippedNotMirrored++;
      continue;
    }

    if (await hasActivePastoralFlag(db, personPcoId)) {
      peopleSkippedFlagged++;
      latestSeenAt = sub.created_at;
      latestSeenId = sub.cms_id;
      continue;
    }

    const signal = await ensureSignal(db, {
      personPcoId,
      kind,
      occurredAt: sub.created_at,
      sourcePcoId: sub.cms_id,
    });
    if (signal.isNew) signalsRecorded++;
    else signalsAlreadyKnown++;

    const enq = await enqueueFollowupIfGuest(db, {
      personPcoId,
      triggerSignalId: signal.id,
    });
    if (enq === 'enqueued') followupsEnqueued++;
    else if (enq === 'not-guest') peopleSkippedNotGuest++;

    // 21-day journey enrollment (only for connect_card today).
    if (ENROLLING_SIGNAL_KINDS.has(kind)) {
      const enrollResult = await enrollGuest(db, {
        personPcoId,
        signalId: signal.id,
        enrollmentKind: kind as EnrollmentKind,
        now: opts.now ?? (() => new Date()),
      });
      if (enrollResult.outcome === 'enrolled') journeysEnrolled++;
      else if (enrollResult.outcome === 'already_active') journeysAlreadyActive++;
    }

    latestSeenAt = sub.created_at;
    latestSeenId = sub.cms_id;
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
    journeysEnrolled,
    journeysAlreadyActive,
    peopleSkippedNotMirrored,
    peopleSkippedFlagged,
    peopleSkippedNotGuest,
    watermarkBefore,
    watermarkAfter: latestSeenAt,
  };
}

// ---------------------------------------------------------------------------
// DB helpers (unchanged from prior version)
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
