/**
 * Twilio inbound SMS webhook (Phase F).
 *
 * Configure this URL in the Twilio Console under the number's "A MESSAGE
 * COMES IN" webhook (HTTP POST):
 *   https://<your-dashboard-host>/api/sms/inbound
 *
 * Flow:
 *   1. Validate the X-Twilio-Signature header so nobody can spoof inbound
 *      texts and trigger replies / fake callback rows.
 *   2. Parse the form-encoded body Twilio sends (From, To, Body, MessageSid…).
 *   3. Hand it to the vendor-free core handler, which classifies the keyword,
 *      records the response in the callback queue, and returns the reply text.
 *   4. Respond with TwiML — Twilio delivers our reply instantly, no second API
 *      call, and STOP/opt-out is handled by Twilio at the account layer.
 *
 * Degraded mode: if persistence throws, a recognized keyword still gets the
 * warm reply (we never leave someone who just responded to an altar call
 * hanging), and the error is logged for follow-up.
 */

import { NextResponse, type NextRequest } from 'next/server';
import twilio from 'twilio';
import { createServiceClient } from '../../../../lib/supabase/server';
import { handleInboundKeyword, matchKeyword, buildReply } from '@core/inbound/index';

// Twilio's SDK + signature validation need Node crypto, not the Edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twiml(message: string | null): NextResponse {
  const inner = message ? `<Message>${escapeXml(message)}</Message>` : '';
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

/**
 * The exact URL Twilio used to reach us — must match what Twilio signed.
 * Behind proxies/tunnels (ngrok, Vercel) the reconstructed host can drift, so
 * an explicit TWILIO_INBOUND_URL override wins when set.
 */
function resolveRequestUrl(req: NextRequest): string {
  const override = process.env.TWILIO_INBOUND_URL;
  if (override) return override;
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  return `${proto}://${host}${req.nextUrl.pathname}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';
  } catch {
    return new NextResponse('bad request', { status: 400 });
  }

  // --- Signature validation (default ON when an auth token is present) ---
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const validateFlag = (process.env.TWILIO_INBOUND_VALIDATE ?? 'true').toLowerCase();
  const shouldValidate = validateFlag !== 'false';

  if (shouldValidate) {
    if (!authToken) {
      console.error('[inbound-sms] TWILIO_AUTH_TOKEN missing; cannot validate signature.');
      return new NextResponse('server not configured', { status: 500 });
    }
    const signature = req.headers.get('x-twilio-signature') ?? '';
    const url = resolveRequestUrl(req);
    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
      console.warn('[inbound-sms] rejected: invalid Twilio signature', { url });
      return new NextResponse('invalid signature', { status: 403 });
    }
  }

  const fromPhone = params.From ?? '';
  const toPhone = params.To ?? '';
  const body = params.Body ?? '';
  const messageSid = params.MessageSid ?? params.SmsSid ?? '';

  if (!fromPhone || !messageSid) {
    // Not a well-formed Twilio message payload.
    return twiml(null);
  }

  const nextStepsUrl = process.env.CHAMPION_NEXT_STEPS_URL ?? 'https://champion.church/next';
  const meta = {
    FromCity: params.FromCity,
    FromState: params.FromState,
    FromZip: params.FromZip,
    FromCountry: params.FromCountry,
  };

  try {
    const db = createServiceClient();
    const result = await handleInboundKeyword(
      db,
      { fromPhone, toPhone, body, messageSid, meta },
      { nextStepsUrl },
    );
    // result.reply is the warm reply for a recognized keyword, or null when
    // the message isn't a campaign keyword (Twilio still owns STOP/HELP).
    return twiml(result.reply);
  } catch (err) {
    console.error('[inbound-sms] handler failed; replying in degraded mode', err);
    // Don't ghost someone who just responded to an altar call: if it's a
    // recognized keyword, still send the welcome. The callback row may be
    // missing — surfaced via logs/monitoring for manual recovery.
    const matched = matchKeyword(body);
    if (matched) return twiml(buildReply(matched.intent, { nextStepsUrl }));
    return twiml(null);
  }
}
