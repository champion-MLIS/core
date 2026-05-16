/**
 * Resend email sender.
 *
 * Sends FROM the technical address (e.g. connect@champion.church) with
 * the Reply-To header set to the human inbox (e.g. becky@championchurch.org).
 * That way every guest reply lands in Becky's normal email — no inbound
 * webhook needed.
 *
 * Resend automatically handles list-unsubscribe headers when configured
 * at the contact-list level; for now, the agent's voice rules include
 * a soft opt-out invitation in the body text where appropriate.
 */

import { Resend } from 'resend';

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  id: string;
  to: string;
  subject: string;
}

let cached: Resend | null = null;

function getClient() {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY missing in env.');
  }
  cached = new Resend(key);
  return cached;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error('RESEND_FROM_EMAIL missing in env.');
  }
  const replyTo = process.env.RESEND_REPLY_TO;

  const { data, error } = await getClient().emails.send({
    from,
    to: [args.to],
    subject: args.subject,
    text: args.body,
    // Plain-text fallback alongside the agent's body (which is also text-only).
    // Future: render the body as light HTML for better email-client display.
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? JSON.stringify(error)}`);
  }
  if (!data?.id) {
    throw new Error('Resend send returned no message id');
  }

  return { id: data.id, to: args.to, subject: args.subject };
}
