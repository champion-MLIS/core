'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';

/**
 * Server actions for the Volunteer Pool admin screen.
 *
 * Becky (Connections Pastor) maintains the connections + lay volunteer pools
 * here. Previously this required direct DB access — a flagged backlog gap.
 *
 * Writes use the service-role client because RLS grants `authenticated` only
 * SELECT on volunteers (same pattern as touches/responses actions).
 */

const VALID_ROLES = ['connections', 'lay'] as const;
type VolunteerRole = (typeof VALID_ROLES)[number];

async function requireAuthedEmail(): Promise<string> {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');
  return user.email;
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRole(raw: unknown): VolunteerRole {
  if (typeof raw === 'string' && (VALID_ROLES as readonly string[]).includes(raw)) {
    return raw as VolunteerRole;
  }
  throw new Error("role must be 'connections' or 'lay'");
}

/** Add a new volunteer to the requested pool. */
export async function addVolunteerAction(formData: FormData): Promise<void> {
  const fullName = String(formData.get('full_name') ?? '').trim();
  if (!fullName) throw new Error('full_name required');
  const role = parseRole(formData.get('role'));
  const email = normalizeEmail(formData.get('email'));

  await requireAuthedEmail();
  const db = createServiceClient();

  const { error } = await db.from('volunteers').insert({
    full_name: fullName,
    role,
    email,
    is_active: true,
    current_load: 0,
  });
  if (error) throw new Error(`add volunteer failed: ${error.message}`);

  revalidatePath('/volunteers');
  revalidatePath('/');
}

/** Toggle a volunteer's is_active flag based on the submitted target value. */
export async function setActiveAction(formData: FormData): Promise<void> {
  const id = String(formData.get('volunteer_id') ?? '');
  if (!id) throw new Error('volunteer_id required');
  const target = String(formData.get('active') ?? '');
  if (target !== 'true' && target !== 'false') {
    throw new Error("active must be 'true' or 'false'");
  }
  await requireAuthedEmail();
  const db = createServiceClient();

  const { error } = await db
    .from('volunteers')
    .update({ is_active: target === 'true', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`set-active failed: ${error.message}`);

  revalidatePath('/volunteers');
  revalidatePath('/');
}

/**
 * Soft-remove a volunteer: set is_active=false and reset current_load to 0.
 *
 * We never hard-delete — touches and journeys may still reference the
 * volunteer's id, and the load reset keeps the pool's load-balancing math
 * honest when they're brought back later.
 */
export async function removeVolunteerAction(formData: FormData): Promise<void> {
  const id = String(formData.get('volunteer_id') ?? '');
  if (!id) throw new Error('volunteer_id required');
  await requireAuthedEmail();
  const db = createServiceClient();

  const { error } = await db
    .from('volunteers')
    .update({
      is_active: false,
      current_load: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`remove volunteer failed: ${error.message}`);

  revalidatePath('/volunteers');
  revalidatePath('/');
}
