/**
 * prayer:respond — process pending prayer_request engagement signals.
 *
 * Scans engagement_signals for kind='prayer_request' that have not yet
 * been captured into prayer_requests, then runs the Prayer Response
 * Agent on each.
 *
 * Usage:
 *   npm run prayer:respond                    # process pending signals
 *   npm run prayer:respond -- --dry-run       # don't actually send
 *   npm run prayer:respond -- --escalation    # only run the 48h escalation check
 *   npm run prayer:respond -- --json          # JSON output
 *
 * Sending: this CLI cannot reach Twilio/Resend from the src/ workspace
 * (those deps live in apps/dashboard). For real sends, run the Prayer
 * Response Agent from the dashboard via the prayer-respond server action
 * once it ships in milestone 3. This CLI uses NoOpSender — useful for
 * dry-runs, escalation sweeps, and end-to-end testing against the DB.
 */

import { loadEnv, loadAgentEnv } from '../config/env.ts';
import { getDb } from '../db/client.ts';
import { AnthropicClaudeClient } from '../agent/claude.ts';
import {
  processPrayerSignal,
  runEscalationCheck,
  NoOpSender,
  type PrayerResponseResult,
} from '../agent/prayer-response/index.ts';
import type { EngagementSignalRow } from '../db/index.ts';

interface CliArgs {
  dryRun: boolean;
  escalationOnly: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let escalationOnly = false;
  let json = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--escalation' || arg === '--escalation-only') escalationOnly = true;
    else if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { dryRun, escalationOnly, json };
}

function printHelp(): void {
  console.log(`prayer:respond — process pending prayer_request signals

Usage:
  npm run prayer:respond                    # process pending + run escalation
  npm run prayer:respond -- --dry-run       # process without sending
  npm run prayer:respond -- --escalation    # only run the 48h escalation check
  npm run prayer:respond -- --json          # JSON output

Note: this CLI uses NoOpSender — actual SMS/email sending must happen
from the dashboard (where Twilio/Resend deps live). Use --dry-run to
walk through the capture + draft + voice-check flow against real
Supabase without hitting the wire.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const db = getDb();
  const results: PrayerResponseResult[] = [];

  if (!args.escalationOnly) {
    const env = loadAgentEnv();
    const claude = new AnthropicClaudeClient(env.ANTHROPIC_API_KEY);

    // Find prayer_request signals without a captured prayer_requests row.
    const { data: signals, error: sErr } = await db
      .from('engagement_signals')
      .select('*')
      .eq('kind', 'prayer_request')
      .order('occurred_at', { ascending: true });
    if (sErr) throw new Error(`engagement_signals fetch failed: ${sErr.message}`);

    for (const sig of (signals as EngagementSignalRow[] | null) ?? []) {
      const result = await processPrayerSignal(db, claude, NoOpSender, sig, {
        draftModel: env.ANTHROPIC_DRAFT_MODEL,
        voiceCheckModel: env.ANTHROPIC_VOICE_CHECK_MODEL,
        dryRun: args.dryRun || true, // CLI always dry-runs the wire — see note above
      });
      results.push(result);
    }
  }

  const escalation = await runEscalationCheck(db);

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ processed: results, escalation }, null, 2) + '\n',
    );
    return;
  }

  console.log(`Prayer Response Agent — run complete\n`);
  console.log(`  Signals processed:           ${results.length}`);
  const byOutcome = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  for (const [outcome, count] of Object.entries(byOutcome)) {
    console.log(`    ${outcome.padEnd(28)} ${count}`);
  }
  console.log('');
  console.log(`  Escalation pass:`);
  console.log(`    Examined:                  ${escalation.examined}`);
  console.log(`    Escalated to pastoral flag: ${escalation.escalated}`);
  if (escalation.errors > 0) {
    console.log(`    Errors:                    ${escalation.errors}`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(`\n${err.message}`);
  } else {
    console.error('\nUnknown error:', err);
  }
  process.exit(1);
});
