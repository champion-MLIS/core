/**
 * Thin Anthropic SDK wrapper for the dashboard's draft generation.
 *
 * The CLI agent in src/agent/ does the same thing for the followup_queue
 * polling worker. They're intentionally kept separate (the dashboard
 * doesn't import from src/agent/ because of cross-package TS-extension
 * import incompatibilities). Drift between them is OK — they have
 * different contexts: the CLI agent works against the queue, this one
 * is invoked per-touch from the dashboard.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeRequest {
  model: string;
  system: string;
  cachedSystemSuffix?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: req.system }];
  if (req.cachedSystemSuffix) {
    system.push({
      type: 'text',
      text: req.cachedSystemSuffix,
      cache_control: { type: 'ephemeral' },
    });
  }

  const response = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 1024,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    system,
    messages: [{ role: 'user', content: req.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
