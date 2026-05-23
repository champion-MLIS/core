/**
 * Send abstraction for the Prayer Response Agent.
 *
 * The actual Twilio + Resend wiring lives in `apps/dashboard/lib/send/`
 * because the dashboard owns those vendor dependencies. This interface
 * lets the agent core stay in `src/` (testable, dep-free) while a thin
 * adapter in the dashboard provides the production sender.
 *
 * Tests inject a stub Sender that captures calls without touching the wire.
 */

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
}

export interface SendSmsArgs {
  to: string;
  body: string;
}

export interface SendResult {
  channel: 'email' | 'sms';
  recipient: string;
  vendor: string;
  vendor_id: string;
}

export interface Sender {
  sendEmail(args: SendEmailArgs): Promise<SendResult>;
  sendSms(args: SendSmsArgs): Promise<SendResult>;
}

/**
 * A Sender that throws on every call — used when sending is intentionally
 * disabled (e.g., dry-run mode or test scenarios that should never reach
 * the wire).
 */
export const NoOpSender: Sender = {
  async sendEmail() {
    throw new Error('NoOpSender: email send not permitted in this context');
  },
  async sendSms() {
    throw new Error('NoOpSender: sms send not permitted in this context');
  },
};
