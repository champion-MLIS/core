/**
 * Voice rules — loaded from templates/voice-samples.md at runtime.
 *
 * Why runtime: Champion's voice is owned by Pastor Stephen, not the
 * developer. When voice-samples.md changes, the next agent run should pick
 * it up automatically — no rebuild, no redeploy. The file is small (~3KB)
 * and the read happens once per process.
 *
 * Cached after the first read in a given process so we don't re-read disk
 * on every queue item.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const VOICE_SAMPLES_PATH = join(here, '..', '..', 'templates', 'voice-samples.md');

let cached: string | null = null;

export async function loadVoiceRules(): Promise<string> {
  if (cached) return cached;
  cached = await readFile(VOICE_SAMPLES_PATH, 'utf8');
  return cached;
}

/** Reset for tests. */
export function _resetVoiceRulesCache(): void {
  cached = null;
}

/** Inject voice rules directly. Tests only. */
export function _setVoiceRulesForTesting(text: string): void {
  cached = text;
}
