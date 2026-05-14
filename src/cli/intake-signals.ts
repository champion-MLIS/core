/**
 * intake:signals — run one cycle of the signal poller.
 *
 * Polls each PCO form that classifies as a trigger signal (connect_card or
 * prayer_request), records engagement_signals, and enqueues followup_queue
 * rows for anyone currently at the 'guest' stage. Idempotent.
 *
 * Usage:
 *   npm run intake:signals
 *   npm run intake:signals -- --page=100
 *   npm run intake:signals -- --json
 */

import { loadEnv } from '../config/env.ts';
import { getDb } from '../db/client.ts';
import { PcoClient, PcoError } from '../pco/client.ts';
import { runSignalsPoll, type SignalsPollResult } from '../intake/signals.ts';

interface CliArgs {
  pageSize: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let pageSize = 50;
  let json = false;
  for (const arg of argv) {
    if (arg.startsWith('--page=')) {
      const n = Number.parseInt(arg.slice('--page='.length), 10);
      if (Number.isFinite(n) && n > 0 && n <= 100) pageSize = n;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { pageSize, json };
}

function printHelp(): void {
  console.log(`intake:signals — poll PCO forms for trigger signals

Usage:
  npm run intake:signals               # default page size 50
  npm run intake:signals -- --page=100 # max page size
  npm run intake:signals -- --json     # JSON output

Auto-classifies forms by name. Override in .env:
  PCO_CONNECT_CARD_FORM_IDS=12345,67890
  PCO_PRAYER_REQUEST_FORM_IDS=11111`);
}

function printHumanSummary(r: SignalsPollResult): void {
  console.log('Signal poller — run complete\n');
  console.log(`  Forms examined:              ${r.formsExamined}`);
  console.log(`  Forms producing signals:     ${r.formsWithSignals}`);
  console.log(`  Submissions examined:        ${r.submissionsExamined}`);
  console.log(`  Signals recorded:            ${r.signalsRecorded}`);
  console.log(`  Follow-ups enqueued:         ${r.followupsEnqueued}`);
  if (r.peopleSkippedNotMirrored > 0) {
    console.log(`  Skipped — not yet mirrored:  ${r.peopleSkippedNotMirrored} (run intake:poll first)`);
  }
  if (r.peopleSkippedFlagged > 0) {
    console.log(`  Skipped — pastoral flag:     ${r.peopleSkippedFlagged}`);
  }
  console.log('');

  if (r.formsWithSignals === 0) {
    console.log('  No forms classified as signal-producing.');
    console.log("  Run `npm run pco:forms` to see what's available and override in .env if needed.");
    return;
  }

  for (const f of r.byForm) {
    console.log(`  ${f.formName}  [${f.formId}, ${f.classifiedAs}]`);
    console.log(`    submissions:    ${f.submissionsExamined}`);
    console.log(`    new signals:    ${f.signalsRecorded}`);
    console.log(`    enqueued:       ${f.followupsEnqueued}`);
    if (f.peopleSkippedNotGuest > 0) {
      console.log(`    not at guest:   ${f.peopleSkippedNotGuest} (already past guest stage)`);
    }
    console.log(`    watermark:      ${f.watermarkBefore ?? '(cold)'} → ${f.watermarkAfter ?? '(none)'}`);
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();

  const db = getDb();
  const pco = new PcoClient({ appId: env.PCO_APP_ID, secret: env.PCO_SECRET });

  const result = await runSignalsPoll(db, pco, { pageSize: args.pageSize });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printHumanSummary(result);
  }
}

main().catch((err: unknown) => {
  if (err instanceof PcoError) {
    console.error(`\nPCO request failed: ${err.message}`);
    if (err.status === 401) console.error('  → Check PCO_APP_ID and PCO_SECRET in .env.');
    if (err.status === 403)
      console.error('  → The PCO token lacks Forms scope. Re-generate with broader access.');
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
