'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '../../../lib/supabase/server';
import { productionSender } from '../../../lib/agent/prayer-sender';
import { processPrayerSignal } from '@core/agent/prayer-response/orchestrator.ts';
import { AnthropicClaudeClient } from '@core/agent/claude.ts';
import type { EngagementSignalRow } from '@core/db/index.ts';

/**
 * Run the Prayer Response Agent on a specific engagement_signal.
 *
 * Triggered from the dashboard — typically when staff reviews a captured
 * prayer-request signal and wants the agent to take it through capture →
 * draft → constraint scan → voice check → send → PCPOC alert → contextual
 * reference touch insertion.
 *
 * Idempotent — the agent itself short-circuits on `already_captured`.
 */
export async function runPrayerResponseAction(formData: FormData): Promise<void> {
  const signalId = String(formData.get('signal_id') ?? '');
  if (!signalId) throw new Error('signal_id required');

  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email) throw new Error('Not authenticated');

  const db = createServiceClient();
  const { data: signal, error: sErr } = await db
    .from('engagement_signals')
    .select('*')
    .eq('id', signalId)
    .maybeSingle();
  if (sErr) throw new Error(`signal lookup failed: ${sErr.message}`);
  if (!signal) throw new Error(`signal ${signalId} not found`);
  if (signal.kind !== 'prayer_request') {
    throw new Error(`signal ${signalId} is kind=${signal.kind}, not prayer_request`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const claude = new AnthropicClaudeClient(apiKey);

  const draftModel = process.env.ANTHROPIC_DRAFT_MODEL ?? 'claude-sonnet-4-6';
  const voiceCheckModel = process.env.ANTHROPIC_VOICE_CHECK_MODEL ?? 'claude-haiku-4-5-20251001';

  await processPrayerSignal(
    db,
    claude,
    productionSender,
    signal as EngagementSignalRow,
    {
      draftModel,
      voiceCheckModel,
    },
  );

  revalidatePath('/');
  revalidatePath('/touches');
  revalidatePath(`/journeys`);
}
