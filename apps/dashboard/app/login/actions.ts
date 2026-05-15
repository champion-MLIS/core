'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '../../lib/supabase/server';

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'championchurch.org').toLowerCase();

export async function requestMagicLink(formData: FormData) {
  const rawEmail = formData.get('email');
  const next = (formData.get('next') as string) ?? '/';
  if (typeof rawEmail !== 'string' || !rawEmail.includes('@')) {
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }
  const email = (rawEmail as string).trim().toLowerCase();
  const domain = email.slice(email.indexOf('@') + 1);
  if (domain !== ALLOWED_DOMAIN) {
    // Per ALLOWED_EMAIL_DOMAIN policy. We don't send a magic link at all
    // for non-allowed domains — no leak that an account "exists".
    redirect(`/login?error=domain&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createServerClient();
  const origin = (await headers()).get('origin') ?? 'http://localhost:3000';

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // shouldCreateUser default is true — first-time logins from an allowed
      // domain auto-create the Supabase Auth user.
    },
  });

  if (error) {
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  redirect(`/login?sent=1&next=${encodeURIComponent(next)}`);
}
