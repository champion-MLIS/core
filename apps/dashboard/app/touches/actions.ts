'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';

/**
 * Server actions for the worklist screen.
 *
 * Both actions verify the user is signed in (the middleware does too, but
 * defense in depth matters when we're mutating state). Writes use the
 * service-role client because the RLS policies grant only SELECT to
 * `authenticated`; mutations are a server-side concern.
 */

async function requireAuthedEmail(): Promise<string> {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');
  return user.email;
}

export async function completeTouchAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  if (!touchId) throw new Error('touch_id required');
  const email = await requireAuthedEmail();
  const db = createServiceClient();

  const { data: touch, error: tErr } = await db
    .from('touches')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: email,
    })
    .eq('id', touchId)
    .select('journey_id')
    .single();
  if (tErr) throw new Error(`touch update failed: ${tErr.message}`);

  // If every touch on this journey is now completed (or NA), the journey
  // itself is done.
  const { data: remaining, error: rErr } = await db
    .from('touches')
    .select('id')
    .eq('journey_id', touch.journey_id)
    .not('status', 'in', '(completed,na)');
  if (rErr) throw new Error(`remaining-touches scan failed: ${rErr.message}`);
  if (!remaining || remaining.length === 0) {
    await db
      .from('guest_journeys')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', touch.journey_id);
  }

  revalidatePath('/touches');
  revalidatePath('/');
}

export async function snoozeTouchAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  if (!touchId) throw new Error('touch_id required');
  await requireAuthedEmail();

  const db = createServiceClient();

  // Push due_at forward by 24 hours from now.
  const newDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db
    .from('touches')
    .update({ due_at: newDue })
    .eq('id', touchId);
  if (error) throw new Error(`snooze failed: ${error.message}`);

  revalidatePath('/touches');
}
