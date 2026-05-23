/**
 * Contextual Reference Touch insertion (ADR-004 §3.5).
 *
 * When a precious-cargo record exists for a guest, schedule an additional
 * Day-11 touch on their active journey. The touch is inserted between
 * Touch 5 (Day 7) and Touch 6 (Day 10 recovery) — concretely:
 *
 *   touch_number: 9, kind: 'sms', is_contextual_reference: true,
 *   owner_role: 'connections_volunteer' (same person as 1/5/7),
 *   day_offset: 10, grace_hours: 48 (per the build prompt).
 *
 * Suppression rules:
 *   - Person has an active pastoral_flag raised after the prayer (caller
 *     handles the pastoral_flag re-check; we just verify here as a guard).
 *   - The prayer_request has been marked resolved_no_action by the PCPOC.
 *   - The journey is not 'active' (already returned/completed/cancelled).
 *
 * Idempotency: re-running for the same (journey, prayer_request) skips
 * insertion if a contextual reference touch already exists.
 */

import type { Db, JourneyRow, TouchInsert } from '../../db/index.ts';
import { computeTouchTiming, type TouchTemplate } from '../../journey/touch-template.ts';

export interface InsertContextualReferenceOptions {
  personPcoId: string;
  prayerRequestId: string;
  /** Override "now" for tests. Used only as the basis for the schedule when
   *  the journey row has no enrolled_at (shouldn't happen — but safe default). */
  now?: () => Date;
}

export interface InsertContextualReferenceResult {
  /** Set when a new touch is inserted. */
  touchId: string | null;
  /** Why we did or did not insert. */
  outcome:
    | 'inserted'
    | 'already_inserted'
    | 'suppressed_no_active_journey'
    | 'suppressed_prayer_resolved_no_action'
    | 'suppressed_pastoral_flag';
}

const CONTEXTUAL_REFERENCE_TEMPLATE: TouchTemplate = {
  touch_number: 9,
  kind: 'sms',
  owner_role: 'connections_volunteer',
  day_offset: 10,
  grace_hours: 48,
  is_recovery: false,
  label: 'Day 11 — Contextual reference (precious cargo)',
  guidance:
    'Day 10–12 window. Casual human warmth, NOT pastoral content. Reference by topic only ("How is [name]?" / "How are you doing?") — never quote the prayer back. Sender is the assigned connections volunteer (continuity from Touches 1/5/7).',
};

export async function insertContextualReferenceTouch(
  db: Db,
  opts: InsertContextualReferenceOptions,
): Promise<InsertContextualReferenceResult> {
  // 1. Suppression: pastoral_flag (supreme — checked here for defense in depth).
  const { data: flag, error: fErr } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', opts.personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (fErr) throw new Error(`pastoral_flags lookup failed: ${fErr.message}`);
  if (flag) {
    return { touchId: null, outcome: 'suppressed_pastoral_flag' };
  }

  // 2. Suppression: prayer request resolved with no action.
  const { data: pr, error: prErr } = await db
    .from('prayer_requests')
    .select('status')
    .eq('id', opts.prayerRequestId)
    .maybeSingle();
  if (prErr) throw new Error(`prayer_requests lookup failed: ${prErr.message}`);
  if (pr?.status === 'resolved_no_action') {
    return { touchId: null, outcome: 'suppressed_prayer_resolved_no_action' };
  }

  // 3. Find the active journey for this person.
  const { data: journey, error: jErr } = await db
    .from('guest_journeys')
    .select('*')
    .eq('person_pco_id', opts.personPcoId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (jErr) throw new Error(`guest_journeys lookup failed: ${jErr.message}`);
  if (!journey) {
    return { touchId: null, outcome: 'suppressed_no_active_journey' };
  }
  const j = journey as JourneyRow;

  // 4. Idempotency: already inserted for this journey?
  const { data: existing, error: eErr } = await db
    .from('touches')
    .select('id')
    .eq('journey_id', j.id)
    .eq('is_contextual_reference', true)
    .limit(1)
    .maybeSingle();
  if (eErr) throw new Error(`touches lookup failed: ${eErr.message}`);
  if (existing) {
    return { touchId: existing.id as string, outcome: 'already_inserted' };
  }

  // 5. Compute timing relative to enrollment (or now if enrollment missing).
  const baseDate = j.enrolled_at
    ? new Date(j.enrolled_at)
    : (opts.now ?? (() => new Date()))();
  const { scheduled_for, due_at } = computeTouchTiming(baseDate, CONTEXTUAL_REFERENCE_TEMPLATE);

  // 6. Find the volunteer-resolved user_id (if any) for owner_user_id.
  let ownerUserId: string | null = null;
  if (j.assigned_connections_volunteer_id) {
    const { data: vol } = await db
      .from('volunteers')
      .select('user_id')
      .eq('id', j.assigned_connections_volunteer_id)
      .maybeSingle();
    ownerUserId = (vol?.user_id as string | null) ?? null;
  }

  const insertRow: TouchInsert = {
    journey_id: j.id,
    touch_number: CONTEXTUAL_REFERENCE_TEMPLATE.touch_number,
    kind: CONTEXTUAL_REFERENCE_TEMPLATE.kind,
    owner_role: CONTEXTUAL_REFERENCE_TEMPLATE.owner_role,
    owner_user_id: ownerUserId,
    is_recovery: false,
    is_contextual_reference: true,
    scheduled_for: scheduled_for.toISOString(),
    due_at: due_at.toISOString(),
    status: 'pending',
    payload: {
      label: CONTEXTUAL_REFERENCE_TEMPLATE.label,
      guidance: CONTEXTUAL_REFERENCE_TEMPLATE.guidance,
      precious_cargo_ref: opts.prayerRequestId,
    },
  };

  const { data: created, error: insertErr } = await db
    .from('touches')
    .insert(insertRow)
    .select('id')
    .single();
  if (insertErr) throw new Error(`contextual reference touch insert failed: ${insertErr.message}`);

  return { touchId: created.id as string, outcome: 'inserted' };
}
