/**
 * attendance:record — manually record a service_attendance signal.
 *
 * Bridge for PCO Check-Ins integration (Step 3.2). Staff use this when
 * they observe a guest at a second service and want the return-detection
 * pipeline to fire.
 *
 * Usage:
 *   npm run attendance:record -- --person=12345 --date=2026-05-22
 *   npm run attendance:record -- --person=12345 --date=2026-05-22 --json
 *
 * After writing the signal, runs processReturnSignals() so any matching
 * recovery touches cancel in the same invocation.
 */

import { loadEnv } from '../config/env.ts';
import { getDb } from '../db/client.ts';
import { recordAttendance } from '../journey/attendance.ts';
import { processReturnSignals } from '../journey/return-detection.ts';

interface CliArgs {
  personPcoId: string;
  serviceDate: Date;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let person: string | null = null;
  let dateStr: string | null = null;
  let json = false;
  for (const arg of argv) {
    if (arg.startsWith('--person=')) {
      person = arg.slice('--person='.length);
    } else if (arg.startsWith('--date=')) {
      dateStr = arg.slice('--date='.length);
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!person) {
    console.error('Missing --person=<PCO_ID>');
    printHelp();
    process.exit(1);
  }
  if (!dateStr) {
    console.error('Missing --date=<YYYY-MM-DD>');
    printHelp();
    process.exit(1);
  }

  // Accept YYYY-MM-DD or any ISO datetime.
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    console.error(`--date=${dateStr} is not a parseable date (use YYYY-MM-DD).`);
    process.exit(1);
  }

  return { personPcoId: person, serviceDate: parsed, json };
}

function printHelp(): void {
  console.log(`attendance:record — write a service_attendance signal

Usage:
  npm run attendance:record -- --person=<PCO_ID> --date=<YYYY-MM-DD>
  npm run attendance:record -- --person=12345 --date=2026-05-22 --json

What it does:
  1. Validates the person is in the MLIS people mirror.
  2. Writes an idempotent service_attendance engagement_signal for that day.
  3. Runs processReturnSignals — any matching guest_journey transitions to
     'returned' and pending recovery touches cancel.

Idempotent — running the same person+date twice writes one signal.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const db = getDb();

  const result = await recordAttendance(db, {
    personPcoId: args.personPcoId,
    serviceDate: args.serviceDate,
    recordedBy: 'cli',
  });

  if (result.outcome === 'person_not_mirrored') {
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      console.error(`\n${result.reason}`);
    }
    process.exit(1);
  }

  const returnResult = await processReturnSignals(db);

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ attendance: result, return_detection: returnResult }, null, 2) + '\n',
    );
    return;
  }

  if (result.outcome === 'recorded') {
    console.log(`Recorded service_attendance for ${args.personPcoId} on ${args.serviceDate.toISOString().slice(0, 10)}.`);
    console.log(`  signal id: ${result.signalId}`);
  } else {
    console.log(`Attendance already recorded for ${args.personPcoId} on ${args.serviceDate.toISOString().slice(0, 10)} — no-op.`);
    console.log(`  signal id: ${result.signalId}`);
  }

  console.log(`\nReturn detection pass:`);
  console.log(`  Journeys transitioned to 'returned': ${returnResult.journeysReturned}`);
  console.log(`  Recovery touches cancelled:          ${returnResult.touchesCancelled}`);
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(`\n${err.message}`);
  } else {
    console.error('\nUnknown error:', err);
  }
  process.exit(1);
});
