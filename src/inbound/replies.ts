/**
 * Fixed, pre-approved auto-reply copy per inbound intent (Phase F).
 *
 * IMPORTANT: this copy is NOT AI-generated, by design. Twilio gives the
 * inbound webhook only a few seconds to respond, and a reply to someone who
 * just responded to an altar call is far too tender to improvise on the wire.
 * Pastoral leadership owns this wording. To change the voice, edit it here —
 * no other code changes needed.
 *
 * The next-steps URL is injected (CHAMPION_NEXT_STEPS_URL) so the link can
 * point at the "three things to do today" page and change without a code edit.
 */

import type { InboundIntent } from './keywords.ts';

export interface ReplyContext {
  /** The "three things to do today" landing page. */
  nextStepsUrl: string;
}

type ReplyBuilder = (ctx: ReplyContext) => string;

const REPLIES: Record<InboundIntent, ReplyBuilder> = {
  // Authored by Pastor Stephen. Runs ~2 SMS segments — that's fine, it
  // concatenates on delivery. No scripture is quoted here by intent; this is
  // the pastor's own words of welcome, not AI doing pastoral work.
  home: ({ nextStepsUrl }) =>
    'Welcome home. You just made the most important decision of your life. ' +
    'Pastor Stephen and the Champion family are praying for you right now. ' +
    'A real person will reach out within 24 hours. In the meantime, here are ' +
    `three things to do today: ${nextStepsUrl}`,
};

export function buildReply(intent: InboundIntent, ctx: ReplyContext): string {
  const builder = REPLIES[intent];
  if (!builder) throw new Error(`No reply template for inbound intent: ${intent}`);
  return builder(ctx);
}
