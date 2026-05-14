/**
 * Guest Follow-Up Agent — end-to-end orchestrator.
 *
 * Reads pending rows from followup_queue, fetches the person + contact +
 * household context from Supabase, runs draft → voice check → records
 * everything back to the queue row. Idempotent and re-entrant.
 *
 * State machine on followup_queue.status:
 *   pending             — fresh row from the signal poller, no draft yet
 *   drafting            — agent is currently working on it (set briefly)
 *   awaiting_approval   — draft passes voice check, ready for staff
 *   held                — draft failed voice check or hit a non-fatal issue;
 *                         payload includes concerns for staff to review
 *   overridden          — pastoral_flag found, no draft, hand to staff
 *   sent                — staff approved + the send step completed (Step 5)
 *
 * The agent never sends anything. It produces drafts. Step 5 (staff
 * approval + send) is a separate piece of work.
 */

import type { ClaudeClient } from './claude.ts';
import type { ChampionLinks } from './links.ts';
import { generateDraft, type DraftResult } from './draft.ts';
import { checkVoice, type VoiceCheckResult } from './voice-check.ts';
import { loadVoiceRules } from './voice-rules.ts';
import type {
  Db,
  EmailRow,
  FollowupQueueRow,
  HouseholdRow,
  Json,
  PersonRow,
  PhoneRow,
} from '../db/index.ts';
import type { DraftContext } from './prompts.ts';

export interface FollowUpAgentConfig {
  draftModel: string;
  voiceCheckModel: string;
  links: ChampionLinks;
  /** Limit how many queue rows to process per run. Default 10. */
  batchSize?: number;
  /** Skip database writes — useful for live-API dry runs. */
  dryRun?: boolean;
  now?: () => Date;
}

export interface QueueItemResult {
  queueId: string;
  personPcoId: string;
  outcome:
    | 'drafted_awaiting_approval'
    | 'drafted_held'
    | 'overridden_pastoral_flag'
    | 'skipped_no_contact'
    | 'error';
  reason?: string;
  draftSummary?: string;
}

export interface FollowUpAgentResult {
  itemsExamined: number;
  drafted: number;
  held: number;
  overridden: number;
  skippedNoContact: number;
  errors: number;
  items: QueueItemResult[];
  inputTokensTotal: number;
  outputTokensTotal: number;
}

export async function runFollowUpAgent(
  db: Db,
  claude: ClaudeClient,
  config: FollowUpAgentConfig,
): Promise<FollowUpAgentResult> {
  const voiceRules = await loadVoiceRules();

  const pending = await fetchPendingQueue(db, config.batchSize ?? 10);
  const items: QueueItemResult[] = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;

  for (const row of pending) {
    try {
      const item = await processOne(db, claude, row, voiceRules, config);
      items.push(item.result);
      inputTokensTotal += item.inputTokens;
      outputTokensTotal += item.outputTokens;
    } catch (err) {
      items.push({
        queueId: row.id,
        personPcoId: row.person_pco_id,
        outcome: 'error',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    itemsExamined: items.length,
    drafted: items.filter((i) => i.outcome === 'drafted_awaiting_approval').length,
    held: items.filter((i) => i.outcome === 'drafted_held').length,
    overridden: items.filter((i) => i.outcome === 'overridden_pastoral_flag').length,
    skippedNoContact: items.filter((i) => i.outcome === 'skipped_no_contact').length,
    errors: items.filter((i) => i.outcome === 'error').length,
    items,
    inputTokensTotal,
    outputTokensTotal,
  };
}

// ---------------------------------------------------------------------------
// Per-item processing
// ---------------------------------------------------------------------------

interface ProcessOneOutput {
  result: QueueItemResult;
  inputTokens: number;
  outputTokens: number;
}

async function processOne(
  db: Db,
  claude: ClaudeClient,
  row: FollowupQueueRow,
  voiceRules: string,
  config: FollowUpAgentConfig,
): Promise<ProcessOneOutput> {
  const personPcoId = row.person_pco_id;

  // Pastoral override re-check — flags can be added between queueing and now.
  if (await hasActivePastoralFlag(db, personPcoId)) {
    if (!config.dryRun) {
      await updateQueueRow(db, row.id, {
        status: 'overridden',
        payload: { reason: 'pastoral_flag_active', overridden_at: nowIso(config) },
      });
    }
    return {
      result: {
        queueId: row.id,
        personPcoId,
        outcome: 'overridden_pastoral_flag',
      },
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  // Fetch person + contact + household context.
  const ctx = await assembleContext(db, row, personPcoId);
  if (!ctx.hasEmail && !ctx.hasSms) {
    if (!config.dryRun) {
      await updateQueueRow(db, row.id, {
        status: 'held',
        payload: {
          reason: 'no_contact_info',
          flagged_at: nowIso(config),
          person_summary: ctx.personSummary,
        },
      });
    }
    return {
      result: {
        queueId: row.id,
        personPcoId,
        outcome: 'skipped_no_contact',
        reason: 'No email or phone on file — flagged for manual outreach.',
      },
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  // Mark as drafting (best-effort lock; the agent is single-process for now).
  if (!config.dryRun) {
    await updateQueueRow(db, row.id, { status: 'drafting' });
  }

  const draft: DraftResult = await generateDraft(
    claude,
    ctx.draftContext,
    config.links,
    voiceRules,
    config.draftModel,
  );

  const voice: VoiceCheckResult = await checkVoice(
    claude,
    draft.draft,
    voiceRules,
    config.voiceCheckModel,
  );

  const finalStatus = voice.check.overall === 'pass' ? 'awaiting_approval' : 'held';
  const payload: Record<string, Json> = {
    person_summary: ctx.personSummary as unknown as Json,
    trigger: {
      kind: ctx.draftContext.triggerKind,
      date: ctx.draftContext.triggerDate,
    },
    draft: draft.draft as unknown as Json,
    voice_check: voice.check as unknown as Json,
    models: {
      draft: draft.model,
      voice_check: voice.model,
    },
    usage: {
      draft_input_tokens: draft.inputTokens,
      draft_output_tokens: draft.outputTokens,
      voice_check_input_tokens: voice.inputTokens,
      voice_check_output_tokens: voice.outputTokens,
    },
    drafted_at: nowIso(config),
  };

  if (!config.dryRun) {
    await updateQueueRow(db, row.id, {
      status: finalStatus,
      payload: payload as unknown as Json,
    });
  }

  const draftSummary = summarizeDraft(draft.draft, voice.check.overall);

  const result: QueueItemResult = {
    queueId: row.id,
    personPcoId,
    outcome: finalStatus === 'awaiting_approval' ? 'drafted_awaiting_approval' : 'drafted_held',
    draftSummary,
  };
  if (finalStatus === 'held') {
    result.reason = `Voice check fail: ${voice.check.concerns.join('; ') || 'see voice_check payload'}`;
  }
  return {
    result,
    inputTokens: draft.inputTokens + voice.inputTokens,
    outputTokens: draft.outputTokens + voice.outputTokens,
  };
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

interface AssembledContext {
  draftContext: DraftContext;
  hasEmail: boolean;
  hasSms: boolean;
  personSummary: {
    pco_id: string;
    name: string;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
    household_pco_id: string | null;
    current_stage: string;
  };
}

async function assembleContext(
  db: Db,
  row: FollowupQueueRow,
  personPcoId: string,
): Promise<AssembledContext> {
  const person = await fetchPerson(db, personPcoId);
  if (!person) throw new Error(`person ${personPcoId} not found in mirror`);

  const email = await fetchPrimaryEmail(db, personPcoId);
  const phone = await fetchPrimaryPhone(db, personPcoId);
  const household = person.household_pco_id
    ? await fetchHousehold(db, person.household_pco_id)
    : null;
  const householdHasChildren = household
    ? await householdHasAnyChildren(db, household.pco_id)
    : false;

  const triggerKind = await resolveTriggerKind(db, row.trigger_signal_id);

  const name =
    person.preferred_name ?? person.first_name ?? person.last_name ?? '(friend)';
  const fullName =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || name;

  const triggerDate = row.created_at;

  return {
    draftContext: {
      name,
      fullName,
      hasEmail: email !== null,
      hasSms: phone !== null,
      triggerKind,
      triggerDate,
      householdHasChildren,
      isChild: person.is_child === true,
    },
    hasEmail: email !== null,
    hasSms: phone !== null,
    personSummary: {
      pco_id: person.pco_id,
      name: fullName,
      preferred_name: person.preferred_name,
      email,
      phone,
      household_pco_id: person.household_pco_id,
      current_stage: person.current_stage,
    },
  };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function fetchPendingQueue(db: Db, limit: number): Promise<FollowupQueueRow[]> {
  const { data, error } = await db
    .from('followup_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('workflow', 'guest-follow-up')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`followup_queue fetch failed: ${error.message}`);
  return (data ?? []) as FollowupQueueRow[];
}

async function hasActivePastoralFlag(db: Db, personPcoId: string): Promise<boolean> {
  const { data, error } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`pastoral_flags lookup failed: ${error.message}`);
  return data !== null;
}

async function fetchPerson(db: Db, pcoId: string): Promise<PersonRow | null> {
  const { data, error } = await db
    .from('people')
    .select('*')
    .eq('pco_id', pcoId)
    .maybeSingle();
  if (error) throw new Error(`people fetch failed: ${error.message}`);
  return data as PersonRow | null;
}

async function fetchHousehold(db: Db, pcoId: string): Promise<HouseholdRow | null> {
  const { data, error } = await db
    .from('households')
    .select('*')
    .eq('pco_id', pcoId)
    .maybeSingle();
  if (error) throw new Error(`households fetch failed: ${error.message}`);
  return data as HouseholdRow | null;
}

async function fetchPrimaryEmail(db: Db, personPcoId: string): Promise<string | null> {
  // Prefer the primary; fall back to any non-blocked email.
  const { data, error } = await db
    .from('emails')
    .select('*')
    .eq('person_pco_id', personPcoId)
    .eq('blocked', false)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`emails fetch failed: ${error.message}`);
  return (data as EmailRow | null)?.address ?? null;
}

async function fetchPrimaryPhone(db: Db, personPcoId: string): Promise<string | null> {
  const { data, error } = await db
    .from('phone_numbers')
    .select('*')
    .eq('person_pco_id', personPcoId)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`phone_numbers fetch failed: ${error.message}`);
  return (data as PhoneRow | null)?.number ?? null;
}

async function householdHasAnyChildren(db: Db, householdPcoId: string): Promise<boolean> {
  const { data, error } = await db
    .from('people')
    .select('pco_id')
    .eq('household_pco_id', householdPcoId)
    .eq('is_child', true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`household-children lookup failed: ${error.message}`);
  return data !== null;
}

async function resolveTriggerKind(
  db: Db,
  triggerSignalId: string | null,
): Promise<DraftContext['triggerKind']> {
  if (!triggerSignalId) return 'connect_card'; // safest default for a guest-stage trigger
  const { data, error } = await db
    .from('engagement_signals')
    .select('kind')
    .eq('id', triggerSignalId)
    .maybeSingle();
  if (error) throw new Error(`engagement_signals lookup failed: ${error.message}`);
  const kind = data?.kind as string | undefined;
  if (
    kind === 'connect_card' ||
    kind === 'prayer_request' ||
    kind === 'first_giving' ||
    kind === 'child_checkin'
  ) {
    return kind;
  }
  return 'connect_card';
}

type FollowupStatus =
  | 'pending'
  | 'drafting'
  | 'awaiting_approval'
  | 'sent'
  | 'held'
  | 'overridden';

async function updateQueueRow(
  db: Db,
  id: string,
  patch: { status?: FollowupStatus; payload?: Json },
): Promise<void> {
  const update: { status?: FollowupStatus; payload?: Json } = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.payload !== undefined) update.payload = patch.payload;
  const { error } = await db.from('followup_queue').update(update).eq('id', id);
  if (error) throw new Error(`followup_queue update failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function nowIso(config: FollowUpAgentConfig): string {
  return (config.now ?? (() => new Date()))().toISOString();
}

function summarizeDraft(
  draft: { email?: { subject: string; body: string } | null; sms?: { body: string } | null },
  overall: 'pass' | 'fail',
): string {
  const channels = [draft.email ? 'email' : null, draft.sms ? 'sms' : null]
    .filter(Boolean)
    .join('+');
  return `${channels} (voice: ${overall})`;
}
