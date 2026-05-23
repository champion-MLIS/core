/**
 * Pastoral-care role resolution for the dashboard.
 *
 * RLS does the heavy lifting at the database level — but UI rendering
 * needs to know *before* it tries to read `prayer_requests` whether to
 * surface the full-content card or the references-only summary.
 *
 * Source of truth: the `staff_profiles` table, keyed by the current
 * user's email (lowercased to match the table's check constraint).
 */

import { createServiceClient } from './supabase/server';

export interface StaffRole {
  email: string;
  full_name: string | null;
  pastoral_care: boolean;
  pcpoc_alert_recipient: boolean;
  is_default_pcpoc: boolean;
}

/**
 * Resolve the staff_profiles row for a given email. Returns null when
 * the user is signed in but isn't on the pastoral team — they're treated
 * as a non-pastoral role (volunteer/leader) for UI purposes.
 *
 * Uses the service-role client because anonymous staff_profiles reads
 * via authenticated would only return the caller's own row, and that's
 * exactly what we want — but going through service_role keeps the lookup
 * deterministic regardless of cookie state.
 */
export async function resolveStaffRole(email: string | null | undefined): Promise<StaffRole | null> {
  if (!email) return null;
  const db = createServiceClient();
  const { data, error } = await db
    .from('staff_profiles')
    .select('email, full_name, pastoral_care, pcpoc_alert_recipient, is_default_pcpoc')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) {
    // Defensive: don't fail the page render — just degrade to non-pastoral.
    console.error('resolveStaffRole error:', error.message);
    return null;
  }
  if (!data) return null;
  return data as StaffRole;
}

export function isPastoralCare(role: StaffRole | null): boolean {
  return Boolean(role?.pastoral_care);
}
