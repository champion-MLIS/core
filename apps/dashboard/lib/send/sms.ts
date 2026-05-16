/**
 * Twilio SMS sender.
 *
 * Returns the Twilio message SID on success, or throws on failure. The
 * caller (the touch send-action) decides what to do with that — log to
 * the communications table, surface to the volunteer, etc.
 *
 * Compliance note: the opt-out instruction is appended to every outbound
 * automatically. Twilio also auto-handles inbound STOP/UNSTOP keywords —
 * once a recipient texts STOP, all subsequent sends from this account to
 * that number get blocked at the Twilio layer.
 */

import twilio from 'twilio';

const OPT_OUT_SUFFIX = ' Reply STOP to opt out.';

export interface SendSmsArgs {
  to: string;
  body: string;
}

export interface SendSmsResult {
  sid: string;
  to: string;
  body: string;
}

let cached: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (cached) return cached;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio credentials missing. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local.');
  }
  cached = twilio(sid, token);
  return cached;
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    throw new Error('TWILIO_PHONE_NUMBER missing in env.');
  }

  // Append opt-out instruction only if the body doesn't already include it.
  const body = /\bSTOP\b/i.test(args.body) ? args.body : args.body + OPT_OUT_SUFFIX;

  const to = normalizePhone(args.to);

  const message = await getClient().messages.create({
    from,
    to,
    body,
  });

  return { sid: message.sid, to, body };
}

/**
 * Normalize a phone number to E.164. Accepts:
 *   "(928) 555-1234"  → "+19285551234"
 *   "928-555-1234"    → "+19285551234"
 *   "+19285551234"    → "+19285551234"
 *   "9285551234"      → "+19285551234"
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;
  if (raw.startsWith('+')) return raw;
  throw new Error(`Cannot normalize phone number: ${raw}`);
}
