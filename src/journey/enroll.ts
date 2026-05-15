/**
 * Guest journey enrollment.
 *
 * Given a person + an engagement signal that should kick off a follow-up
 * (currently: connect_card, first_giving, or child_checkin), create a
 * guest_journeys row and schedule all 8 touches.
 *
 * Idempotent: a person may only have ONE active journey per
 * workflow_version at a time. A re-enrollment attempt on an active
 * journey returns the existing journey unchanged.
 *
 * Pastoral override gate: if the person has an active pastoral_flag, the
 * enrollment short-circuits and creates NO journey. The Pastoral Override
 * Monitor owns the situation; nothing automated proceeds.
 */

import type { Db, JourneyRow, TouchInsert } from '../db/index.ts';
import { TOUCH_TEMPLATE, computeTouchTiming } from './touch-template.ts';

export type EnrollmentKind = 'connect_card' | 'first_giving' | 'child_checkin';

const WORKFLOW_VERSION = '21-day-v1';

export interface EnrollOptions {
  personPcoId: string;
  signalId: string | null;
  enrollmentKind: EnrollmentKind;
  /** Override "now" — useful for tests + back-filling. Default: Date.now(). */
  now?: () => Date;
}

export type EnrollResult =
  | { outcome: 'enrolled'; journey: JourneyRow; touchCount: number }
  | { outcome: 'already_active'; journey: JourneyRow }
  | { outcome: 'blocked_pastoral_flag'; reason: string }
  | { outcome: 'person_not_mirrored'; reason: string };

export async function enrollGuest(db: Db, opts: EnrollOptions): Promise<EnrollResult> {
  const now = opts.now ?? (() => new Date());
  const nowDate = now();

  // 1. Person must exist in our mirror (the signal poller already enforces this,
  //    but guard here too for direct CLI/test usage).
  const { data: person, error: personErr } = await db
    .from('people')
    .select('pco_id')
    .eq('pco_id', opts.personPcoId)
    .maybeSingle();
  if (personErr) throw new Error(`people lookup failed: ${personErr.message}`);
  if (!person) {
    return {
      outcome: 'person_not_mirrored',
      reason: `Person ${opts.personPcoId} is not in the people mirror. Run intake:poll first.`,
    };
  }

  // 2. Pastoral override re-check.
  const { data: flag, error: flagErr } = await db
    .from('pastoral_flags')
    .select('id, reason')
    .eq('person_pco_id', opts.personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (flagErr) throw new Error(`pastoral_flags lookup failed: ${flagErr.message}`);
  if (flag) {
    return {
      outcome: 'blocked_pastoral_flag',
      reason: `Active pastoral_flag for person ${opts.personPcoId} (reason: ${flag.reason}). Enrollment blocked.`,
    };
  }

  // 3. Already in an active journey? Don't double-enroll.
  const { data: existing, error: existingErr } = await db
    .from('guest_journeys')
    .select('*')
    .eq('person_pco_id', opts.personPcoId)
    .eq('workflow_version', WORKFLOW_VERSION)
    .eq('status', 'active')
    .maybeSingle();
  if (existingErr) throw new Error(`guest_journeys lookup failed: ${existingErr.message}`);
  if (existing) {
    return { outcome: 'already_active', journey: existing as JourneyRow };
  }

  // 4. Create the journey.
  const { data: created, error: createErr } = await db
    .from('guest_journeys')
    .insert({
      person_pco_id: opts.personPcoId,
      enrollment_signal_id: opts.signalId,
      enrollment_kind: opts.enrollmentKind,
      enrolled_at: nowDate.toISOString(),
      workflow_version: WORKFLOW_VERSION,
      status: 'active',
    })
    .select('*')
    .single();
  if (createErr) throw new Error(`guest_journeys insert failed: ${createErr.message}`);
  if (!created) throw new Error('guest_journeys insert returned no row');

  const journey = created as JourneyRow;

  // 5. Schedule the 8 touches.
  const touchRows: TouchInsert[] = TOUCH_TEMPLATE.map((t) => {
    const { scheduled_for, due_at } = computeTouchTiming(nowDate, t);
    return {
      journey_id: journey.id,
      touch_number: t.touch_number,
      kind: t.kind,
      owner_role: t.owner_role,
      is_recovery: t.is_recovery,
      scheduled_for: scheduled_for.toISOString(),
      due_at: due_at.toISOString(),
      status: 'pending',
      payload: { label: t.label, guidance: t.guidance },
    };
  });

  const { error: touchesErr } = await db.from('touches').insert(touchRows);
  if (touchesErr) throw new Error(`touches insert failed: ${touchesErr.message}`);

  return { outcome: 'enrolled', journey, touchCount: touchRows.length };
}
