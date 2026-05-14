import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { loadEnv } from '../config/env.ts';
import type { Database } from './types.generated.ts';

/**
 * Supabase client typed against our generated schema.
 *
 * The backend always uses the service_role key — it bypasses RLS and lets
 * the intake worker upsert into any table. This is exactly the access pattern
 * the RLS lockdown migration was designed around: lock anon/publishable to
 * zero access, run the worker as a trusted service principal.
 *
 * Never expose this client (or the service_role key) to a browser or any
 * untrusted runtime. If we eventually need browser-side reads, we'll add
 * per-table RLS policies and use the publishable key from the browser.
 */
export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

export function getDb(): Db {
  if (cached) return cached;
  const env = loadEnv();
  const client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'champion-mlis/0.0.1',
      },
    },
    realtime: {
      // Node 20 has no native WebSocket; the SDK warns otherwise. We're not
      // using realtime — this just keeps the constructor quiet. The `ws`
      // package's WebSocket is shape-compatible at runtime; types don't line
      // up so we cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: WebSocket as any,
    },
  });
  cached = client;
  return client;
}

/**
 * For tests — swap in a stubbed client.
 */
export function _setDbForTesting(stub: Db): void {
  cached = stub;
}

/**
 * For tests — clear the cached client.
 */
export function _resetDbForTesting(): void {
  cached = null;
}
