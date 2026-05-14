/**
 * Voice check — runs Haiku against a draft and reports pass/fail per criterion.
 *
 * Returns structured results so the orchestrator can decide:
 *   - all pass → mark queue row as awaiting_approval, ready for staff
 *   - any fail → mark held, surface the concerns to staff for rework
 */

import { z } from 'zod';
import type { ClaudeClient } from './claude.ts';
import { buildVoiceCheckPrompts } from './prompts.ts';
import type { DraftJson } from './draft.ts';

const VoiceCheckJsonSchema = z.object({
  warm_personal: z.object({ pass: z.boolean(), note: z.string() }),
  zero_pressure: z.object({ pass: z.boolean(), note: z.string() }),
  sounds_like_champion: z.object({ pass: z.boolean(), note: z.string() }),
  overall: z.enum(['pass', 'fail']),
  concerns: z.array(z.string()),
});

export type VoiceCheckJson = z.infer<typeof VoiceCheckJsonSchema>;

export interface VoiceCheckResult {
  check: VoiceCheckJson;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function checkVoice(
  claude: ClaudeClient,
  draft: DraftJson,
  voiceRules: string,
  model: string,
): Promise<VoiceCheckResult> {
  const prompts = buildVoiceCheckPrompts(
    { email: draft.email, sms: draft.sms },
    voiceRules,
  );
  const response = await claude.generate({
    model,
    system: prompts.system,
    cachedSystemSuffix: prompts.cachedSystemSuffix,
    userMessage: prompts.userMessage,
    maxTokens: 512,
    temperature: 0,
  });

  const stripped = response.text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(
      `Voice check response was not valid JSON. Got:\n${response.text.slice(0, 500)}\n\nParse: ${String(err)}`,
    );
  }
  const result = VoiceCheckJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Voice check response did not match schema:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }

  return {
    check: result.data,
    model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}
