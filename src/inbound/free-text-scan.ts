/**
 * Free-text scan of an inbound broadcast message (Phase F.2).
 *
 * Someone might text far more than the keyword: "HOME I gave my life to Christ
 * today" or "HOME please pray for my marriage." This deterministic scan reads
 * the body and flags two things so the processor can route appropriately. It is
 * intentionally rule-based (no AI) — fast, predictable, and auditable, in the
 * spirit of ADR-004's deterministic constraint scan.
 *
 * The two categories drive different handling:
 *   - salvation → a joyful, high-priority marker. Does NOT block the journey.
 *   - prayer    → opens the ADR-004 prayer path in parallel (a real person
 *                 follows up on the request; the welcome already promised one).
 *
 * This program is for everyday people looking for a church home. Every
 * responder is promised a real human within 24 hours; that human is the care.
 * Staff can pause automation for any person at any time.
 *
 * We surface the matched terms so staff see why something was flagged.
 */

export interface FreeTextScanResult {
  salvation: boolean;
  prayer: boolean;
  /** The specific phrases that matched, for transparency in the UI/logs. */
  matched: { salvation: string[]; prayer: string[] };
}

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
  const salvation = collect(text, SALVATION_PATTERNS);
  const prayer = collect(text, PRAYER_PATTERNS);
  return {
    salvation: salvation.length > 0,
    prayer: prayer.length > 0,
    matched: { salvation, prayer },
  };
}
