/**
 * Map PCO forms to engagement signal kinds.
 *
 * Default behavior: classify by form name pattern. Churches usually name
 * their forms in predictable ways ("Connect Card", "Prayer Request", etc.)
 * — so this works out of the box for most cases.
 *
 * Override behavior: explicit form IDs in env, e.g.
 *   PCO_CONNECT_CARD_FORM_IDS=12345,67890
 *   PCO_PRAYER_REQUEST_FORM_IDS=11111
 * If a form's id is in an override list, that classification wins.
 *
 * This is one of the few places where Champion-specific terminology lives.
 * For Church Reimagined transferability, the patterns are deliberately
 * generic — any church using common form names will work out of the box.
 */

import type { Enums } from '../db/index.ts';

type SignalKind = Enums['engagement_signal_kind'];

/** What classifyForm returns when no signal kind applies. */
export type Classification = SignalKind | 'none';

const CONNECT_CARD_PATTERNS = [
  /\bconnect\s*card\b/i,
  /\bconnection\s*card\b/i,
  /\bwelcome\s*card\b/i,
  /\bguest\s*card\b/i,
  /\bnew\s*(here|guest)\b/i,
  /\bfirst[-\s]?time\s*guest\b/i,
  /\bi'?m\s*new\b/i,
];

const PRAYER_REQUEST_PATTERNS = [
  /\bprayer\s*request\b/i,
  /\bpray\s*for\s*me\b/i,
  /\bprayer\s*card\b/i,
  /\bsubmit\s*a\s*prayer\b/i,
];

function parseIdList(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function getOverrides() {
  return {
    connect_card: parseIdList(process.env['PCO_CONNECT_CARD_FORM_IDS']),
    prayer_request: parseIdList(process.env['PCO_PRAYER_REQUEST_FORM_IDS']),
  };
}

/**
 * Classify a PCO form into the engagement_signal_kind it produces.
 * Returns 'none' if no rule matches — submissions from that form are ignored.
 */
export function classifyForm(formId: string, formName: string): Classification {
  const overrides = getOverrides();

  if (overrides.connect_card.has(formId)) return 'connect_card';
  if (overrides.prayer_request.has(formId)) return 'prayer_request';

  if (CONNECT_CARD_PATTERNS.some((p) => p.test(formName))) return 'connect_card';
  if (PRAYER_REQUEST_PATTERNS.some((p) => p.test(formName))) return 'prayer_request';

  return 'none';
}
