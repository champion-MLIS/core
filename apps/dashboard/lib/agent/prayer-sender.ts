/**
 * Production Sender for the Prayer Response Agent.
 *
 * Implements the `Sender` interface from `src/agent/prayer-response/sender.ts`
 * against the dashboard's existing Twilio + Resend helpers in
 * `apps/dashboard/lib/send/`. Lives in the dashboard because that's where
 * the vendor deps physically install.
 */

import { sendSms } from '../send/sms';
import { sendEmail } from '../send/email';
import type {
  Sender,
  SendEmailArgs,
  SendSmsArgs,
  SendResult,
} from '@core/agent/prayer-response/sender.ts';

export const productionSender: Sender = {
  async sendEmail(args: SendEmailArgs): Promise<SendResult> {
    const result = await sendEmail({
      to: args.to,
      subject: args.subject,
      body: args.body,
    });
    return {
      channel: 'email',
      recipient: result.to,
      vendor: 'resend',
      vendor_id: result.id,
    };
  },
  async sendSms(args: SendSmsArgs): Promise<SendResult> {
    const result = await sendSms({ to: args.to, body: args.body });
    return {
      channel: 'sms',
      recipient: result.to,
      vendor: 'twilio',
      vendor_id: result.sid,
    };
  },
};
