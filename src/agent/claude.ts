/**
 * Claude client wrapper.
 *
 * Defines a narrow interface (`ClaudeClient`) so the drafter and voice
 * checker can be tested with a stub. Production uses Anthropic's SDK.
 *
 * Returns the raw assistant text. Higher-level callers parse JSON or
 * apply their own structure on top.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeRequest {
  model: string;
  system: string;
  userMessage: string;
  /** Cacheable suffix of the system prompt (e.g. voice rules). */
  cachedSystemSuffix?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface ClaudeClient {
  generate(req: ClaudeRequest): Promise<ClaudeResponse>;
}

export class AnthropicClaudeClient implements ClaudeClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(req: ClaudeRequest): Promise<ClaudeResponse> {
    // System prompt construction: if the caller provides a cacheable suffix
    // (typically the voice rules — large and stable), we use Anthropic's
    // prompt caching so repeated drafts only pay for the prefix tokens.
    const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: req.system }];
    if (req.cachedSystemSuffix) {
      system.push({
        type: 'text',
        text: req.cachedSystemSuffix,
        cache_control: { type: 'ephemeral' },
      });
    }

    const response = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      system,
      messages: [{ role: 'user', content: req.userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    };
  }
}
