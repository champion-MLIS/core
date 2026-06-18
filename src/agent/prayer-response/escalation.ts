/**
 * Prayer-request escalation check (ADR-004).
 *
 * Run periodically (CLI for now; future: scheduled). For every
 * prayer_request where:
 *   - status = 'in_followup' (acknowledged, awaiting PCPOC)
 *   - acknowledged_at + 48h <= now
 *   - pcpoc_responded_at is null
 *   - escalated_at is null
 * mark escalated_at = now, raise a pastoral_flag so the Pastoral Override
 * Monitor pauses any further automation on this person until manually
 * cleared.
 *
 * The "escalates to Becky" routing happens implicitly: the
 * pcpoc_alert_recipient flag identifies who watches the dashboard for
 * escalations. Becky is the default; LaCinda also receives alerts per
 * the seed.
 */

import type { Db, PrayerRequestRow } from '../../db/index.ts';

const ESCALATION_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface EscalationRunResult {
  examined: number;
  escalated: number;
  errors: number;
  escalatedIds: string[];
}

export interface EscalationRunOptions {
  now?: () => Date;
}

export async function runEscalationCheck(
  db: Db,
  opts: EscalationRunOptions = {},
): Promise<EscalationRunResult> {
  const now = (opts.now ?? (() => new Date()))();
  const threshold = new Date(now.getTime() - ESCALATION_WINDOW_MS).toISOString();

  const { data, error } = await db
    .from('prayer_requests')
    .select('*')
    .eq('status', 'in_followup')
    .is('escalated_at', null)
    .is('pcpoc_responded_at', null)
    .lte('acknowledged_at', threshold);
  if (error) throw new Error(`escalation scan failed: ${error.message}`);

  const candidates = (data as PrayerRequestRow[] | null) ?? [];
  const escalatedIds: string[] = [];
  let errors = 0;

  for (const pr of candidates) {
    try {
      await db
        .from('prayer_requests')
        .update({ escalated_at: now.toISOString() })
        .eq('id', pr.id);

      // Raise a pastoral_flag so the Pastoral Override Monitor pauses
      // anything else automated for this person until manually cleared.
      await db.from('pastoral_flags').insert({
        person_pco_id: pr.person_pco_id,
        notes: `Prayer request ${pr.id} not addressed within 48h. Auto-escalated by Prayer Response Agent. ADR-004 §3.1.`,
        assigned_to: pr.assigned_to,
      });

      escalatedIds.push(pr.id);
    } catch {
      errors += 1;
    }
  }

  return {
    examined: candidates.length,
    escalated: escalatedIds.length,
    errors,
    escalatedIds,
  };
}
