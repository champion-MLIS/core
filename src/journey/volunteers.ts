/**
 * Volunteer continuity — assignment + load tracking.
 *
 * Per Part 1.3 of the build prompt: continuity is a person, not a role.
 * Touches 1, 5, 7, and the contextual reference touch all route to the
 * same connections volunteer for a given journey. Touch 4 routes to the
 * same lay volunteer.
 *
 * Load balancing: among active volunteers of the requested role, pick
 * the one with the lowest current_load. Tiebreak by created_at (oldest
 * first — established volunteers get priority once load equalizes).
 *
 * Empty pool: returns null. Enrollment proceeds with NULL assignment;
 * routing falls back to role-based (worklist still surfaces the touch
 * to any authenticated user with the role until pools are populated).
 */

import type { Db, VolunteerRole, VolunteerRow } from '../db/index.ts';

/**
 * Pick a volunteer to assign to a journey: lowest current_load wins.
 * Returns null if no active volunteer exists in the requested pool.
 */
export async function pickVolunteer(
  db: Db,
  role: VolunteerRole,
): Promise<VolunteerRow | null> {
  // Fetch all active volunteers in the role; the pool is small (< 20 in
  // typical operation) so an in-memory pick is simpler than chained SQL
  // ordering and stays compatible with the test fakes' single-order chains.
  const { data, error } = await db
    .from('volunteers')
    .select('*')
    .eq('role', role)
    .eq('is_active', true);
  if (error) throw new Error(`volunteers pick failed: ${error.message}`);
  const rows = (data as VolunteerRow[] | null) ?? [];
  if (rows.length === 0) return null;
  // Lowest current_load wins. Tiebreak by created_at ascending (oldest first,
  // so established volunteers get priority once load equalizes).
  rows.sort((a, b) => {
    if (a.current_load !== b.current_load) return a.current_load - b.current_load;
    return a.created_at.localeCompare(b.created_at);
  });
  return rows[0] ?? null;
}

/**
 * Increment a volunteer's current_load by 1. Called at enrollment.
 *
 * Race note: this is a read-then-write. Two simultaneous enrollments
 * could miss each other's increment, leaving load off by one. For the
 * current operating scale (Champion sees < 20 guests/week) this is
 * acceptable. If contention becomes real, switch to a SQL-side UPDATE
 * with a CHECK constraint or use a Postgres function for atomic increment.
 */
export async function incrementVolunteerLoad(db: Db, volunteerId: string): Promise<void> {
  const { data: row, error: readErr } = await db
    .from('volunteers')
    .select('current_load')
    .eq('id', volunteerId)
    .maybeSingle();
  if (readErr) throw new Error(`volunteers load read failed: ${readErr.message}`);
  if (!row) throw new Error(`volunteer ${volunteerId} not found`);

  const next = (row.current_load as number) + 1;
  const { error: updateErr } = await db
    .from('volunteers')
    .update({ current_load: next, updated_at: new Date().toISOString() })
    .eq('id', volunteerId);
  if (updateErr) throw new Error(`volunteers load increment failed: ${updateErr.message}`);
}

/**
 * Decrement a volunteer's current_load by 1, floor of 0. Called when a
 * journey leaves 'active' status (returned, completed, cancelled).
 */
export async function decrementVolunteerLoad(db: Db, volunteerId: string): Promise<void> {
  const { data: row, error: readErr } = await db
    .from('volunteers')
    .select('current_load')
    .eq('id', volunteerId)
    .maybeSingle();
  if (readErr) throw new Error(`volunteers load read failed: ${readErr.message}`);
  if (!row) return; // volunteer deleted — nothing to decrement

  const next = Math.max(0, (row.current_load as number) - 1);
  const { error: updateErr } = await db
    .from('volunteers')
    .update({ current_load: next, updated_at: new Date().toISOString() })
    .eq('id', volunteerId);
  if (updateErr) throw new Error(`volunteers load decrement failed: ${updateErr.message}`);
}

/**
 * Resolve a volunteer row by id. Returns null if not found.
 */
export async function getVolunteer(db: Db, volunteerId: string): Promise<VolunteerRow | null> {
  const { data, error } = await db
    .from('volunteers')
    .select('*')
    .eq('id', volunteerId)
    .maybeSingle();
  if (error) throw new Error(`volunteer lookup failed: ${error.message}`);
  return (data as VolunteerRow | null) ?? null;
}
