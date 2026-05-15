/**
 * Supabase clients for the SERVER.
 *
 * Two flavors:
 *   - createServerClient() — request-scoped auth-aware client. Reads the
 *     user's cookies. Use this in server components and server actions
 *     when you need "what is THIS user allowed to see?" semantics.
 *
 *   - createServiceClient() — service-role client. Bypasses RLS.
 *     Use sparingly and ONLY on the server. Required when MLIS-specific
 *     business logic needs to read/write across guests regardless of
 *     who's signed in (e.g., enrolling a journey, advancing a touch's
 *     state machine on behalf of the system).
 *
 * Never import lib/supabase/server.ts from a client component.
 */

import { cookies } from 'next/headers';
import { createServerClient as createSsrServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createBaseClient } from '@supabase/supabase-js';
import type { Database } from '@core/db/types.generated';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createServerClient() {
  const cookieStore = await cookies();
  return createSsrServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — Next.js doesn't allow setting
            // cookies there. Middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  return createBaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
