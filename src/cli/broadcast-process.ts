/**
 * broadcast:process — run one cycle of the broadcast response processor.
 *
 * Sweeps inbound_responses (people who texted "HOME"), mirrors new ones into
 * PCO, records signals, runs the free-text scan, and enrolls the 21-day
 * journey. Idempotent. Intended to run on a ~1-minute cron alongside the
 * webhook.
 *
 * SAFETY: the live PCO write is gated by BROADCAST_PCO_WRITE_ENABLED (default
 * false). With the flag off this is a no-op and rows stay in the callback
 * queue — exactly Phase F behavior. Flip it to 'true' only after a controlled
 * smoke test (text HOME from your own phone, watch the record appear, delete).
 *
 * Usage:
 *   npm run broadcast:process
 *   npm run broadcast:process -- --json
 */

import { loadEnv } from '../config/env.ts';
import { getDb } from '../db/client.ts';
import { PcoClient, PcoError } from '../pco/client.ts';
import {
  processInboundResponses,
  makePcoPersonWriter,
  type ProcessResult,
} from '../inbound/index.ts';

function printHumanSummary(r: ProcessResult, pcoWriteEnabled: boolean): void {
  console.log('Broadcast response processor — run complete\n');
  if (!pcoWriteEnabled) {
    console.log('  ⚠ BROADCAST_PCO_WRITE_ENABLED is false — PCO write is OFF.');
    console.log('    Responses stay in the callback queue for manual handling.');
    console.log(`    Rows skipped (disabled): ${r.skippedDisabled}\n`);
    return;
  }
  console.log(`  Examined:             ${r.examined}`);
  console.log(`  Processed:            ${r.processed}`);
  console.log(`  PCO people created:   ${r.pcoCreated}`);
  console.log(`  Linked to existing:   ${r.linkedExisting}`);
  console.log(`  Journeys enrolled:    ${r.enrolled}`);
  console.log(`  Prayer signals:       ${r.prayerSignals}`);
  console.log(`  Salvation flagged:    ${r.salvationFlagged}`);
  console.log('');
}

async function main(): Promise<void> {
  const json = process.argv.slice(2).includes('--json');
  const env = loadEnv();
  const db = getDb();

  const pcoWriteEnabled = env.BROADCAST_PCO_WRITE_ENABLED;
  const writer = pcoWriteEnabled
    ? makePcoPersonWriter(new PcoClient({ appId: env.PCO_APP_ID, secret: env.PCO_SECRET }))
    : null;

  const result = await processInboundResponses(db, { pcoWriteEnabled, writer });

  if (json) {
    process.stdout.write(JSON.stringify({ pcoWriteEnabled, ...result }, null, 2) + '\n');
  } else {
    printHumanSummary(result, pcoWriteEnabled);
  }
}

main().catch((err: unknown) => {
  if (err instanceof PcoError) {
    console.error(`\nPCO request failed: ${err.message}`);
    if (err.status === 401) console.error('  → Check PCO_APP_ID and PCO_SECRET in .env.');
    if (err.status === 403)
      console.error('  → The PCO token lacks People write scope. Re-generate with broader access.');
    if (err.body) {
      console.error('  → Body:', typeof err.body === 'string' ? err.body : JSON.stringify(err.body));
    }
  } else if (err instanceof Error) {
    console.error(`\n${err.message}`);
  } else {
    console.error('\nUnknown error:', err);
  }
  process.exit(1);
});
