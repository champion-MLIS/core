'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../../lib/supabase/server';
import { generateTouchDraft } from '../../../lib/agent/draft';
import type { DraftContext } from '../../../lib/agent/prompts';
import type { Json } from '@core/db/types.generated';

/**
 * Generate (or regenerate) the AI draft for a touch.
 *
 * Only valid for sms / email / event_invite touches. Handwritten cards and
 * phone calls are human-actioned — the dashboard shows guidance only for
 * those, and won't render the "Draft this message" button.
 */
export async function draftTouchAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  if (!touchId) throw new Error('touch_id required');

  // Auth — defense in depth on top of the middleware.
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const db = createServiceClient();

  // Pull touch + journey + person in one query.
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select(
      `
      id, touch_number, kind, payload, scheduled_for, status,
      guest_journeys!inner (
        person_pco_id, enrollment_kind,
        people!inner (
          first_name, last_name, preferred_name, is_child, household_pco_id
        )
      )
    `,
    )
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch fetch failed: ${tErr.message}`);
  if (!touch) throw new Error(`touch ${touchId} not found`);

  // Only AI-draftable channels.
  const channel = mapKindToChannel(touch.kind);
  if (!channel) {
    throw new Error(
      `touch kind '${touch.kind}' is human-actioned, not AI-drafted. No draft generated.`,
    );
  }

  const person = touch.guest_journeys.people;
  const preferredName =
    person.preferred_name ?? person.first_name ?? '(friend)';
  const fullName =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() ||
    preferredName;

  // Does the household have any children other than this person?
  let householdHasChildren = false;
  if (person.household_pco_id) {
    const { data: kids } = await db
      .from('people')
      .select('pco_id')
      .eq('household_pco_id', person.household_pco_id)
      .eq('is_child', true)
      .limit(1)
      .maybeSingle();
    householdHasChildren = kids !== null;
  }

  // Sermon context lookup is a future hook (PCO Services API — Step 4.1).
  // For now we pass null and the prompt falls back to generic language.
  const sermonTitle: string | null = null;

  // Enrollment_kind is an engagement_signal_kind in the DB. Map to the
  // narrower trigger set the agent prompt knows about.
  const triggerKind = mapEnrollmentToTrigger(touch.guest_journeys.enrollment_kind);

  const ctx: DraftContext = {
    touchNumber: touch.touch_number,
    channel,
    preferredName,
    fullName,
    triggerKind,
    triggerDate: touch.scheduled_for,
    householdHasChildren,
    sermonTitle,
  };

  const bundle = await generateTouchDraft(ctx);

  // Merge into existing payload (keep label + guidance from the template).
  const existingPayload = (touch.payload ?? {}) as Record<string, unknown>;
  const newPayload = {
    ...existingPayload,
    draft: bundle,
  };

  // Cast at the boundary: Supabase's Json type is structural and can't
  // recognize our DraftBundle even though the runtime shape is valid JSON.
  const { error: uErr } = await db
    .from('touches')
    .update({ payload: newPayload as unknown as Json })
    .eq('id', touchId);
  if (uErr) throw new Error(`touch payload update failed: ${uErr.message}`);

  revalidatePath(`/touches/${touchId}`);
}

function mapKindToChannel(
  kind: string,
): 'sms' | 'email' | 'event_invite' | null {
  if (kind === 'sms' || kind === 'email' || kind === 'event_invite') return kind;
  return null;
}

function mapEnrollmentToTrigger(
  kind: string,
): 'connect_card' | 'first_giving' | 'child_checkin' | 'prayer_request' {
  switch (kind) {
    case 'connect_card':
    case 'first_giving':
    case 'child_checkin':
    case 'prayer_request':
      return kind;
    default:
      // service_attendance and other unexpected kinds default to connect_card
      // for prompt purposes — closest in tone.
      return 'connect_card';
  }
}
