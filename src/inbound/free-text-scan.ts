/**
 * Free-text scan of an inbound broadcast message (Phase F.2).
 *
 * Someone might text far more than the keyword: "HOME I gave my life to Christ
 * today" or "HOME please pray, my marriage is falling apart" or something in
 * acute crisis. This deterministic scan reads the body and flags three things
 * so the processor can route appropriately. It is intentionally rule-based
 * (no AI) — fast, predictable, and auditable, in the spirit of ADR-004's
 * deterministic constraint scan.
 *
 * The three categories drive very different handling:
 *   - salvation → a joyful, high-priority marker. Does NOT block the journey.
 *   - prayer    → opens the ADR-004 prayer path in parallel (a real person
 *                 follows up on the request; the welcome already promised one).
 *   - crisis    → acute danger language. This PAUSES automation: the processor
 *                 raises a pastoral_flag (override) so no cheerful journey runs;
 *                 a human owns the situation immediately.
 *
 * False positives are acceptable here — over-flagging routes a message to a
 * human, which is the safe direction. We surface the matched terms so staff
 * see why something was flagged.
 */

export interface FreeTextScanResult {
  salvation: boolean;
  prayer: boolean;
  crisis: boolean;
  /** The specific phrases that matched, for transparency in the UI/logs. */
  matched: { salvation: string[]; prayer: string[]; crisis: string[] };
}

// Acute-danger language. Deliberately broad; a false positive just gets a
// human looking sooner. Checked FIRST — crisis dominates everything else.
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill (myself|me)\b/i,
  /\bend (my|it all|my life)\b/i,
  /\b(want|going) to die\b/i,
  /\bsuicid/i,
  /\bhurt (myself|me)\b/i,
  /\bharm (myself|me)\b/i,
  /\bno reason to live\b/i,
  /\bcan'?t go on\b/i,
  /\boverdose\b/i,
];

// Positive decision / first-time-faith language.
const SALVATION_PATTERNS: RegExp[] = [
  /\bgave my life\b/i,
  /\bgive my life\b/i,
  /\bgot saved\b/i,
  /\bsaved today\b/i,
  /\bwant to be saved\b/i,
  /\baccept(ed)? (christ|jesus)\b/i,
  /\breceiv(e|ed) (christ|jesus)\b/i,
  /\bborn again\b/i,
  /\b(follow|following) jesus\b/i,
  /\bfirst time\b/i,
  /\bgive my heart\b/i,
  /\bmade a decision\b/i,
];

// Prayer-request / personal-need language.
const PRAYER_PATTERNS: RegExp[] = [
  /\bpray(ing|er)?\b/i,
  /\bplease pray\b/i,
  /\bstruggl/i,
  /\bmy marriage\b/i,
  /\bdivorce\b/i,
  /\bpassed away\b/i,
  /\bdiagnos/i,
  /\bdepress/i,
  /\baddict/i,
  /\blost my\b/i,
  /\bsick\b/i,
  /\bhospital\b/i,
];

function collect(body: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

export function scanFreeText(body: string): FreeTextScanResult {
  const text = body ?? '';
  const crisis = collect(text, CRISIS_PATTERNS);
  const salvation = collect(text, SALVATION_PATTERNS);
  const prayer = collect(text, PRAYER_PATTERNS);
  return {
    salvation: salvation.length > 0,
    prayer: prayer.length > 0,
    crisis: crisis.length > 0,
    matched: { salvation, prayer, crisis },
  };
}
