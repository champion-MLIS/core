export {
  processPrayerSignal,
  type PrayerResponseConfig,
  type PrayerResponseResult,
  type ProcessOutcome,
} from './orchestrator.ts';
export {
  draftAcknowledgment,
  scanForConstraintViolations,
  type AckDraft,
  type AckDraftResult,
} from './draft.ts';
export { buildAckPrompts, type AckContext } from './prompts.ts';
export {
  insertContextualReferenceTouch,
  type InsertContextualReferenceOptions,
  type InsertContextualReferenceResult,
} from './contextual-reference.ts';
export {
  runEscalationCheck,
  type EscalationRunOptions,
  type EscalationRunResult,
} from './escalation.ts';
export {
  type Sender,
  type SendEmailArgs,
  type SendSmsArgs,
  type SendResult,
  NoOpSender,
} from './sender.ts';
