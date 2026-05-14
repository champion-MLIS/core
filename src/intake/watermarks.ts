import type { Db, WatermarkRow } from '../db/index.ts';

export interface WatermarkKey {
  source: string;
  resource: string;
}

export interface WatermarkUpdate extends WatermarkKey {
  lastSeenAt: string;
  lastSeenId?: string | null;
  pollStartedAt: string;
  pollCompletedAt: string;
  recordsProcessed: number;
}

/**
 * Look up the last successful poll watermark for a given source+resource pair.
 * Returns null on a cold start (first poll ever).
 */
export async function getWatermark(
  db: Db,
  key: WatermarkKey,
): Promise<WatermarkRow | null> {
  const { data, error } = await db
    .from('poll_watermarks')
    .select('*')
    .eq('source', key.source)
    .eq('resource', key.resource)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Upsert the watermark after a successful poll. Idempotent — re-running with
 * the same (source, resource) pair overwrites the previous row.
 */
export async function setWatermark(db: Db, update: WatermarkUpdate): Promise<void> {
  const { error } = await db.from('poll_watermarks').upsert(
    {
      source: update.source,
      resource: update.resource,
      last_seen_at: update.lastSeenAt,
      last_seen_id: update.lastSeenId ?? null,
      poll_started_at: update.pollStartedAt,
      poll_completed_at: update.pollCompletedAt,
      records_processed: update.recordsProcessed,
    },
    { onConflict: 'source,resource' },
  );
  if (error) throw error;
}
