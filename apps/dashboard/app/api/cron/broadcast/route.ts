/**
 * Scheduled trigger for the broadcast response processor (Phase F.2).
 *
 * Runs one sweep of `inbound_responses`: mirror new HOME-texters into PCO,
 * run the free-text scan, enroll the 21-day journey. This is the production
 * cron home — it co-locates with the inbound webhook so there's no separate
 * machine to keep alive.
 *
 * Triggered by:
 *   - Vercel Cron (see apps/dashboard/vercel.json) once deployed. Vercel sends
 *     `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set in env.
 *   - Or any scheduler / curl with the same bearer header (local launchd,
 *     system cron, etc.). See the README note.
 *
 * Safety: the live PCO write stays gated by BROADCAST_PCO_WRITE_ENABLED. With
 * the flag off this endpoint is a harmless no-op (rows stay in the callback
 * queue). The CRON_SECRET prevents anyone from triggering sweeps at will.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { PcoClient } from '@core/pco/index';
import { processInboundResponses, makePcoPersonWriter } from '@core/inbound/index';
import { createServiceClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function run(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  // Fail-closed: production MUST have a CRON_SECRET set, and the request
  // MUST present it. In dev (NODE_ENV != 'production'), an empty secret
  // means "anyone on localhost can trigger" — convenient and not exposed.
  if (isProd && !secret) {
    console.error('[cron/broadcast] CRON_SECRET not set in production; refusing to run.');
    return new NextResponse('server not configured', { status: 500 });
  }
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse('unauthorized', { status: 401 });
    }
  }

  const pcoWriteEnabled =
    (process.env.BROADCAST_PCO_WRITE_ENABLED ?? 'false').toLowerCase() === 'true';

  const appId = process.env.PCO_APP_ID;
  const pcoSecret = process.env.PCO_SECRET;
  const writer =
    pcoWriteEnabled && appId && pcoSecret
      ? makePcoPersonWriter(new PcoClient({ appId, secret: pcoSecret }))
      : null;

  if (pcoWriteEnabled && !writer) {
    console.error('[cron/broadcast] PCO write enabled but PCO_APP_ID/PCO_SECRET missing.');
    return NextResponse.json(
      { ok: false, error: 'pco_write_enabled_but_credentials_missing' },
      { status: 500 },
    );
  }

  try {
    const db = createServiceClient();
    const result = await processInboundResponses(db, { pcoWriteEnabled, writer });
    return NextResponse.json({ ok: true, pcoWriteEnabled, ...result });
  } catch (err) {
    console.error('[cron/broadcast] processor failed', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}

// Vercel Cron issues a GET; allow POST too for manual/other schedulers.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return run(req);
}
export async function POST(req: NextRequest): Promise<NextResponse> {
  return run(req);
}
