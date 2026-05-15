import { requestMagicLink } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? '/';
  const sent = params.sent === '1';

  let errorMessage: string | null = null;
  if (params.error === 'domain') {
    errorMessage = 'Sign-in is restricted to championchurch.org addresses.';
  } else if (params.error === 'invalid') {
    errorMessage = 'That link is invalid or expired. Request a new one.';
  } else if (params.error) {
    errorMessage = 'Something went wrong. Try again.';
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Champion MLIS</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Sign in with your Champion Church email.
        </p>

        {sent ? (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 text-sm">
            <p className="font-medium">Check your inbox.</p>
            <p className="mt-1 text-zinc-600">
              We sent a sign-in link. Click it from this device to continue.
            </p>
          </div>
        ) : (
          <form action={requestMagicLink} className="mt-8 space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@championchurch.org"
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Send sign-in link
            </button>
            {errorMessage && (
              <p className="text-sm text-red-600" role="alert">
                {errorMessage}
              </p>
            )}
          </form>
        )}

        <p className="mt-8 text-xs text-zinc-500">
          Trouble signing in? Reach out to Pastor Stephen.
        </p>
      </div>
    </main>
  );
}
