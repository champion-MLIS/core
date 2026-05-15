import Link from 'next/link';
import { createServerClient, createServiceClient } from '../lib/supabase/server';
import { signOutAction } from './actions';

export default async function HomePage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  // Middleware already redirected unauthed users; this null-check is just for types.
  if (!user) return null;

  // Service-role client for cross-guest queries. The dashboard's reads of
  // MLIS data are server-side; the publishable key never sees these rows.
  const db = createServiceClient();

  const [
    { count: pendingTouches },
    { count: activeJourneys },
    { count: returnedJourneys },
  ] = await Promise.all([
    db
      .from('touches')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'drafting', 'awaiting_action']),
    db.from('guest_journeys').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('guest_journeys').select('id', { count: 'exact', head: true }).eq('status', 'returned'),
  ]);

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          <form action={signOutAction}>
            <span className="mr-3 text-sm text-zinc-600">{user.email}</span>
            <button
              type="submit"
              className="text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome.</h2>
        <p className="mt-1 text-sm text-zinc-600">
          You&apos;re signed in. The full dashboard (My Touches Today, Guest Journey, etc.)
          ships in the next session. For now — a quick state-of-the-system count.
        </p>

        <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/touches"
            className="block rounded-lg border border-zinc-200 bg-white p-5 hover:border-zinc-400 hover:shadow-sm"
          >
            <dt className="text-sm font-medium text-zinc-500">Pending touches</dt>
            <dd className="mt-2 text-3xl font-semibold tabular-nums">{pendingTouches ?? 0}</dd>
            <dd className="mt-1 text-xs text-zinc-500">Open the worklist →</dd>
          </Link>
          <Tile label="Active journeys" value={activeJourneys ?? 0} />
          <Tile label="Returned this cycle" value={returnedJourneys ?? 0} />
        </dl>

        <div className="mt-10 rounded-lg border border-zinc-200 bg-white p-6">
          <h3 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            What&apos;s next
          </h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            <li>
              <strong>Phase B.2</strong> — My Touches Today (worklist for the signed-in
              volunteer or staff member)
            </li>
            <li>
              <strong>Phase B.3</strong> — Touch Detail (context, draft, approve/snooze/escalate)
            </li>
            <li>
              <strong>Phase B.4</strong> — Guest Journey timeline
            </li>
            <li>
              <strong>Phase B.5</strong> — Becky&apos;s Dashboard (active journeys + metrics)
            </li>
            <li>
              <strong>Phase B.6</strong> — Pastor View
            </li>
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            See{' '}
            <Link
              href="https://github.com/champion-MLIS/core/blob/main/docs/decisions.md"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              docs/decisions.md
            </Link>{' '}
            (ADR-003) for the in-house dashboard architecture choice.
          </p>
        </div>
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <dt className="text-sm font-medium text-zinc-500">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
