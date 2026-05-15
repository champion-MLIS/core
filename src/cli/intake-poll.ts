/**
 * intake:poll — run one cycle of the Guest Intake Agent.
 *
 * Pulls a page of recent people from PCO and mirrors them into Supabase.
 * Idempotent — safe to re-run repeatedly.
 *
 * Usage:
 *   npm run intake:poll
 *   npm run intake:poll -- --page=100
 *   npm run intake:poll -- --json
 */

import { loadEnv } from '../config/env.ts';
import { getDb } from '../db/client.ts';
import { PcoError } from '../pco/client.ts';
import { getCms } from '../cms/index.ts';
import { runIntakeMirror, type MirrorResult } from '../intake/mirror.ts';

interface CliArgs {
  pageSize: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let pageSize = 50;
  let json = false;
  for (const arg of argv) {
    if (arg.startsWith('--page=')) {
      const parsed = Number.parseInt(arg.slice('--page='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) pageSize = parsed;
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
  console.log(`intake:poll — run one cycle of the Guest Intake Agent

Usage:
  npm run intake:poll                # default page size (50)
  npm run intake:poll -- --page=100  # max page size
  npm run intake:poll -- --json      # JSON output for piping

Flags:
  --page=N     PCO page size (1-100, default 50)
  --json       Emit JSON to stdout instead of a human summary
  --help, -h   Show this help`);
}

function printHumanSummary(r: MirrorResult): void {
  console.log('Guest Intake Agent — poll complete\n');
  console.log(`  Started:    ${r.pollStartedAt}`);
  console.log(`  Finished:   ${r.pollCompletedAt}`);
  console.log(`  Watermark:  ${r.watermarkBefore ?? '(cold start)'} → ${r.watermarkAfter ?? '(no progress)'}`);
  console.log('');
  console.log(`  PCO records examined:        ${r.recordsExamined}`);
  console.log(`  People upserted:             ${r.peopleUpserted}`);
  console.log(`  Households upserted:         ${r.householdsUpserted}`);
  console.log(`  Contacts upserted:           ${r.contactsUpserted}  (emails + phones)`);
  if (r.peopleSkippedFlagged > 0) {
    console.log(`  Skipped — pastoral flag:     ${r.peopleSkippedFlagged}`);
  }
  console.log('');
  if (r.recordsExamined === 0) {
    console.log('  PCO returned no records. Nothing to mirror.');
  } else if (r.peopleUpserted === 0 && r.peopleSkippedFlagged === 0) {
    console.log('  No new records since the last watermark. Mirror is in sync.');
  } else {
    console.log('  Mirror up to date through the latest record in this page.');
    console.log('  Re-run to advance further if PCO has more.');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const db = getDb();
  const cms = getCms();

  const result = await runIntakeMirror(db, cms, { pageSize: args.pageSize });

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
    if (err.body) {
      console.error('  → Body:', typeof err.body === 'string' ? err.body : JSON.stringify(err.body));
    }
  } else if (err instanceof Error) {
    console.error(`\n${err.message}`);
    if (err.message.includes('SUPABASE')) {
      console.error('  → Check SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env.');
    }
  } else {
    console.error('\nUnknown error:', err);
  }
  process.exit(1);
});
