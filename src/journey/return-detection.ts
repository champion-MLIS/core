/**
 * Return detection — when a guest comes back, cancel the recovery touches.
 *
 * "Return" means: a second visit (service attendance) AFTER enrollment.
 *
 * Per the spec, recovery touches are 6, 7, 8 (Day 10, Day 14, Day 21).
 * If the guest returns BEFORE any of those have fired, they should be
 * marked `na` (not the standard touches 1-5, which still complete or get
 * marked missed). The journey itself transitions to 'returned'.
 *
 * Today's signal sources for "return":
 *   - service_attendance engagement_signal (CLI: attendance:record;
 *     dashboard: "Mark Attended" button; future: PCO Check-Ins per Step 3.2)
 *   - manual call from staff via the dashboard
 *
 * This module exposes two paths:
 *   1. markJourneyReturned(journeyId, returnedAt) — called when a return
 *      is confirmed; mutates journey + cancels remaining recovery touches
 *      + decrements volunteer loads
 *   2. processReturnSignals() — scans for service_attendance signals that
 *      indicate a return for any currently-active journey and applies #1
 */

import type { Db, JourneyRow } from '../db/index.ts';
import { decrementVolunteerLoad } from './volunteers.ts';

export interface MarkReturnedResult {
  journeyId: string;
  cancelledTouchCount: number;
  /** True if the journey was already in 'returned' state (idempotent). */
  alreadyReturned: boolean;
}

export async function markJourneyReturned(
  db: Db,
  args: { journeyId: string; returnedAt: Date },
): Promise<MarkReturnedResult> {
  // Fetch current journey.
  const { data: journey, error: jErr } = await db
    .from('guest_journeys')
    .select('*')
    .eq('id', args.journeyId)
    .maybeSingle();
  if (jErr) throw new Error(`journey lookup failed: ${jErr.message}`);
  if (!journey) throw new Error(`journey ${args.journeyId} not found`);

  const j = journey as JourneyRow;
  if (j.status === 'returned') {
    return { journeyId: j.id, cancelledTouchCount: 0, alreadyReturned: true };
  }
  if (j.status !== 'active') {
    throw new Error(`journey ${args.journeyId} is in status '${j.status}', cannot mark returned`);
  }

  // Cancel all recovery touches that are still 'pending' (haven't been
  // worked yet). Already-completed touches stay as they are.
  const { data: cancelled, error: cErr } = await db
    .from('touches')
    .update({
      status: 'na',
      notes: `Marked NA due to guest return on ${args.returnedAt.toISOString()}`,
    })
    .eq('journey_id', j.id)
    .eq('is_recovery', true)
    .eq('status', 'pending')
    .select('id');
  if (cErr) throw new Error(`recovery-touch cancel failed: ${cErr.message}`);

  // Mark the journey itself as returned.
  const { error: uErr } = await db
    .from('guest_journeys')
    .update({
      status: 'returned',
      returned_at: args.returnedAt.toISOString(),
    })
    .eq('id', j.id);
  if (uErr) throw new Error(`journey update failed: ${uErr.message}`);

  // Decrement volunteer loads — the volunteers are no longer carrying
  // this journey on their plate. Failures here are non-fatal; an admin
  // can rebalance loads later if drift accumulates.
  await releaseJourneyVolunteers(db, j);

  return {
    journeyId: j.id,
    cancelledTouchCount: cancelled?.length ?? 0,
    alreadyReturned: false,
  };
}

/**
 * Decrement the load counters on whichever volunteers were assigned to
 * this journey. Idempotency is at the caller's responsibility (we only
 * call this from the active→returned transition, which is itself guarded).
 */
async function releaseJourneyVolunteers(db: Db, journey: JourneyRow): Promise<void> {
  if (journey.assigned_connections_volunteer_id) {
    await decrementVolunteerLoad(db, journey.assigned_connections_volunteer_id);
  }
  if (journey.assigned_lay_volunteer_id) {
    await decrementVolunteerLoad(db, journey.assigned_lay_volunteer_id);
  }
}

/**
 * Scan for service_attendance signals that came in AFTER the guest's
 * enrollment_at, and mark those journeys as returned.
 *
 * This is the auto-detection path. Manual marking (from the dashboard
 * "Mark Attended" button or the attendance:record CLI) calls
 * markJourneyReturned directly via this same function.
 */
export async function processReturnSignals(
  db: Db,
): Promise<{ journeysReturned: number; touchesCancelled: number }> {
  const { data: activeJourneys, error: jErr } = await db
    .from('guest_journeys')
    .select('id, person_pco_id, enrolled_at')
    .eq('status', 'active');
  if (jErr) throw new Error(`active-journey scan failed: ${jErr.message}`);

  let journeysReturned = 0;
  let touchesCancelled = 0;

  for (const j of activeJourneys ?? []) {
    const { data: returnSignal, error: sErr } = await db
      .from('engagement_signals')
      .select('id, occurred_at')
      .eq('person_pco_id', j.person_pco_id)
      .eq('kind', 'service_attendance')
      .gt('occurred_at', j.enrolled_at)
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(`return-signal scan failed: ${sErr.message}`);
    if (!returnSignal) continue;

    const result = await markJourneyReturned(db, {
      journeyId: j.id,
      returnedAt: new Date(returnSignal.occurred_at),
    });
    if (!result.alreadyReturned) {
      journeysReturned++;
      touchesCancelled += result.cancelledTouchCount;
    }
  }

  return { journeysReturned, touchesCancelled };
}
