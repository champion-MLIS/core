/**
 * Draft generator — single Claude call that produces an email + SMS draft.
 *
 * Pure function over (context, links, voice rules, claude client). No DB.
 * Higher-level orchestrator wires this to followup_queue rows.
 */

import { z } from 'zod';
import type { ClaudeClient } from './claude.ts';
import type { ChampionLinks } from './links.ts';
import { buildDraftPrompts, type DraftContext } from './prompts.ts';

const DraftJsonSchema = z.object({
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
  voice_notes: z.string(),
});

export type DraftJson = z.infer<typeof DraftJsonSchema>;

export interface DraftResult {
  draft: DraftJson;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateDraft(
  claude: ClaudeClient,
  ctx: DraftContext,
  links: ChampionLinks,
  voiceRules: string,
  model: string,
): Promise<DraftResult> {
  if (!ctx.hasEmail && !ctx.hasSms) {
    throw new Error('generateDraft requires at least one channel (email or sms).');
  }

  const prompts = buildDraftPrompts(ctx, links, voiceRules);
  const response = await claude.generate({
    model,
    system: prompts.system,
    cachedSystemSuffix: prompts.cachedSystemSuffix,
    userMessage: prompts.userMessage,
    maxTokens: 1024,
    temperature: 0.6,
  });

  const draft = parseDraftJson(response.text);
  return {
    draft,
    model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}

function parseDraftJson(text: string): DraftJson {
  // Claude occasionally wraps JSON in ```json fences despite our instruction
  // — strip them if present.
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
      `Draft response was not valid JSON. Got:\n${text.slice(0, 500)}\n\nParse error: ${String(err)}`,
    );
  }
  const result = DraftJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Draft response did not match schema:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
  return result.data;
}
