/**
 * Inbound keyword handler — the brain of Phase F.
 *
 * Vendor-free and testable: it takes a parsed inbound message + a Db, decides
 * whether the message is a recognized campaign keyword, records the response
 * for the callback queue, and returns the reply text. The dashboard route
 * owns the Twilio wire (signature validation, TwiML); this owns the meaning.
 *
 * Why this doesn't reuse the form-signal poller path:
 *   The signal poller requires the person to already exist in PCO (it gates on
 *   `personExists`). Someone texting HOME from their seat has NO connect card
 *   and NO PCO identity yet — just a phone number. So inbound keyword lands in
 *   its own `inbound_responses` queue; a human reconciles it to a PCO person on
 *   the callback (person_pco_id backfills then).
 *
 * Idempotency: Twilio retries webhooks. message_sid is UNIQUE, so a retry
 * never double-queues a callback — we detect the existing row (or a unique
 * violation on insert) and return the same reply.
 */

import type { Db, Json } from '../db/index.ts';
import { matchKeyword } from './keywords.ts';
import { buildReply } from './replies.ts';

const CALLBACK_WINDOW_HOURS = 24;
const PG_UNIQUE_VIOLATION = '23505';

export interface InboundMessage {
  /** E.164, the guest. */
  fromPhone: string;
  /** E.164, our Twilio number. */
  toPhone: string;
  body: string;
  messageSid: string;
  /** Optional Twilio extras (FromCity, FromState, …) stored for context. */
  meta?: Record<string, unknown>;
}

export interface HandleConfig {
  /** The "three things to do today" landing page injected into the reply. */
  nextStepsUrl: string;
  /** Override "now" for tests + back-filling. Default: Date.now(). */
  now?: () => Date;
}

export type HandleResult =
  | {
      outcome: 'recognized';
      intent: string;
      keyword: string;
      reply: string;
      responseId: string;
      duplicate: false;
    }
  | {
      outcome: 'recognized_duplicate';
      intent: string;
      keyword: string;
      reply: string;
      responseId: string | null;
      duplicate: true;
    }
  | { outcome: 'unrecognized'; reply: null };

export async function handleInboundKeyword(
  db: Db,
  msg: InboundMessage,
  cfg: HandleConfig,
): Promise<HandleResult> {
  const matched = matchKeyword(msg.body);
  if (!matched) {
    // Not a campaign keyword (could be a reserved word Twilio owns, a reply to
    // some other thread, or noise). We don't auto-reply and don't queue.
    return { outcome: 'unrecognized', reply: null };
  }

  const reply = buildReply(matched.intent, { nextStepsUrl: cfg.nextStepsUrl });

  // Fast-path dedupe: have we already recorded this exact Twilio message?
  const { data: existing, error: existingErr } = await db
    .from('inbound_responses')
    .select('id')
    .eq('message_sid', msg.messageSid)
    .maybeSingle();
  if (existingErr) throw new Error(`inbound_responses lookup failed: ${existingErr.message}`);
  if (existing) {
    return {
      outcome: 'recognized_duplicate',
      intent: matched.intent,
      keyword: matched.keyword,
      reply,
      responseId: existing.id,
      duplicate: true,
    };
  }

  const now = (cfg.now ?? (() => new Date()))();
  const callbackDueAt = new Date(now.getTime() + CALLBACK_WINDOW_HOURS * 60 * 60 * 1000);

  const { data: inserted, error: insertErr } = await db
    .from('inbound_responses')
    .insert({
      from_phone: msg.fromPhone,
      to_phone: msg.toPhone,
      keyword: matched.keyword,
      intent: matched.intent,
      body_raw: msg.body,
      message_sid: msg.messageSid,
      received_at: now.toISOString(),
      // The reply ships as the synchronous TwiML response to this same webhook
      // request, so by the time we persist, Twilio is delivering it.
      auto_reply_sent: true,
      auto_reply_body: reply,
      status: 'needs_callback',
      callback_due_at: callbackDueAt.toISOString(),
      meta: (msg.meta ?? {}) as Json,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Concurrent retry won the race on the unique message_sid — treat as a
    // duplicate, not an error. The guest still gets their (idempotent) reply.
    if (insertErr.code === PG_UNIQUE_VIOLATION) {
      return {
        outcome: 'recognized_duplicate',
        intent: matched.intent,
        keyword: matched.keyword,
        reply,
        responseId: null,
        duplicate: true,
      };
    }
    throw new Error(`inbound_responses insert failed: ${insertErr.message}`);
  }

  return {
    outcome: 'recognized',
    intent: matched.intent,
    keyword: matched.keyword,
    reply,
    responseId: inserted.id,
    duplicate: false,
  };
}
