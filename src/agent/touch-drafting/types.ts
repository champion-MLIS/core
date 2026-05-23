/**
 * Per-touch drafter — shared types.
 *
 * Each of the eight standard touches (plus the Day-11 contextual
 * reference touch) gets its own drafter file. They share this runner.
 * A drafter is small: it declares its prompt rules, the canonical voice
 * sample it cites, the attentiveness fields it requires, and a function
 * that turns the enriched touch payload into the user message.
 *
 * Held-pending-data: if any required attentiveness field is missing,
 * the runner short-circuits, marks the touch held, and does not call
 * the LLM. The dashboard surfaces these to Becky's queue so she can
 * either supply context manually or accept the hold.
 */

import type { ClaudeClient } from '../claude.ts';
import type { ChampionLinks } from '../links.ts';
import type { EnrichedContext } from '../../journey/enrich-touch.ts';
import type { TouchRow } from '../../db/index.ts';

export type VoiceSampleStatus = 'canonical' | 'approximated';

export interface AttentivenessRequirement {
  /** Human-readable id for the requirement, surfaced in held_pending_data_reason. */
  id: string;
  /** Predicate over the enriched context. */
  required: (ctx: EnrichedContext) => boolean;
}

export interface DrafterSpec {
  /** Match key: touch_number for normal touches; 'contextual_reference' for the Day-11 inserted touch. */
  key: string;
  /** Identifies which voice sample the draft is modeled on. */
  voiceSampleCited: string;
  /** 'canonical' if voice-samples.md has a direct sample for this touch; 'approximated' otherwise. */
  voiceSampleStatus: VoiceSampleStatus;
  /** Required context fields; if ANY fail, the touch transitions to held_pending_data. */
  attentiveness: AttentivenessRequirement[];
  /** Build the per-touch system prompt (the prelude before the shared rules). */
  buildSystemPrompt: () => string;
  /** Build the user-message body from the enriched context. */
  buildUserMessage: (ctx: EnrichedContext, links: ChampionLinks) => string;
  /** Max tokens for the draft call. */
  maxTokens: number;
  /** Temperature for the draft call. Defaults to 0.6. */
  temperature?: number;
}

export interface TouchDraftOutput {
  /**
   * What was drafted, if anything. For touches that produce a sent message
   * (SMS/email), the relevant channel is non-null. For Touch 4 (call brief),
   * `brief` is non-null and email/sms are null.
   */
  email: { subject: string; body: string } | null;
  sms: { body: string } | null;
  brief: string | null;
  voice_notes: string;
}

export type RunDrafterResult =
  | {
      outcome: 'drafted';
      draft: TouchDraftOutput;
      voiceSampleCited: string;
      voiceSampleStatus: VoiceSampleStatus;
      voiceCheck: VoiceCheckShape;
      inputTokens: number;
      outputTokens: number;
    }
  | {
      outcome: 'held_pending_data';
      missing: string[];
    };

export interface VoiceCheckShape {
  warm_personal: { pass: boolean; note: string };
  zero_pressure: { pass: boolean; note: string };
  sounds_like_champion: { pass: boolean; note: string };
  overall: 'pass' | 'fail';
  concerns: string[];
}

/**
 * Convenience: compute the missing-requirement ids for a given context+spec.
 */
export function computeMissingAttentiveness(
  spec: DrafterSpec,
  ctx: EnrichedContext,
): string[] {
  return spec.attentiveness.filter((r) => !r.required(ctx)).map((r) => r.id);
}

export interface DrafterDeps {
  claude: ClaudeClient;
  voiceRules: string;
  draftModel: string;
  voiceCheckModel: string;
  links: ChampionLinks;
}

export interface DrafterInputs {
  touch: TouchRow;
  context: EnrichedContext;
}
