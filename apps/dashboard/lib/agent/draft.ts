/**
 * Generate a draft + voice-check it.
 *
 * Two Claude calls per draft:
 *   - Drafting (Sonnet 4.6 by default) returns the email + SMS structured.
 *   - Voice check (Haiku 4.5) verifies tone against the 3-question test.
 *
 * Returns everything together so the caller can store the whole bundle
 * in touches.payload.draft.
 */

import { callClaude } from './claude';
import { loadVoiceRules } from './voice-rules';
import { buildDraftPrompts, buildVoiceCheckPrompts, type DraftContext } from './prompts';
import { linksFromEnv } from './links';

export interface DraftEmail {
  subject: string;
  body: string;
}

export interface DraftSms {
  body: string;
}

export interface DraftPayload {
  email: DraftEmail | null;
  sms: DraftSms | null;
  voice_notes: string;
}

export interface VoiceCheck {
  warm_personal: { pass: boolean; note: string };
  zero_pressure: { pass: boolean; note: string };
  sounds_like_champion: { pass: boolean; note: string };
  overall: 'pass' | 'fail';
  concerns: string[];
}

export interface DraftBundle {
  draft: DraftPayload;
  voice_check: VoiceCheck;
  models: {
    draft: string;
    voice_check: string;
  };
  usage: {
    draft_input_tokens: number;
    draft_output_tokens: number;
    voice_check_input_tokens: number;
    voice_check_output_tokens: number;
  };
  drafted_at: string;
}

export async function generateTouchDraft(ctx: DraftContext): Promise<DraftBundle> {
  const draftModel = process.env.ANTHROPIC_DRAFT_MODEL ?? 'claude-sonnet-4-6';
  const voiceCheckModel =
    process.env.ANTHROPIC_VOICE_CHECK_MODEL ?? 'claude-haiku-4-5-20251001';

  const links = linksFromEnv();
  const voiceRules = await loadVoiceRules();

  // 1. Draft
  const draftPrompts = buildDraftPrompts(ctx, links, voiceRules);
  const draftRes = await callClaude({
    model: draftModel,
    system: draftPrompts.system,
    cachedSystemSuffix: draftPrompts.cachedSystemSuffix,
    user: draftPrompts.user,
    maxTokens: 1024,
    temperature: 0.6,
  });
  const draft = parseJsonStrict<DraftPayload>(draftRes.text, 'draft');

  // 2. Voice check
  const voicePrompts = buildVoiceCheckPrompts(
    { email: draft.email, sms: draft.sms },
    voiceRules,
  );
  const voiceRes = await callClaude({
    model: voiceCheckModel,
    system: voicePrompts.system,
    cachedSystemSuffix: voicePrompts.cachedSystemSuffix,
    user: voicePrompts.user,
    maxTokens: 512,
    temperature: 0,
  });
  const voice_check = parseJsonStrict<VoiceCheck>(voiceRes.text, 'voice check');

  return {
    draft,
    voice_check,
    models: { draft: draftModel, voice_check: voiceCheckModel },
    usage: {
      draft_input_tokens: draftRes.inputTokens,
      draft_output_tokens: draftRes.outputTokens,
      voice_check_input_tokens: voiceRes.inputTokens,
      voice_check_output_tokens: voiceRes.outputTokens,
    },
    drafted_at: new Date().toISOString(),
  };
}

function parseJsonStrict<T>(text: string, label: string): T {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch (err) {
    throw new Error(
      `${label}: Claude did not return valid JSON. First 300 chars:\n${text.slice(
        0,
        300,
      )}\nParse error: ${String(err)}`,
    );
  }
}
