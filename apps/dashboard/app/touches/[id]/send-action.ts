'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../../lib/supabase/server';
import { sendSms } from '../../../lib/send/sms';
import { sendEmail } from '../../../lib/send/email';
import type { Json } from '@core/db/types.generated';

/**
 * Send the drafted message for a touch. Reads the draft from
 * touches.payload.draft, fetches the recipient's primary contact for the
 * channel, calls the right vendor (Twilio for SMS, Resend for email),
 * logs the result to the communications table, and marks the touch
 * completed.
 */
export async function sendTouchAction(formData: FormData): Promise<void> {
  const touchId = String(formData.get('touch_id') ?? '');
  const channel = String(formData.get('channel') ?? '');
  if (!touchId) throw new Error('touch_id required');
  if (channel !== 'sms' && channel !== 'email') {
    throw new Error(`unsupported send channel: ${channel}`);
  }

  // Auth — defense in depth on top of middleware.
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');
  const userEmail = user.email;

  const db = createServiceClient();

  // Load the touch + its draft + the person.
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select(
      `
      id, touch_number, payload, status, journey_id,
      guest_journeys!inner (
        person_pco_id,
        people!inner ( pco_id, first_name, last_name, preferred_name )
      )
    `,
    )
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch fetch failed: ${tErr.message}`);
  if (!touch) throw new Error(`touch ${touchId} not found`);

  const person = touch.guest_journeys.people;
  const personPcoId = person.pco_id;

  // Pastoral override re-check.
  const { data: flag } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (flag) {
    throw new Error(
      `Pastoral flag active for this person. Send blocked. Resolve the flag before continuing.`,
    );
  }

  // Pull the draft out of payload.
  const payload = (touch.payload ?? {}) as {
    draft?: {
      draft?: {
        email?: { subject: string; body: string } | null;
        sms?: { body: string } | null;
      };
    };
  };
  const draft = payload.draft?.draft;
  if (!draft) {
    throw new Error('No draft on this touch. Generate a draft first, then send.');
  }

  // Resolve recipient based on channel.
  let templateUsed = `touch_${touch.touch_number}_${channel}`;
  let recipientLabel = '';
  let contentSummary = '';
  let vendorResponse: Record<string, unknown>;

  if (channel === 'sms') {
    if (!draft.sms?.body) {
      throw new Error('Draft has no SMS body. Regenerate the draft.');
    }
    const { data: phoneRow, error: pErr } = await db
      .from('phone_numbers')
      .select('number, is_primary')
      .eq('person_pco_id', personPcoId)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pErr) throw new Error(`phone lookup failed: ${pErr.message}`);
    if (!phoneRow?.number) {
      throw new Error('No phone number on file for this person.');
    }
    const result = await sendSms({ to: phoneRow.number, body: draft.sms.body });
    recipientLabel = result.to;
    contentSummary = draft.sms.body.slice(0, 160);
    vendorResponse = { vendor: 'twilio', sid: result.sid, body_sent: result.body };
  } else {
    if (!draft.email?.subject || !draft.email.body) {
      throw new Error('Draft has no email subject/body. Regenerate the draft.');
    }
    const { data: emailRow, error: eErr } = await db
      .from('emails')
      .select('address, is_primary')
      .eq('person_pco_id', personPcoId)
      .eq('blocked', false)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eErr) throw new Error(`email lookup failed: ${eErr.message}`);
    if (!emailRow?.address) {
      throw new Error('No email address on file for this person.');
    }
    const result = await sendEmail({
      to: emailRow.address,
      subject: draft.email.subject,
      body: draft.email.body,
    });
    recipientLabel = result.to;
    contentSummary = draft.email.subject;
    vendorResponse = { vendor: 'resend', id: result.id, subject: result.subject };
  }

  // Log to communications.
  const sentAt = new Date().toISOString();
  const { error: cErr } = await db.from('communications').insert({
    person_pco_id: personPcoId,
    channel,
    template_used: templateUsed,
    sent_at: sentAt,
    approved_by: userEmail,
    content_summary: contentSummary,
    payload: {
      recipient: recipientLabel,
      touch_id: touchId,
      vendor_response: vendorResponse,
    } as unknown as Json,
  });
  if (cErr) throw new Error(`communications log insert failed: ${cErr.message}`);

  // Mark the touch as completed.
  const sentMetadata = {
    ...((touch.payload ?? {}) as Record<string, unknown>),
    sent: {
      channel,
      recipient: recipientLabel,
      sent_at: sentAt,
      sent_by: userEmail,
      vendor_response: vendorResponse,
    },
  };
  const { error: uErr } = await db
    .from('touches')
    .update({
      status: 'completed',
      completed_at: sentAt,
      completed_by: userEmail,
      payload: sentMetadata as unknown as Json,
    })
    .eq('id', touchId);
  if (uErr) throw new Error(`touch completion update failed: ${uErr.message}`);

  // Cascade: if all touches on the journey are now completed/na, mark journey completed.
  const { data: remaining } = await db
    .from('touches')
    .select('id')
    .eq('journey_id', touch.journey_id)
    .not('status', 'in', '(completed,na)');
  if (!remaining || remaining.length === 0) {
    await db
      .from('guest_journeys')
      .update({ status: 'completed', completed_at: sentAt })
      .eq('id', touch.journey_id);
  }

  revalidatePath(`/touches/${touchId}`);
  revalidatePath('/touches');
  revalidatePath('/');
}
