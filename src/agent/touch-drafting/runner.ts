/**
 * Shared runner — turns a DrafterSpec + enriched context into a draft,
 * then runs the standard voice check. Enforces the attentiveness standard:
 * any missing required field short-circuits to held_pending_data without
 * calling the LLM (no generic drafts).
 */

import { z } from 'zod';
import { buildVoiceCheckPrompts } from '../prompts.ts';
import {
  type DrafterDeps,
  type DrafterInputs,
  type DrafterSpec,
  type RunDrafterResult,
  type TouchDraftOutput,
  type VoiceCheckShape,
  computeMissingAttentiveness,
} from './types.ts';

const TouchDraftSchema = z.object({
  email: z
    .object({
      subject: z.string(),
      body: z.string(),
    })
    .nullable(),
  sms: z
    .object({
      body: z.string(),
    })
    .nullable(),
  brief: z.string().nullable(),
  voice_notes: z.string(),
});

const VoiceCheckSchema = z.object({
  warm_personal: z.object({ pass: z.boolean(), note: z.string() }),
  zero_pressure: z.object({ pass: z.boolean(), note: z.string() }),
  sounds_like_champion: z.object({ pass: z.boolean(), note: z.string() }),
  overall: z.enum(['pass', 'fail']),
  concerns: z.array(z.string()),
});

const SHARED_OUTPUT_FORMAT = `
Output format: return STRICT JSON only. No prose before or after. Schema:
{
  "email": { "subject": "...", "body": "..." } | null,
  "sms": { "body": "..." } | null,
  "brief": "..." | null,
  "voice_notes": "1-2 sentences citing the voice sample you modeled on and how the draft matches"
}

Return null for any channel/format you weren't asked to produce.`;

export async function runDrafter(
  spec: DrafterSpec,
  deps: DrafterDeps,
  inputs: DrafterInputs,
): Promise<RunDrafterResult> {
  // Attentiveness check first — no LLM call if we're held.
  const missing = computeMissingAttentiveness(spec, inputs.context);
  if (missing.length > 0) {
    return { outcome: 'held_pending_data', missing };
  }

  const system = spec.buildSystemPrompt() + '\n\n' + SHARED_OUTPUT_FORMAT;
  const userMessage = spec.buildUserMessage(inputs.context, deps.links);

  const draftResp = await deps.claude.generate({
    model: deps.draftModel,
    system,
    cachedSystemSuffix: `<voice_rules>\n${deps.voiceRules}\n</voice_rules>`,
    userMessage,
    maxTokens: spec.maxTokens,
    temperature: spec.temperature ?? 0.6,
  });

  const draft = parseDraftJson(draftResp.text);

  const voicePrompts = buildVoiceCheckPrompts(
    { email: draft.email, sms: draft.sms },
    deps.voiceRules,
  );
  const voiceResp = await deps.claude.generate({
    model: deps.voiceCheckModel,
    system: voicePrompts.system,
    cachedSystemSuffix: voicePrompts.cachedSystemSuffix,
    userMessage: voicePrompts.userMessage,
    maxTokens: 512,
    temperature: 0,
  });

  const voiceCheck = parseVoiceJson(voiceResp.text);

  return {
    outcome: 'drafted',
    draft,
    voiceSampleCited: spec.voiceSampleCited,
    voiceSampleStatus: spec.voiceSampleStatus,
    voiceCheck,
    inputTokens: draftResp.inputTokens + voiceResp.inputTokens,
    outputTokens: draftResp.outputTokens + voiceResp.outputTokens,
  };
}

function parseDraftJson(text: string): TouchDraftOutput {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(
      `Touch draft response was not valid JSON. Got:\n${text.slice(0, 500)}\n\nParse error: ${String(err)}`,
    );
  }
  const result = TouchDraftSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Touch draft response did not match schema:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
  return result.data;
}

function parseVoiceJson(text: string): VoiceCheckShape {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(
      `Voice check response was not valid JSON. Got:\n${text.slice(0, 500)}\n\nParse: ${String(err)}`,
    );
  }
  const result = VoiceCheckSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Voice check response did not match schema:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
  return result.data;
}
