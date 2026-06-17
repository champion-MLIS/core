/**
 * Auth middleware — refreshes the Supabase session on every request and
 * gates access to protected routes.
 *
 * Public routes:
 *   - /login, /auth/*                       — magic-link sign-in flow
 *   - /api/sms/*                            — Twilio inbound webhook (signature-validated in-route)
 *   - /api/cron/*                           — scheduled triggers (CRON_SECRET-validated in-route)
 *   - /next                                 — the "three things to do today" landing page
 *                                             linked from the inbound-keyword auto-reply
 *
 * Everything else requires an authenticated, domain-allowlisted user.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATH_PREFIXES = ['/login', '/auth', '/api/sms', '/api/cron', '/next'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(toSet: CookieToSet[]) {
          for (const { name, value } of toSet) req.cookies.set(name, value);
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session if expired — this is the auth helper's job per request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isPublic(req.nextUrl.pathname) && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on every route except Next.js internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
