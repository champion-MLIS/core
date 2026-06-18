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
 *
 * Volunteer continuity (Part 1.3): at enrollment, pick a connections
 * volunteer and a lay volunteer from the active pool by lowest load.
 * Touches whose owner_role is `connections_volunteer` (1, 5, 7) route to
 * the same volunteer for the whole journey; same for the lay volunteer
 * on Touch 4. Empty pool → NULL assignment, role-based routing applies
 * until pools are populated.
 */

import type { Db, JourneyRow, TouchInsert, VolunteerRow } from '../db/index.ts';
import { TOUCH_TEMPLATE, computeTouchTiming } from './touch-template.ts';
import {
  pickVolunteer,
  incrementVolunteerLoad,
  getVolunteer,
} from './volunteers.ts';

export type EnrollmentKind =
  | 'connect_card'
  | 'first_giving'
  | 'child_checkin'
  | 'broadcast_response';

const WORKFLOW_VERSION = '21-day-v1';

export interface EnrollOptions {
  personPcoId: string;
  signalId: string | null;
  enrollmentKind: EnrollmentKind;
  /** Override "now" — useful for tests + back-filling. Default: Date.now(). */
  now?: () => Date;
}

export type EnrollResult =
  | {
      outcome: 'enrolled';
      journey: JourneyRow;
      touchCount: number;
      connectionsVolunteer: VolunteerRow | null;
      layVolunteer: VolunteerRow | null;
    }
  | { outcome: 'already_active'; journey: JourneyRow }
  | { outcome: 'blocked_pastoral_flag'; reason: string }
  | { outcome: 'person_not_mirrored'; reason: string };

export async function enrollGuest(db: Db, opts: EnrollOptions): Promise<EnrollResult> {
  const now = opts.now ?? (() => new Date());
  const nowDate = now();

  // 1. Person must exist in our mirror.
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
    .select('id')
    .eq('person_pco_id', opts.personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (flagErr) throw new Error(`pastoral_flags lookup failed: ${flagErr.message}`);
  if (flag) {
    return {
      outcome: 'blocked_pastoral_flag',
      reason: `Active pastoral_flag for person ${opts.personPcoId}. Enrollment blocked.`,
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

  // 4. Pick volunteers from the pool (NULL if empty pool).
  const connectionsVol = await pickVolunteer(db, 'connections');
  const layVol = await pickVolunteer(db, 'lay');

  // 5. Create the journey with volunteer assignments.
  const { data: created, error: createErr } = await db
    .from('guest_journeys')
    .insert({
      person_pco_id: opts.personPcoId,
      enrollment_signal_id: opts.signalId,
      enrollment_kind: opts.enrollmentKind,
      enrolled_at: nowDate.toISOString(),
      workflow_version: WORKFLOW_VERSION,
      status: 'active',
      assigned_connections_volunteer_id: connectionsVol?.id ?? null,
      assigned_lay_volunteer_id: layVol?.id ?? null,
    })
    .select('*')
    .single();
  if (createErr) throw new Error(`guest_journeys insert failed: ${createErr.message}`);
  if (!created) throw new Error('guest_journeys insert returned no row');

  const journey = created as JourneyRow;

  // 6. Increment volunteer loads. Best-effort: if a load update fails after
  //    enrollment succeeded, we don't roll the journey back — the load drift
  //    can be corrected by an admin tool later.
  if (connectionsVol) await incrementVolunteerLoad(db, connectionsVol.id);
  if (layVol) await incrementVolunteerLoad(db, layVol.id);

  // 7. Schedule the touches. Route touches to the assigned volunteer's
  //    user_id when one exists (the volunteer has signed in to the dashboard).
  //    Otherwise leave owner_user_id NULL and let role-based routing surface
  //    the touch in any matching-role worklist.
  //
  //    Broadcast responders skip Touch 1: the instant "Welcome home" auto-ack
  //    they already received IS the Day-1 SMS, warmer than the template. The
  //    journey effectively begins at Touch 2 (Stephen's Day-2 card).
  const skipTouchOne = opts.enrollmentKind === 'broadcast_response';
  const touchRows: TouchInsert[] = TOUCH_TEMPLATE.filter(
    (t) => !(skipTouchOne && t.touch_number === 1),
  ).map((t) => {
    const { scheduled_for, due_at } = computeTouchTiming(nowDate, t);
    return {
      journey_id: journey.id,
      touch_number: t.touch_number,
      kind: t.kind,
      owner_role: t.owner_role,
      owner_user_id: resolveOwnerUserId(t.owner_role, connectionsVol, layVol),
      is_recovery: t.is_recovery,
      scheduled_for: scheduled_for.toISOString(),
      due_at: due_at.toISOString(),
      status: 'pending',
      payload: { label: t.label, guidance: t.guidance },
    };
  });

  const { error: touchesErr } = await db.from('touches').insert(touchRows);
  if (touchesErr) throw new Error(`touches insert failed: ${touchesErr.message}`);

  return {
    outcome: 'enrolled',
    journey,
    touchCount: touchRows.length,
    connectionsVolunteer: connectionsVol,
    layVolunteer: layVol,
  };
}

function resolveOwnerUserId(
  ownerRole: string,
  connectionsVol: VolunteerRow | null,
  layVol: VolunteerRow | null,
): string | null {
  if (ownerRole === 'connections_volunteer') return connectionsVol?.user_id ?? null;
  if (ownerRole === 'lay_volunteer') return layVol?.user_id ?? null;
  return null;
}

/**
 * Resolve the volunteer assigned to a touch, if any. Used by enrichment
 * and drafting to display the volunteer's name as the sender.
 */
export async function resolveVolunteerForTouch(
  db: Db,
  journey: Pick<JourneyRow, 'assigned_connections_volunteer_id' | 'assigned_lay_volunteer_id'>,
  ownerRole: string,
): Promise<VolunteerRow | null> {
  if (ownerRole === 'connections_volunteer' && journey.assigned_connections_volunteer_id) {
    return getVolunteer(db, journey.assigned_connections_volunteer_id);
  }
  if (ownerRole === 'lay_volunteer' && journey.assigned_lay_volunteer_id) {
    return getVolunteer(db, journey.assigned_lay_volunteer_id);
  }
  return null;
}
