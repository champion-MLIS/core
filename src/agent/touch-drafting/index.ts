/**
 * Touch drafting — entry point.
 *
 * Picks the right per-touch spec based on touch_number (or
 * is_contextual_reference for the inserted Day-11 touch), runs the
 * shared runner, and writes the result (or held_pending_data state)
 * back to the touch row.
 */

import type {
  Db,
  Json,
  TouchRow,
} from '../../db/index.ts';
import type { ChampionLinks } from '../links.ts';
import type { ClaudeClient } from '../claude.ts';
import { loadVoiceRules } from '../voice-rules.ts';
import { enrichTouch, readEnrichedContext } from '../../journey/enrich-touch.ts';
import type { CmsAdapter } from '../../cms/index.ts';
import { runDrafter } from './runner.ts';
import type { DrafterSpec, RunDrafterResult } from './types.ts';
import { T1_SUN_SMS } from './t1-sun-sms.ts';
import { T2_MON_CARD } from './t2-mon-card.ts';
import { T3_TUE_EMAIL } from './t3-tue-email.ts';
import { T4_CALL_BRIEF } from './t4-call-brief.ts';
import { T5_SAT_SMS } from './t5-sat-sms.ts';
import { T6_DAY10_CARD } from './t6-day10-card.ts';
import { T7_DAY14_INVITE } from './t7-day14-invite.ts';
import { T8_DAY21 } from './t8-day21.ts';
import { T9_CONTEXTUAL_SMS } from './t9-contextual-sms.ts';

export interface DraftTouchConfig {
  draftModel: string;
  voiceCheckModel: string;
  links: ChampionLinks;
  /** Override "now" for tests. */
  now?: () => Date;
}

export type DraftTouchOutcome =
  | 'drafted'
  | 'held_pending_data'
  | 'no_drafter_for_touch';

export interface DraftTouchResult {
  outcome: DraftTouchOutcome;
  touchId: string;
  voiceSampleCited?: string;
  voiceSampleStatus?: 'canonical' | 'approximated';
  voiceCheckOverall?: 'pass' | 'fail';
  voiceCheckConcerns?: string[];
  missing?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Drive a single touch from "pending" through enrichment + drafting +
 * voice check, writing the result (or held state) to the touch row.
 *
 * Idempotency: re-running on a touch overwrites payload.context (via
 * enrichment) and payload.draft (set here). Status transitions: any
 * non-completed touch with content available → 'awaiting_action'; held
 * → 'pending' with held_pending_data_at set; missing drafter for the
 * touch type → leaves the row alone.
 */
export async function draftTouch(
  db: Db,
  cms: CmsAdapter,
  claude: ClaudeClient,
  touchId: string,
  config: DraftTouchConfig,
): Promise<DraftTouchResult> {
  // 1. Enrich first — populates payload.context.
  const enrichment = await enrichTouch(
    db,
    cms,
    touchId,
    config.now ? { now: config.now } : {},
  );
  if (enrichment.outcome !== 'enriched') {
    throw new Error(`enrichment failed: ${enrichment.outcome}`);
  }

  // 2. Re-fetch the touch (payload has been updated).
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select('*')
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch fetch failed: ${tErr.message}`);
  if (!touch) throw new Error(`touch ${touchId} not found after enrichment`);
  const t = touch as TouchRow;

  // 3. Pick the right drafter.
  const spec = pickSpec(t);
  if (!spec) {
    return { outcome: 'no_drafter_for_touch', touchId };
  }

  const context = readEnrichedContext(t);
  if (!context) {
    throw new Error('enriched context missing on touch payload after enrichment');
  }

  // 4. Run the drafter.
  const voiceRules = await loadVoiceRules();
  const result: RunDrafterResult = await runDrafter(
    spec,
    {
      claude,
      voiceRules,
      draftModel: config.draftModel,
      voiceCheckModel: config.voiceCheckModel,
      links: config.links,
    },
    { touch: t, context },
  );

  const now = (config.now ?? (() => new Date()))();

  // 5. Write back.
  if (result.outcome === 'held_pending_data') {
    const reason = `missing: ${result.missing.join(', ')}`;
    await db
      .from('touches')
      .update({
        held_pending_data_at: now.toISOString(),
        held_pending_data_reason: reason,
        status: 'pending',
      })
      .eq('id', touchId);
    return {
      outcome: 'held_pending_data',
      touchId,
      missing: result.missing,
    };
  }

  // result.outcome === 'drafted'
  const existingPayload = (t.payload ?? {}) as Record<string, Json>;
  const nextPayload: Record<string, Json> = {
    ...existingPayload,
    draft: {
      email: result.draft.email,
      sms: result.draft.sms,
      brief: result.draft.brief,
      voice_notes: result.draft.voice_notes,
    } as unknown as Json,
    voice_check: result.voiceCheck as unknown as Json,
    voice_sample_cited: result.voiceSampleCited,
    voice_sample_status: result.voiceSampleStatus,
    drafted_at: now.toISOString(),
    usage: {
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    } as unknown as Json,
  };

  await db
    .from('touches')
    .update({
      payload: nextPayload as unknown as Json,
      status: 'awaiting_action',
      held_pending_data_at: null,
      held_pending_data_reason: null,
    })
    .eq('id', touchId);

  return {
    outcome: 'drafted',
    touchId,
    voiceSampleCited: result.voiceSampleCited,
    voiceSampleStatus: result.voiceSampleStatus,
    voiceCheckOverall: result.voiceCheck.overall,
    voiceCheckConcerns: result.voiceCheck.concerns,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

function pickSpec(touch: TouchRow): DrafterSpec | null {
  if (touch.is_contextual_reference) return T9_CONTEXTUAL_SMS;
  switch (touch.touch_number) {
    case 1:
      return T1_SUN_SMS;
    case 2:
      return T2_MON_CARD;
    case 3:
      return T3_TUE_EMAIL;
    case 4:
      return T4_CALL_BRIEF;
    case 5:
      return T5_SAT_SMS;
    case 6:
      return T6_DAY10_CARD;
    case 7:
      return T7_DAY14_INVITE;
    case 8:
      return T8_DAY21;
    default:
      return null;
  }
}

export { runDrafter } from './runner.ts';
export type {
  DrafterSpec,
  RunDrafterResult,
  TouchDraftOutput,
  VoiceCheckShape,
  VoiceSampleStatus,
  AttentivenessRequirement,
} from './types.ts';
