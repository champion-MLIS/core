'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../../lib/supabase/server';

/**
 * B.3 action-panel server actions:
 *   - markAttendedAction        — writes service_attendance signal + triggers return detection
 *   - holdTouchAction           — sets held_pending_data_at + reason, keeps status pending
 *   - clearHoldAction           — clears the held flags so the touch can re-draft
 *   - pastoralOverrideAction    — raises a pastoral_flag; the override monitor pauses automation
 *
 * Pattern follows actions.ts: middleware confirms auth, defense-in-depth re-auth here,
 * service_role client for writes because RLS only grants SELECT to authenticated.
 */

async function requireAuthedEmail(): Promise<string> {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');
  return user.email;
}

function dayStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayEndUtc(date: Date): Date {
  const d = dayStartUtc(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Record a service_attendance signal for the touch's person. Idempotent
 * on (person, day). After writing, scans active journeys and transitions
 * any that have a post-enrollment signal to 'returned'.
 */
export async function markAttendedAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  const dateInput = String(formData.get('service_date') ?? '');
  if (!touchId) throw new Error('touch_id required');
  const email = await requireAuthedEmail();
  const db = createServiceClient();

  // Resolve person from the touch.
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select('id, guest_journeys!inner ( person_pco_id )')
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch lookup failed: ${tErr.message}`);
  if (!touch) throw new Error(`touch ${touchId} not found`);
  const personPcoId = touch.guest_journeys.person_pco_id;

  const serviceDate = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(serviceDate.getTime())) {
    throw new Error(`Bad service_date: ${dateInput}`);
  }
  const dayStart = dayStartUtc(serviceDate);
  const dayEnd = dayEndUtc(serviceDate);

  // Idempotency check.
  const { data: existing } = await db
    .from('engagement_signals')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .eq('kind', 'service_attendance')
    .gte('occurred_at', dayStart.toISOString())
    .lt('occurred_at', dayEnd.toISOString())
    .limit(1)
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await db.from('engagement_signals').insert({
      person_pco_id: personPcoId,
      kind: 'service_attendance',
      occurred_at: dayStart.toISOString(),
      payload: { source: 'dashboard', recorded_by: email },
    });
    if (insertErr) throw new Error(`signal insert failed: ${insertErr.message}`);
  }

  // Run return detection inline for this person's active journey (small
  // scope — we only need this guest, not a full pass over every journey).
  const { data: journey } = await db
    .from('guest_journeys')
    .select('id, enrolled_at, status, assigned_connections_volunteer_id, assigned_lay_volunteer_id')
    .eq('person_pco_id', personPcoId)
    .eq('status', 'active')
    .maybeSingle();

  if (journey && dayStart.toISOString() > journey.enrolled_at) {
    // Cancel pending recovery touches.
    await db
      .from('touches')
      .update({
        status: 'na',
        notes: `Marked NA due to guest return on ${dayStart.toISOString()}`,
      })
      .eq('journey_id', journey.id)
      .eq('is_recovery', true)
      .eq('status', 'pending');

    // Transition journey.
    await db
      .from('guest_journeys')
      .update({ status: 'returned', returned_at: dayStart.toISOString() })
      .eq('id', journey.id);

    // Decrement volunteer load.
    for (const vid of [
      journey.assigned_connections_volunteer_id,
      journey.assigned_lay_volunteer_id,
    ]) {
      if (!vid) continue;
      const { data: v } = await db
        .from('volunteers')
        .select('current_load')
        .eq('id', vid)
        .maybeSingle();
      if (v) {
        await db
          .from('volunteers')
          .update({ current_load: Math.max(0, (v.current_load as number) - 1) })
          .eq('id', vid);
      }
    }
  }

  revalidatePath(`/touches/${touchId}`);
  revalidatePath('/touches');
  revalidatePath('/');
}

export async function holdTouchAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!touchId) throw new Error('touch_id required');
  if (!reason) throw new Error('reason required (tell Becky what context is missing)');
  await requireAuthedEmail();
  const db = createServiceClient();

  const { error } = await db
    .from('touches')
    .update({
      held_pending_data_at: new Date().toISOString(),
      held_pending_data_reason: reason.slice(0, 500),
      status: 'pending',
    })
    .eq('id', touchId);
  if (error) throw new Error(`hold failed: ${error.message}`);

  revalidatePath(`/touches/${touchId}`);
  revalidatePath('/touches');
}

export async function clearHoldAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  if (!touchId) throw new Error('touch_id required');
  await requireAuthedEmail();
  const db = createServiceClient();

  const { error } = await db
    .from('touches')
    .update({
      held_pending_data_at: null,
      held_pending_data_reason: null,
    })
    .eq('id', touchId);
  if (error) throw new Error(`clear hold failed: ${error.message}`);

  revalidatePath(`/touches/${touchId}`);
  revalidatePath('/touches');
}

export async function pastoralOverrideAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();
  if (!touchId) throw new Error('touch_id required');
  const email = await requireAuthedEmail();
  const db = createServiceClient();

  // Resolve person.
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select('id, guest_journeys!inner ( person_pco_id )')
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch lookup failed: ${tErr.message}`);
  if (!touch) throw new Error(`touch ${touchId} not found`);
  const personPcoId = touch.guest_journeys.person_pco_id;

  // Don't double-flag if one is already active for this person.
  const { data: existingFlag } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();

  if (!existingFlag) {
    const { error: flagErr } = await db.from('pastoral_flags').insert({
      person_pco_id: personPcoId,
      notes: notes || `Raised from touch ${touchId} by ${email}.`,
      assigned_to: email,
    });
    if (flagErr) throw new Error(`pastoral_flag insert failed: ${flagErr.message}`);
  }

  // Surface the override on the touch itself so the dashboard banner shows.
  await db
    .from('touches')
    .update({
      notes: `Automation paused for this person by ${email}.`,
    })
    .eq('id', touchId);

  revalidatePath(`/touches/${touchId}`);
  revalidatePath('/touches');
  revalidatePath('/');
}
