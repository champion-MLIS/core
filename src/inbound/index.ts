/**
 * Inbound SMS keyword campaign (Phase F) — public surface.
 *
 * The dashboard Twilio webhook imports from here; everything is vendor-free
 * and testable. Twilio + TwiML wiring lives in the dashboard route.
 */

export { matchKeyword, RESERVED_WORDS, type InboundIntent, type KeywordDef } from './keywords.ts';
export { buildReply, type ReplyContext } from './replies.ts';
export {
  handleInboundKeyword,
  type InboundMessage,
  type HandleConfig,
  type HandleResult,
} from './handle-keyword.ts';
export { scanFreeText, type FreeTextScanResult } from './free-text-scan.ts';
export {
  processInboundResponses,
  type PcoPersonWriter,
  type ProcessConfig,
  type ProcessResult,
} from './process-responses.ts';
export { makePcoPersonWriter } from './pco-writer.ts';
