/**
 * Supabase client for the BROWSER.
 *
 * Uses the publishable (anon) key. The publishable key respects RLS, so
 * even though it lives in the browser bundle, it can only see what the
 * RLS policies allow for the current authenticated user.
 *
 * For privileged operations (reading any guest's journey, mutating
 * touches, etc.) we go through server components or server actions
 * which use the service-role client in lib/supabase/server.ts.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@core/db/types.generated';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
