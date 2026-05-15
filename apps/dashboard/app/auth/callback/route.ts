/**
 * Magic-link callback handler.
 *
 * Supabase redirects here with a `code` query param after the user clicks
 * the sign-in link. We exchange the code for a session, then re-verify
 * the user's email domain before letting them in.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '../../../lib/supabase/server';

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'championchurch.org').toLowerCase();

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=invalid&next=${encodeURIComponent(next)}`, url));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=invalid&next=${encodeURIComponent(next)}`, url));
  }

  // Re-verify the email domain in case the OTP was somehow obtained for an
  // unallowed address (defense in depth — the login action already gates).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? '';
  const domain = email.slice(email.indexOf('@') + 1);
  if (!email || domain !== ALLOWED_DOMAIN) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(`/login?error=domain`, url));
  }

  return NextResponse.redirect(new URL(next, url));
}
