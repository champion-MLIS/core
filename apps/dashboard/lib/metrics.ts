/**
 * MLIS tracking metrics — Phase E in the original spec, surfaced here in
 * Phase B.5 for Becky's dashboard.
 *
 * Four numbers (per the spec):
 *   1. Touch-by-touch completion rate
 *   2. Recovery-touch usage rate
 *   3. Return rate by touch number
 *   4. Days-to-return distribution
 *
 * Each function takes a service-role db client and returns plain data
 * structures so the React page can render them however it wants.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@core/db/types.generated';

type Db = SupabaseClient<Database>;

export interface CompletionRate {
  touchesCompleted: number;
  touchesScheduled: number;
  /** 0 to 1; null when there's nothing scheduled. */
  rate: number | null;
}

export async function getTouchCompletionRate(db: Db): Promise<CompletionRate> {
  const [doneRes, scheduledRes] = await Promise.all([
    db.from('touches').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    // "Scheduled" = ever-existed; excludes NAs (skipped due to return) since
    // those weren't expected to fire anyway.
    db.from('touches').select('id', { count: 'exact', head: true }).neq('status', 'na'),
  ]);
  const touchesCompleted = doneRes.count ?? 0;
  const touchesScheduled = scheduledRes.count ?? 0;
  return {
    touchesCompleted,
    touchesScheduled,
    rate: touchesScheduled === 0 ? null : touchesCompleted / touchesScheduled,
  };
}

export interface RecoveryUsage {
  recoveryTouchesFired: number;
  journeysTotal: number;
  /** What % of journeys reached at least one recovery touch (touch 6/7/8). */
  rate: number | null;
}

export async function getRecoveryUsage(db: Db): Promise<RecoveryUsage> {
  // A journey "used recovery" if any of its recovery touches (6, 7, or 8)
  // was completed or missed (i.e., not 'pending' or 'na').
  // For now we count distinct journey_ids in touches WHERE is_recovery=TRUE
  // AND status IN ('completed','missed').
  const [usedRes, journeysRes] = await Promise.all([
    db
      .from('touches')
      .select('journey_id', { count: 'exact' })
      .eq('is_recovery', true)
      .in('status', ['completed', 'missed']),
    db.from('guest_journeys').select('id', { count: 'exact', head: true }),
  ]);
  // Dedupe by journey_id.
  const distinct = new Set((usedRes.data ?? []).map((r) => r.journey_id));
  const recoveryTouchesFired = distinct.size;
  const journeysTotal = journeysRes.count ?? 0;
  return {
    recoveryTouchesFired,
    journeysTotal,
    rate: journeysTotal === 0 ? null : recoveryTouchesFired / journeysTotal,
  };
}

export interface ReturnRateByTouch {
  touchNumber: number;
  /** Journeys that had RETURNED by the time this touch was scheduled. */
  returnedBy: number;
  /** Total journeys that ever reached this touch's schedule. */
  totalAtTouch: number;
  rate: number | null;
}

export async function getReturnRateByTouch(db: Db): Promise<ReturnRateByTouch[]> {
  // For each touch number (1..8), how many journeys had a returned_at
  // <= that touch's scheduled_for? Surfaces which touch most correlates
  // with the guest coming back.
  const { data, error } = await db
    .from('touches')
    .select(
      `
      touch_number, scheduled_for,
      guest_journeys!inner ( id, returned_at )
    `,
    );
  if (error) throw new Error(`return-rate query failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    touch_number: number;
    scheduled_for: string;
    guest_journeys: { id: string; returned_at: string | null };
  }>;

  const byTouch: Record<number, { returnedBy: number; total: number }> = {};
  for (let i = 1; i <= 8; i++) byTouch[i] = { returnedBy: 0, total: 0 };
  for (const r of rows) {
    if (r.touch_number < 1 || r.touch_number > 8) continue;
    byTouch[r.touch_number]!.total++;
    if (r.guest_journeys.returned_at) {
      const returnedAt = Date.parse(r.guest_journeys.returned_at);
      const scheduled = Date.parse(r.scheduled_for);
      if (returnedAt <= scheduled) byTouch[r.touch_number]!.returnedBy++;
    }
  }
  return Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    const cell = byTouch[n]!;
    return {
      touchNumber: n,
      returnedBy: cell.returnedBy,
      totalAtTouch: cell.total,
      rate: cell.total === 0 ? null : cell.returnedBy / cell.total,
    };
  });
}

export interface DaysToReturnBucket {
  label: string;
  count: number;
}

export async function getDaysToReturnDistribution(db: Db): Promise<{
  buckets: DaysToReturnBucket[];
  totalReturned: number;
  medianDays: number | null;
}> {
  const { data, error } = await db
    .from('guest_journeys')
    .select('enrolled_at, returned_at')
    .not('returned_at', 'is', null);
  if (error) throw new Error(`days-to-return query failed: ${error.message}`);

  const days: number[] = [];
  for (const r of data ?? []) {
    if (!r.returned_at) continue;
    const ms = Date.parse(r.returned_at) - Date.parse(r.enrolled_at);
    days.push(ms / (1000 * 60 * 60 * 24));
  }
  days.sort((a, b) => a - b);

  const buckets: DaysToReturnBucket[] = [
    { label: 'Within 3 days', count: days.filter((d) => d <= 3).length },
    { label: '4–7 days', count: days.filter((d) => d > 3 && d <= 7).length },
    { label: '8–14 days', count: days.filter((d) => d > 7 && d <= 14).length },
    { label: '15–21 days', count: days.filter((d) => d > 14 && d <= 21).length },
    { label: '22+ days', count: days.filter((d) => d > 21).length },
  ];

  const medianDays =
    days.length === 0
      ? null
      : days.length % 2 === 1
        ? days[(days.length - 1) / 2]!
        : (days[days.length / 2 - 1]! + days[days.length / 2]!) / 2;

  return {
    buckets,
    totalReturned: days.length,
    medianDays,
  };
}

// ---------------------------------------------------------------------------
// Recently-active journeys + missed-touch queue
// ---------------------------------------------------------------------------

export interface ActiveJourneySummary {
  id: string;
  personPcoId: string;
  guestName: string;
  enrolledAt: string;
  touchesDone: number;
  touchesTotal: number;
  status: string;
}

export async function getRecentActiveJourneys(
  db: Db,
  limit = 10,
): Promise<ActiveJourneySummary[]> {
  const { data, error } = await db
    .from('guest_journeys')
    .select(
      `
      id, person_pco_id, enrolled_at, status,
      people!inner ( first_name, last_name, preferred_name, pco_id ),
      touches ( id, status )
    `,
    )
    .in('status', ['active', 'returned'])
    .order('enrolled_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`active-journeys query failed: ${error.message}`);

  return (data ?? []).map((j) => {
    const p = j.people;
    const guestName =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      p.preferred_name ||
      `(${p.pco_id})`;
    const touches = j.touches ?? [];
    const touchesDone = touches.filter(
      (t: { status: string }) => t.status === 'completed' || t.status === 'na',
    ).length;
    return {
      id: j.id,
      personPcoId: p.pco_id,
      guestName,
      enrolledAt: j.enrolled_at,
      touchesDone,
      touchesTotal: touches.length,
      status: j.status,
    };
  });
}

export interface MissedTouchSummary {
  id: string;
  journeyId: string;
  guestName: string;
  touchNumber: number;
  label: string;
  ownerRole: string;
  dueAt: string;
}

/**
 * "Missed" today means: pending status, due_at in the past. Once Phase D
 * lands (scheduled worker), this becomes status='missed' explicitly via
 * the escalation cron. For now we compute it on read.
 */
export async function getMissedTouches(db: Db): Promise<MissedTouchSummary[]> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('touches')
    .select(
      `
      id, journey_id, touch_number, owner_role, due_at, payload, status,
      guest_journeys!inner (
        people!inner ( first_name, last_name, preferred_name, pco_id )
      )
    `,
    )
    .in('status', ['pending', 'drafting', 'awaiting_action'])
    .lt('due_at', now)
    .order('due_at', { ascending: true });
  if (error) throw new Error(`missed-touches query failed: ${error.message}`);

  return (data ?? []).map((t) => {
    const p = t.guest_journeys.people;
    const guestName =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
      p.preferred_name ||
      `(${p.pco_id})`;
    const label =
      (t.payload as { label?: string } | null)?.label ?? `Touch ${t.touch_number}`;
    return {
      id: t.id,
      journeyId: t.journey_id,
      guestName,
      touchNumber: t.touch_number,
      label,
      ownerRole: t.owner_role,
      dueAt: t.due_at,
    };
  });
}
