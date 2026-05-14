/**
 * pco:recent — Step 1 probe.
 *
 * Lists the N most recently created people in PCO. Prints a compact
 * human-readable summary AND emits the full normalized record to stdout
 * as JSON when --json is passed, so the next pipeline step (Guest Intake
 * Agent) can consume it directly.
 *
 * Usage:
 *   npm run pco:recent
 *   npm run pco:recent -- --limit=10
 *   npm run pco:recent -- --limit=20 --json
 */

import { loadEnv } from '../config/env.ts';
import { PcoClient, PcoError } from '../pco/client.ts';
import { listPeople, primaryEmail, primaryPhone } from '../pco/people.ts';
import type { PcoIncluded, PcoPerson } from '../pco/types.ts';

interface CliArgs {
  limit: number;
  json: boolean;
}

interface PersonSummary {
  pco_id: string;
  name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  household_id: string | null;
  is_child: boolean | null;
  membership: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let limit = 20;
  let json = false;
  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) limit = parsed;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { limit, json };
}

function printHelp(): void {
  console.log(`pco:recent — list the most recently created PCO people

Usage:
  npm run pco:recent                  # last 20, human-readable
  npm run pco:recent -- --limit=10    # last 10
  npm run pco:recent -- --json        # JSON output for piping

Flags:
  --limit=N    Number of people to fetch (1-100, default 20)
  --json       Emit JSON to stdout (one array)
  --help, -h   Show this help`);
}

function summarize(person: PcoPerson, included: PcoIncluded[]): PersonSummary {
  const attrs = person.attributes;
  const composed = [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim();
  const fullName = attrs.name ?? (composed || '(no name)');
  const householdRef = person.relationships?.['households']?.data;
  const householdId = Array.isArray(householdRef)
    ? (householdRef[0]?.id ?? null)
    : (householdRef?.id ?? null);

  return {
    pco_id: person.id,
    name: fullName,
    preferred_name: attrs.nickname ?? attrs.given_name ?? null,
    email: primaryEmail(person, included),
    phone: primaryPhone(person, included),
    household_id: householdId,
    is_child: attrs.child ?? null,
    membership: attrs.membership ?? null,
    status: attrs.status ?? null,
    created_at: attrs.created_at,
    updated_at: attrs.updated_at ?? null,
  };
}

function printHumanReadable(summaries: PersonSummary[]): void {
  if (summaries.length === 0) {
    console.log('No people returned.');
    return;
  }
  console.log(`Most recent ${summaries.length} people in PCO:\n`);
  for (const s of summaries) {
    const contact = [s.email, s.phone].filter(Boolean).join(' · ') || '(no contact info)';
    const tags = [
      s.is_child ? 'child' : null,
      s.membership,
      s.status && s.status !== 'active' ? `status:${s.status}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    console.log(`  ${s.created_at}  ${s.name}  [${s.pco_id}]`);
    console.log(`    ${contact}`);
    if (tags) console.log(`    ${tags}`);
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();

  const client = new PcoClient({ appId: env.PCO_APP_ID, secret: env.PCO_SECRET });

  const { people, included } = await listPeople(client, {
    perPage: args.limit,
    order: '-created_at',
    include: ['emails', 'phone_numbers', 'households'],
  });

  const summaries = people.map((p) => summarize(p, included));

  if (args.json) {
    process.stdout.write(JSON.stringify(summaries, null, 2) + '\n');
  } else {
    printHumanReadable(summaries);
  }
}

main().catch((err: unknown) => {
  if (err instanceof PcoError) {
    console.error(`\nPCO request failed: ${err.message}`);
    if (err.status === 401) {
      console.error('  → Check PCO_APP_ID and PCO_SECRET in .env.');
    } else if (err.status === 429) {
      console.error('  → Rate limited. PCO allows 100 requests / 20 seconds.');
    }
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
