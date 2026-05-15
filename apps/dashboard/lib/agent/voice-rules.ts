/**
 * Load Champion's voice rules from templates/voice-samples.md at runtime.
 *
 * Why runtime: the voice spec is owned by Pastor Stephen. When he edits
 * templates/voice-samples.md, the next draft picks up the changes —
 * no rebuild, no redeploy.
 *
 * Process-cached so we don't re-read disk for every draft in a session.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const VOICE_SAMPLES_PATH = path.join(
  process.cwd(),
  '..',
  '..',
  'templates',
  'voice-samples.md',
);

let cached: string | null = null;

export async function loadVoiceRules(): Promise<string> {
  if (cached) return cached;
  cached = await readFile(VOICE_SAMPLES_PATH, 'utf8');
  return cached;
}
