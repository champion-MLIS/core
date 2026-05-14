/**
 * agent:draft — run the Guest Follow-Up Agent against pending followups.
 *
 * Usage:
 *   npm run agent:draft                              # process up to 10 pending
 *   npm run agent:draft -- --batch=3
 *   npm run agent:draft -- --dry-run                 # don't write DB updates
 *   npm run agent:draft -- --person=1001 --dry-run   # draft for one specific
 *                                                    #   person without queue
 *   npm run agent:draft -- --json
 */

import { loadAgentEnv } from '../config/env.ts';
import { getDb, type Db } from '../db/client.ts';
import { AnthropicClaudeClient } from '../agent/claude.ts';
import { linksFromEnv } from '../agent/links.ts';
import { runFollowUpAgent } from '../agent/follow-up.ts';
import { generateDraft } from '../agent/draft.ts';
import { checkVoice } from '../agent/voice-check.ts';
import { loadVoiceRules } from '../agent/voice-rules.ts';
import type { DraftContext } from '../agent/prompts.ts';

interface CliArgs {
  batch: number;
  dryRun: boolean;
  json: boolean;
  /** Single-person draft mode (no queue read). */
  person: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  let batch = 10;
  let dryRun = false;
  let json = false;
  let person: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--batch=')) {
      const n = Number.parseInt(arg.slice('--batch='.length), 10);
      if (Number.isFinite(n) && n > 0) batch = n;
    } else if (arg.startsWith('--person=')) {
      person = arg.slice('--person='.length).trim();
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return { batch, dryRun, json, person };
}

function printHelp(): void {
  console.log(`agent:draft — run the Guest Follow-Up Agent

Usage:
  npm run agent:draft                            # process up to 10 pending
  npm run agent:draft -- --batch=N               # process up to N
  npm run agent:draft -- --dry-run               # don't write DB updates
  npm run agent:draft -- --person=PCO_ID --dry-run
      # draft a single test message for one specific person — does NOT
      # require a followup_queue row. Always use --dry-run with this.

Flags:
  --batch=N    Max queue rows to process (default 10)
  --person=ID  Single-person mode (PCO id); pair with --dry-run
  --dry-run    Don't write DB updates
  --json       Emit JSON to stdout
  --help, -h   Show this help`);
}

async function singlePersonDryRun(args: CliArgs, db: Db): Promise<void> {
  if (!args.person) throw new Error('--person required');
  const personPcoId: string = args.person;
  const env = loadAgentEnv();
  const claude = new AnthropicClaudeClient(env.ANTHROPIC_API_KEY);
  const links = linksFromEnv(env);
  const voiceRules = await loadVoiceRules();

  // Build context directly from DB without queue row
  const { data: person, error: pErr } = await db
    .from('people')
    .select('*')
    .eq('pco_id', personPcoId)
    .maybeSingle();
  if (pErr) throw new Error(`person fetch failed: ${pErr.message}`);
  if (!person) {
    throw new Error(`Person ${personPcoId} not found in the Supabase mirror. Run intake:poll first.`);
  }

  const { data: emailRow } = await db
    .from('emails')
    .select('address')
    .eq('person_pco_id', personPcoId)
    .eq('blocked', false)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: phoneRow } = await db
    .from('phone_numbers')
    .select('number')
    .eq('person_pco_id', personPcoId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  const householdId = person.household_pco_id;
  const householdHasChildren = householdId
    ? await (async () => {
        const { data } = await db
          .from('people')
          .select('pco_id')
          .eq('household_pco_id', householdId)
          .eq('is_child', true)
          .limit(1)
          .maybeSingle();
        return data !== null;
      })()
    : false;

  const name = person.preferred_name ?? person.first_name ?? '(friend)';
  const fullName =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || name;

  const ctx: DraftContext = {
    name,
    fullName,
    hasEmail: emailRow !== null,
    hasSms: phoneRow !== null,
    triggerKind: 'connect_card',
    triggerDate: new Date().toISOString(),
    householdHasChildren,
    isChild: person.is_child === true,
  };

  if (!ctx.hasEmail && !ctx.hasSms) {
    console.log(`Person ${personPcoId} has no email and no phone — agent would flag for manual outreach.`);
    return;
  }

  console.log(`Drafting test follow-up for: ${fullName} (${personPcoId})`);
  console.log(`  Channels: ${[ctx.hasEmail ? 'email' : null, ctx.hasSms ? 'sms' : null].filter(Boolean).join(', ')}`);
  console.log(`  Household has kids: ${ctx.householdHasChildren}`);
  console.log(`  Models: draft=${env.ANTHROPIC_DRAFT_MODEL}, voice-check=${env.ANTHROPIC_VOICE_CHECK_MODEL}`);
  console.log('\n  Calling Claude...\n');

  const draft = await generateDraft(claude, ctx, links, voiceRules, env.ANTHROPIC_DRAFT_MODEL);
  const voice = await checkVoice(claude, draft.draft, voiceRules, env.ANTHROPIC_VOICE_CHECK_MODEL);

  if (args.json) {
    process.stdout.write(JSON.stringify({ ctx, draft: draft.draft, voice: voice.check }, null, 2) + '\n');
    return;
  }

  if (draft.draft.email) {
    console.log('───────── EMAIL ─────────');
    console.log(`Subject: ${draft.draft.email.subject}\n`);
    console.log(draft.draft.email.body);
    console.log('');
  }
  if (draft.draft.sms) {
    console.log('───────── SMS ─────────');
    console.log(draft.draft.sms.body);
    console.log('');
  }
  console.log('───────── VOICE CHECK ─────────');
  console.log(`Overall: ${voice.check.overall.toUpperCase()}`);
  console.log(`  Warm/personal:        ${voice.check.warm_personal.pass ? '✅' : '❌'}  ${voice.check.warm_personal.note}`);
  console.log(`  Zero pressure:        ${voice.check.zero_pressure.pass ? '✅' : '❌'}  ${voice.check.zero_pressure.note}`);
  console.log(`  Sounds like Champion: ${voice.check.sounds_like_champion.pass ? '✅' : '❌'}  ${voice.check.sounds_like_champion.note}`);
  if (voice.check.concerns.length > 0) {
    console.log('\n  Concerns:');
    for (const c of voice.check.concerns) console.log(`    - ${c}`);
  }

  console.log(`\nTokens — draft: ${draft.inputTokens}/${draft.outputTokens}, voice: ${voice.inputTokens}/${voice.outputTokens}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadAgentEnv();
  const db = getDb();

  if (args.person) {
    if (!args.dryRun) {
      console.error('--person mode requires --dry-run (it does not touch followup_queue).');
      process.exit(1);
    }
    await singlePersonDryRun(args, db);
    return;
  }

  const claude = new AnthropicClaudeClient(env.ANTHROPIC_API_KEY);
  const result = await runFollowUpAgent(db, claude, {
    draftModel: env.ANTHROPIC_DRAFT_MODEL,
    voiceCheckModel: env.ANTHROPIC_VOICE_CHECK_MODEL,
    links: linksFromEnv(env),
    batchSize: args.batch,
    dryRun: args.dryRun,
  });

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  console.log('Guest Follow-Up Agent — run complete\n');
  console.log(`  Items examined:       ${result.itemsExamined}`);
  console.log(`  Drafted (awaiting):   ${result.drafted}`);
  console.log(`  Drafted (held):       ${result.held}`);
  console.log(`  Overridden (pastoral): ${result.overridden}`);
  console.log(`  Skipped (no contact): ${result.skippedNoContact}`);
  if (result.errors > 0) console.log(`  Errors:               ${result.errors}`);
  console.log(`\n  Tokens — input: ${result.inputTokensTotal}, output: ${result.outputTokensTotal}`);

  if (result.itemsExamined === 0) {
    console.log('\n  No pending followups. Either the queue is empty or all items have been processed.');
    console.log('  To test against a specific person without a queue row:');
    console.log('    npm run agent:draft -- --person=<PCO_ID> --dry-run');
  } else {
    console.log('\n  Per-item:');
    for (const item of result.items) {
      const tag =
        item.outcome === 'drafted_awaiting_approval'
          ? '✅'
          : item.outcome === 'drafted_held'
            ? '⏸️'
            : item.outcome === 'overridden_pastoral_flag'
              ? '🚩'
              : item.outcome === 'skipped_no_contact'
                ? '📭'
                : '❌';
      console.log(`    ${tag}  ${item.personPcoId}  ${item.draftSummary ?? item.outcome}`);
      if (item.reason) console.log(`         ${item.reason}`);
    }
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) console.error(`\n${err.message}`);
  else console.error('\nUnknown error:', err);
  process.exit(1);
});
