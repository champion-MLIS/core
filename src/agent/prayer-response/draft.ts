/**
 * Calibrated-acknowledgment drafter for the Prayer Response Agent.
 *
 * Mirrors src/agent/draft.ts in shape, but uses the narrower ack prompts
 * and runs constraint checks beyond the standard voice check (no scripture,
 * no resource links, no characterization) because those are the inviolable
 * rules from ADR-004.
 */

import { z } from 'zod';
import type { ClaudeClient } from '../claude.ts';
import { buildAckPrompts, type AckContext } from './prompts.ts';

const AckDraftSchema = z.object({
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

export type AckDraft = z.infer<typeof AckDraftSchema>;

export interface AckDraftResult {
  draft: AckDraft;
  model: string;
  inputTokens: number;
  outputTokens: number;
  constraintConcerns: string[];
}

export async function draftAcknowledgment(
  claude: ClaudeClient,
  ctx: AckContext,
  voiceRules: string,
  model: string,
): Promise<AckDraftResult> {
  const prompts = buildAckPrompts(ctx, voiceRules);
  const response = await claude.generate({
    model,
    system: prompts.system,
    cachedSystemSuffix: prompts.cachedSystemSuffix,
    userMessage: prompts.userMessage,
    maxTokens: 512,
    temperature: 0.4,
  });

  const draft = parseAckJson(response.text);
  const constraintConcerns = scanForConstraintViolations(draft);

  return {
    draft,
    model,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    constraintConcerns,
  };
}

function parseAckJson(text: string): AckDraft {
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
      `Acknowledgment response was not valid JSON. Got:\n${text.slice(0, 500)}\n\nParse error: ${String(err)}`,
    );
  }
  const result = AckDraftSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Acknowledgment response did not match schema:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
  return result.data;
}

/**
 * Deterministic check for ADR-004's inviolable constraints. The voice
 * check (Haiku) is qualitative and can miss things; this is the
 * belt-and-suspenders pass that flags clear violations programmatically.
 *
 * Returns a list of concerns. Empty list = clean.
 */
export function scanForConstraintViolations(draft: AckDraft): string[] {
  const concerns: string[] = [];
  const bodies = [draft.email?.body, draft.email?.subject, draft.sms?.body].filter(
    (s): s is string => typeof s === 'string',
  );
  const combined = bodies.join('\n').toLowerCase();

  // No URLs / resource links
  if (/(https?:\/\/|\bwww\.)/i.test(combined)) {
    concerns.push('Contains a URL / resource link (forbidden by ADR-004).');
  }

  // No scripture references — chapter:verse pattern, or common book names
  // followed by a number.
  const verseRegex = /\b\d{0,3}\s?(?:gen|exo|lev|num|deut|josh|judg|ruth|sam|kgs|kings|chr|ezra|neh|esth|job|ps|psalm|psalms|prov|eccl|song|isa|jer|lam|ezek|dan|hos|joel|amos|obad|jonah|mic|nah|hab|zeph|hag|zech|mal|matt|mark|luke|john|acts|rom|cor|gal|eph|phil|col|thess|tim|tit|phlm|heb|jas|pet|jude|rev)[a-z]*\.?\s+\d+[:.]\d+/i;
  if (verseRegex.test(combined)) {
    concerns.push('Contains an apparent scripture reference (chapter:verse).');
  }

  // The word "pray" / "praying" / "prayed" doing pastoral work — flag for review.
  // (Permissive: "request" is fine; "we're praying for you" is not.)
  if (/\b(?:we(?:'re| are) praying|praying for you|i'?ll pray|i am praying|will pray for)\b/i.test(combined)) {
    concerns.push('Contains "praying for you" / pastoral promise — forbidden by ADR-004.');
  }

  // Common pastoral platitudes
  const platitudes = [
    /\bgod (?:sees|loves|hears|knows|has a plan)\b/i,
    /\byou(?:'re| are) not alone\b/i,
    /\bthis too shall pass\b/i,
    /\bgod has a plan\b/i,
    /\bin god'?s timing\b/i,
  ];
  for (const p of platitudes) {
    if (p.test(combined)) {
      concerns.push(`Contains pastoral platitude matching ${p}.`);
      break;
    }
  }

  return concerns;
}
