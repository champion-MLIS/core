/**
 * Inbound SMS keyword campaign config (Phase F).
 *
 * The campaign is announced from the stage: "text HOME to <number>." Someone
 * responding to an altar call texts the keyword; MLIS recognizes it, returns
 * a fixed pre-approved warm reply, and queues a 24-hour human callback.
 *
 * Keep this list TIGHT. Every keyword here is a public, advertised word, so
 * adding one is a campaign decision, not just a code change. Carrier-reserved
 * words (STOP, HELP, …) are NEVER campaign keywords — Twilio handles them at
 * the account layer and we must not shadow them.
 */

export type InboundIntent = 'home';

export interface KeywordDef {
  /** Canonical, uppercase. */
  keyword: string;
  intent: InboundIntent;
}

/**
 * Carrier/Twilio-reserved words. We never treat these as campaign keywords;
 * returning null for them lets Twilio's built-in STOP/HELP handling own them.
 */
export const RESERVED_WORDS = new Set<string>([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'START',
  'YES',
  'UNSTOP',
  'HELP',
  'INFO',
]);

const KEYWORDS: KeywordDef[] = [{ keyword: 'HOME', intent: 'home' }];

const BY_KEYWORD = new Map<string, KeywordDef>(KEYWORDS.map((k) => [k.keyword, k]));

/**
 * Extract the campaign keyword from an inbound SMS body.
 *
 * Rules:
 *   - The FIRST real (alphanumeric) word decides. Leading emoji/punctuation
 *     tokens are skipped, so "🙏 HOME", "Home!", and "home please" all match
 *     HOME, while "please HOME" does not (the campaign says text HOME).
 *   - Strip surrounding punctuation, then uppercase.
 *   - If that first real word is a reserved carrier word (STOP, HELP, …),
 *     return null so Twilio's built-in handling owns the message.
 *
 * Returns the matched KeywordDef, or null if nothing is recognized.
 */
export function matchKeyword(body: string): KeywordDef | null {
  if (!body) return null;
  const tokens = body.trim().split(/\s+/);
  for (const token of tokens) {
    const cleaned = token
      .replace(/^[^a-zA-Z0-9]+/, '')
      .replace(/[^a-zA-Z0-9]+$/, '')
      .toUpperCase();
    if (!cleaned) continue; // pure punctuation/emoji — skip to the first real word
    if (RESERVED_WORDS.has(cleaned)) return null;
    return BY_KEYWORD.get(cleaned) ?? null;
  }
  return null;
}
