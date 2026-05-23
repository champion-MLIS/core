/**
 * Attendance recording.
 *
 * Bridges the gap until PCO Check-Ins integration (Step 3.2) lands. Staff
 * record adult attendance manually via CLI or dashboard — both surfaces
 * call `recordAttendance()` which writes a `service_attendance` engagement
 * signal. The existing `processReturnSignals()` then picks it up and
 * cancels any pending recovery touches.
 *
 * Idempotent: writing the same (person, date) twice produces one signal.
 */

import type { Db } from '../db/index.ts';

export interface RecordAttendanceOptions {
  personPcoId: string;
  /** Date of the service (calendar day, not a timestamp). Stored as midnight UTC of that day. */
  serviceDate: Date;
  /** Optional source description — e.g., 'cli', 'dashboard:becky@championchurch.org'. */
  recordedBy?: string;
  /** Override "now" for tests. */
  now?: () => Date;
}

export type RecordAttendanceResult =
  | { outcome: 'recorded'; signalId: string }
  | { outcome: 'already_recorded'; signalId: string }
  | { outcome: 'person_not_mirrored'; reason: string };

/**
 * Truncate to UTC midnight — the "service date" key for idempotency.
 */
function dayStartUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return d;
}

function dayEndUtc(date: Date): Date {
  const d = dayStartUtc(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function recordAttendance(
  db: Db,
  opts: RecordAttendanceOptions,
): Promise<RecordAttendanceResult> {
  const dayStart = dayStartUtc(opts.serviceDate);
  const dayEnd = dayEndUtc(opts.serviceDate);

  // Person must exist in the mirror.
  const { data: person, error: personErr } = await db
    .from('people')
    .select('pco_id')
    .eq('pco_id', opts.personPcoId)
    .maybeSingle();
  if (personErr) throw new Error(`people lookup failed: ${personErr.message}`);
  if (!person) {
    return {
      outcome: 'person_not_mirrored',
      reason: `Person ${opts.personPcoId} is not in the mirror. Run intake:poll first.`,
    };
  }

  // Idempotency: is there already a service_attendance signal for this person on this day?
  const { data: existing, error: existingErr } = await db
    .from('engagement_signals')
    .select('id')
    .eq('person_pco_id', opts.personPcoId)
    .eq('kind', 'service_attendance')
    .gte('occurred_at', dayStart.toISOString())
    .lt('occurred_at', dayEnd.toISOString())
    .limit(1)
    .maybeSingle();
  if (existingErr) throw new Error(`engagement_signals lookup failed: ${existingErr.message}`);
  if (existing) {
    return { outcome: 'already_recorded', signalId: existing.id as string };
  }

  const now = (opts.now ?? (() => new Date()))();

  const { data: created, error: insertErr } = await db
    .from('engagement_signals')
    .insert({
      person_pco_id: opts.personPcoId,
      kind: 'service_attendance',
      occurred_at: dayStart.toISOString(),
      observed_at: now.toISOString(),
      payload: opts.recordedBy
        ? { source: 'manual', recorded_by: opts.recordedBy }
        : { source: 'manual' },
    })
    .select('id')
    .single();
  if (insertErr) throw new Error(`engagement_signals insert failed: ${insertErr.message}`);
  if (!created) throw new Error('engagement_signals insert returned no row');

  return { outcome: 'recorded', signalId: created.id as string };
}
