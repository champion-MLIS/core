import Link from 'next/link';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';
import { signOutAction } from '../actions';
import { formatDateTime, relativeDay } from '../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * Pastor View — curated for Stephen.
 *
 * Not a duplicate of Becky's dashboard. The goal here is to surface
 * what only Stephen can decide on, and to keep him close to people
 * pastorally — not operationally.
 *
 *   - Top: items needing HIS attention (pastoral flags + touches he owns)
 *   - Middle: this week's signals (who came in, who's connecting)
 *   - Bottom: state-of-the-church at a glance
 */

export default async function PastorPage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    flagsRes,
    pastorTouchesRes,
    signalsRes,
    activeCountRes,
    returnedThisMonthRes,
    completedThisMonthRes,
    flaggedThisMonthRes,
    mirroredPeopleRes,
  ] = await Promise.all([
    db
      .from('pastoral_flags')
      .select(
        'id, raised_at, notes, person_pco_id, people!inner ( first_name, last_name, preferred_name, pco_id )',
      )
      .is('resolved_at', null)
      .order('raised_at', { ascending: false }),
    db
      .from('touches')
      .select(
        `
        id, touch_number, scheduled_for, due_at, status, payload, journey_id,
        guest_journeys!inner ( people!inner ( first_name, last_name, preferred_name, pco_id ) )
      `,
      )
      .eq('owner_role', 'senior_pastor')
      .in('status', ['pending', 'drafting', 'awaiting_action'])
      .order('scheduled_for', { ascending: true })
      .limit(15),
    db
      .from('engagement_signals')
      .select(
        `
        id, kind, occurred_at, person_pco_id,
        people!inner ( first_name, last_name, preferred_name, pco_id )
      `,
      )
      .gte('occurred_at', sevenDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(15),
    db.from('guest_journeys').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db
      .from('guest_journeys')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'returned')
      .gte('returned_at', thirtyDaysAgo),
    db
      .from('guest_journeys')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', thirtyDaysAgo),
    db
      .from('pastoral_flags')
      .select('id', { count: 'exact', head: true })
      .gte('raised_at', thirtyDaysAgo),
    db.from('people').select('pco_id', { count: 'exact', head: true }),
  ]);

  const flags = flagsRes.data ?? [];
  const pastorTouches = (pastorTouchesRes.data ?? []) as PastorTouchRow[];
  const signals = (signalsRes.data ?? []) as SignalRow[];

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Pastor View</h1>
          </div>
          <form action={signOutAction}>
            <Link
              href="/"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Dashboard
            </Link>
            <Link
              href="/touches"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Worklist
            </Link>
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

      <section className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* PASTORAL ATTENTION */}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Pastoral attention
          </h2>

          {flags.length === 0 ? (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-sm text-zinc-700">No active pastoral flags right now.</p>
              <p className="mt-1 text-xs text-zinc-500">
                Flags are raised when staff pause automation for a person, or
                when the system escalates an unanswered prayer request.
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-5">
              <h3 className="text-sm font-semibold text-red-900">
                {flags.length} active flag{flags.length === 1 ? '' : 's'} — automated touches paused
              </h3>
              <ul className="mt-3 divide-y divide-red-200">
                {flags.map((f) => {
                  const p = f.people;
                  const name =
                    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
                    p.preferred_name ||
                    `(${p.pco_id})`;
                  return (
                    <li key={f.id} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between">
                        <span className="font-medium text-zinc-900">{name}</span>
                        <span className="text-xs text-red-800">
                          {relativeDay(f.raised_at)}
                        </span>
                      </div>
                      {f.notes && (
                        <p className="mt-1 text-xs text-zinc-700 italic">"{f.notes}"</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* PASTOR'S OWN TOUCHES */}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Cards to send ({pastorTouches.length})
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Day 2 handwritten cards waiting on you. Mark them done in the worklist when mailed.
          </p>

          {pastorTouches.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              Nothing in your queue right now. New cards land here as guests enroll in the
              21-day flow.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Touch</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {pastorTouches.map((t) => {
                    const p = t.guest_journeys.people;
                    const name =
                      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
                      p.preferred_name ||
                      `(${p.pco_id})`;
                    const label =
                      (t.payload as { label?: string } | null)?.label ??
                      `Touch ${t.touch_number}`;
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/journeys/${t.journey_id}`}
                            className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                          >
                            {name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{label}</td>
                        <td className="px-4 py-3 text-zinc-700">
                          <div>{relativeDay(t.due_at)}</div>
                          <div className="text-xs text-zinc-500">{formatDateTime(t.due_at)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/touches/${t.id}`}
                            className="text-xs font-medium text-zinc-900 underline-offset-4 hover:underline"
                          >
                            Open →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SIGNALS THIS WEEK */}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Signals this week
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            What people have done in the last 7 days that started or advanced their journey.
          </p>

          {signals.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              No recorded signals in the past 7 days yet. (Connect cards begin landing once
              Champion publicizes the form, or once Subsplash → PCO sync goes live.)
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
              {signals.map((s) => {
                const p = s.people;
                const name =
                  [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
                  p.preferred_name ||
                  `(${p.pco_id})`;
                return (
                  <li key={s.id} className="flex items-baseline justify-between px-4 py-3 text-sm">
                    <div>
                      <span className="font-medium text-zinc-900">{name}</span>{' '}
                      <span className="text-zinc-700">— {signalLabel(s.kind)}</span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {relativeDay(s.occurred_at)} · {formatDateTime(s.occurred_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* STATE OF THE CHURCH (high level) */}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            State of the church (last 30 days)
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SimpleStat label="Mirrored people" value={mirroredPeopleRes.count ?? 0} />
            <SimpleStat label="Active journeys" value={activeCountRes.count ?? 0} />
            <SimpleStat label="Returned" value={returnedThisMonthRes.count ?? 0} />
            <SimpleStat label="Completed cycles" value={completedThisMonthRes.count ?? 0} />
          </div>
          {(flaggedThisMonthRes.count ?? 0) > 0 && (
            <p className="mt-3 text-xs text-zinc-600">
              {flaggedThisMonthRes.count} pastoral flag
              {(flaggedThisMonthRes.count ?? 0) === 1 ? '' : 's'} raised in this window.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function SimpleStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function signalLabel(kind: string): string {
  switch (kind) {
    case 'connect_card':
      return 'submitted a Connect Card';
    case 'prayer_request':
      return 'submitted a prayer request';
    case 'first_giving':
      return 'made a first-time gift';
    case 'child_checkin':
      return 'had a child checked in';
    case 'service_attendance':
      return 'attended a service';
    default:
      return kind;
  }
}

type PastorTouchRow = {
  id: string;
  touch_number: number;
  scheduled_for: string;
  due_at: string;
  status: string;
  payload: unknown;
  journey_id: string;
  guest_journeys: {
    people: {
      first_name: string | null;
      last_name: string | null;
      preferred_name: string | null;
      pco_id: string;
    };
  };
};

type SignalRow = {
  id: string;
  kind: string;
  occurred_at: string;
  person_pco_id: string;
  people: {
    first_name: string | null;
    last_name: string | null;
    preferred_name: string | null;
    pco_id: string;
  };
};
