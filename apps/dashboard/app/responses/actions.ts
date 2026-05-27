'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';

/**
 * Server actions for the inbound-response callback queue (Phase F).
 *
 * These are the human side of the "text HOME" flow: a guest texted in, got the
 * instant warm reply, and now lands here for the promised in-person call within
 * 24 hours. Marking "called" closes the loop; the staffer's email is recorded.
 *
 * Writes use the service-role client — RLS grants `authenticated` only SELECT
 * on inbound_responses; mutations are a server-side concern (same pattern as
 * the touch worklist actions).
 */

async function requireAuthedEmail(): Promise<string> {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');
  return user.email;
}

/** Mark a response as called — the promised human reach-out happened. */
export async function markCalledAction(formData: FormData): Promise<void> {
  const id = String(formData.get('response_id') ?? '');
  if (!id) throw new Error('response_id required');
  const email = await requireAuthedEmail();
  const db = createServiceClient();

  const now = new Date().toISOString();
  const { error } = await db
    .from('inbound_responses')
    .update({
      status: 'callback_done',
      completed_by: email,
      completed_at: now,
      claimed_by: email,
      claimed_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new Error(`mark-called failed: ${error.message}`);

  revalidatePath('/responses');
  revalidatePath('/');
}

/** Claim a response — "I've got this one" — without closing it yet. */
export async function claimResponseAction(formData: FormData): Promise<void> {
  const id = String(formData.get('response_id') ?? '');
  if (!id) throw new Error('response_id required');
  const email = await requireAuthedEmail();
  const db = createServiceClient();

  const now = new Date().toISOString();
  const { error } = await db
    .from('inbound_responses')
    .update({ claimed_by: email, claimed_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw new Error(`claim failed: ${error.message}`);

  revalidatePath('/responses');
}

/** Set a response aside without a call (duplicate, wrong number, prank). */
export async function markNoActionAction(formData: FormData): Promise<void> {
  const id = String(formData.get('response_id') ?? '');
  if (!id) throw new Error('response_id required');
  const email = await requireAuthedEmail();
  const db = createServiceClient();

  const now = new Date().toISOString();
  const { error } = await db
    .from('inbound_responses')
    .update({
      status: 'no_action',
      completed_by: email,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new Error(`no-action failed: ${error.message}`);

  revalidatePath('/responses');
  revalidatePath('/');
}

/** Undo — flip a closed response back into the callback queue. */
export async function reopenResponseAction(formData: FormData): Promise<void> {
  const id = String(formData.get('response_id') ?? '');
  if (!id) throw new Error('response_id required');
  await requireAuthedEmail();
  const db = createServiceClient();

  const now = new Date().toISOString();
  const { error } = await db
    .from('inbound_responses')
    .update({
      status: 'needs_callback',
      completed_by: null,
      completed_at: null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) throw new Error(`reopen failed: ${error.message}`);

  revalidatePath('/responses');
  revalidatePath('/');
}
