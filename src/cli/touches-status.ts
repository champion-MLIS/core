/**
 * touches:status — inspect a guest's journey + 8-touch schedule.
 *
 * Usage:
 *   npm run touches:status -- --person=PCO_ID
 *   npm run touches:status -- --person=PCO_ID --json
 */

import { loadEnv } from '../config/env.ts';
import { getDb } from '../db/client.ts';
import type { JourneyRow, TouchRow } from '../db/index.ts';

interface CliArgs {
  person: string | null;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let person: string | null = null;
  let json = false;
  for (const arg of argv) {
    if (arg.startsWith('--person=')) {
      person = arg.slice('--person='.length).trim();
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { person, json };
}

function printHelp(): void {
  console.log(`touches:status — show a guest's 21-day journey

Usage:
  npm run touches:status -- --person=PCO_ID
  npm run touches:status -- --person=PCO_ID --json`);
}

function statusEmoji(s: TouchRow['status']): string {
  switch (s) {
    case 'pending':
      return '⏳';
    case 'drafting':
      return '✍️';
    case 'awaiting_action':
      return '👤';
    case 'completed':
      return '✅';
    case 'missed':
      return '❌';
    case 'na':
      return '➖';
  }
}

function journeyEmoji(s: JourneyRow['status']): string {
  switch (s) {
    case 'active':
      return '🟢';
    case 'returned':
      return '🎉';
    case 'completed':
      return '✅';
    case 'cancelled':
      return '⛔';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.person) {
    console.error('--person=PCO_ID is required');
    process.exit(1);
  }
  loadEnv();
  const db = getDb();

  const { data: person, error: pErr } = await db
    .from('people')
    .select('pco_id, first_name, last_name, preferred_name, current_stage')
    .eq('pco_id', args.person)
    .maybeSingle();
  if (pErr) throw new Error(`person lookup failed: ${pErr.message}`);
  if (!person) {
    console.error(`Person ${args.person} not in the Supabase mirror. Run intake:poll first.`);
    process.exit(1);
  }

  const { data: journeys, error: jErr } = await db
    .from('guest_journeys')
    .select('*')
    .eq('person_pco_id', args.person)
    .order('enrolled_at', { ascending: false });
  if (jErr) throw new Error(`journeys lookup failed: ${jErr.message}`);

  if (!journeys || journeys.length === 0) {
    if (args.json) {
      process.stdout.write(JSON.stringify({ person, journeys: [] }, null, 2) + '\n');
    } else {
      const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
      console.log(`\n${name} (${person.pco_id}) — no journey enrolled.`);
      console.log(`  Current stage: ${person.current_stage}`);
    }
    return;
  }

  const all: Array<{ journey: JourneyRow; touches: TouchRow[] }> = [];
  for (const j of journeys) {
    const { data: touches, error: tErr } = await db
      .from('touches')
      .select('*')
      .eq('journey_id', j.id)
      .order('touch_number', { ascending: true });
    if (tErr) throw new Error(`touches lookup failed: ${tErr.message}`);
    all.push({ journey: j as JourneyRow, touches: (touches as TouchRow[]) ?? [] });
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ person, journeys: all }, null, 2) + '\n');
    return;
  }

  const name =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() ||
    person.preferred_name ||
    '(unnamed)';
  console.log(`\n${name} (${person.pco_id}) — current stage: ${person.current_stage}\n`);

  for (const { journey, touches } of all) {
    console.log(
      `  ${journeyEmoji(journey.status)} Journey ${journey.id.slice(0, 8)}  status: ${journey.status}  enrolled: ${journey.enrolled_at}`,
    );
    console.log(`     trigger: ${journey.enrollment_kind}`);
    if (journey.returned_at) console.log(`     returned at: ${journey.returned_at}`);
    if (journey.cancelled_at) console.log(`     cancelled at: ${journey.cancelled_at} (${journey.cancel_reason})`);
    console.log('');
    for (const t of touches) {
      const recovery = t.is_recovery ? ' [recovery]' : '';
      const label =
        (t.payload as { label?: string } | null)?.label ?? `Touch ${t.touch_number}`;
      console.log(
        `       ${statusEmoji(t.status)} Touch ${t.touch_number}: ${label}${recovery}`,
      );
      console.log(`          owner: ${t.owner_role}  kind: ${t.kind}  scheduled: ${t.scheduled_for}`);
      if (t.completed_at) console.log(`          completed: ${t.completed_at} by ${t.completed_by ?? 'unknown'}`);
      if (t.notes) console.log(`          note: ${t.notes}`);
    }
    console.log('');
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) console.error(`\n${err.message}`);
  else console.error('\nUnknown error:', err);
  process.exit(1);
});
