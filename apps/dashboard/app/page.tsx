import Link from 'next/link';
import { createServerClient, createServiceClient } from '../lib/supabase/server';

export const dynamic = 'force-dynamic';
import { signOutAction } from './actions';
import {
  getTouchCompletionRate,
  getRecoveryUsage,
  getReturnRateByTouch,
  getDaysToReturnDistribution,
  getRecentActiveJourneys,
  getMissedTouches,
} from '../lib/metrics';
import { formatDateTime, relativeDay } from '../lib/format';

const OWNER_ROLE_LABELS: Record<string, string> = {
  connections_volunteer: 'Connections volunteer',
  senior_pastor: 'Pastor Stephen',
  connections_pastor: 'Becky',
  lay_volunteer: 'Lay volunteer',
  matched_leader: 'Ministry leader',
};

export default async function HomePage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  const [
    { count: pendingTouches },
    { count: activeJourneys },
    { count: returnedJourneys },
    completion,
    recovery,
    returnByTouch,
    daysToReturn,
    recentJourneys,
    missedTouches,
  ] = await Promise.all([
    db
      .from('touches')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'drafting', 'awaiting_action']),
    db.from('guest_journeys').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('guest_journeys').select('id', { count: 'exact', head: true }).eq('status', 'returned'),
    getTouchCompletionRate(db),
    getRecoveryUsage(db),
    getReturnRateByTouch(db),
    getDaysToReturnDistribution(db),
    getRecentActiveJourneys(db, 10),
    getMissedTouches(db),
  ]);

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Dashboard</h1>
          </div>
          <form action={signOutAction}>
            <Link
              href="/touches"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Worklist
            </Link>
            <Link
              href="/pastor"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Pastor View
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
        {/* Top-line counts */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/touches"
            className="block rounded-lg border border-zinc-200 bg-white p-5 hover:border-zinc-400 hover:shadow-sm"
          >
            <p className="text-sm font-medium text-zinc-500">Pending touches</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{pendingTouches ?? 0}</p>
            <p className="mt-1 text-xs text-zinc-500">Open the worklist →</p>
          </Link>
          <Tile label="Active journeys" value={activeJourneys ?? 0} />
          <Tile label="Returned this cycle" value={returnedJourneys ?? 0} />
        </div>

        {/* Missed touches — Becky's escalation queue */}
        {missedTouches.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold tracking-wide text-amber-900 uppercase">
              ⚠️ Past due — needs attention ({missedTouches.length})
            </h2>
            <ul className="mt-3 divide-y divide-amber-200">
              {missedTouches.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link
                      href={`/journeys/${m.journeyId}`}
                      className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                    >
                      {m.guestName}
                    </Link>
                    <span className="ml-2 text-zinc-600">
                      · {m.label} · {OWNER_ROLE_LABELS[m.ownerRole] ?? m.ownerRole}
                    </span>
                  </div>
                  <Link
                    href={`/touches/${m.id}`}
                    className="text-xs font-medium text-amber-900 underline-offset-4 hover:underline"
                  >
                    Due {relativeDay(m.dueAt)} · open →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The four metrics */}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Tracking</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetricCard
              title="Touch completion rate"
              hint="Done / Scheduled. NA touches (skipped on return) are excluded."
            >
              {completion.rate == null ? (
                <EmptyMetric note="No touches scheduled yet." />
              ) : (
                <>
                  <p className="text-3xl font-semibold tabular-nums">
                    {Math.round(completion.rate * 100)}%
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                    {completion.touchesCompleted} done / {completion.touchesScheduled} scheduled
                  </p>
                </>
              )}
            </MetricCard>

            <MetricCard
              title="Recovery touches used"
              hint="What share of journeys triggered touches 6, 7, or 8 — meaning the guest hadn't returned by Day 10."
            >
              {recovery.rate == null ? (
                <EmptyMetric note="No journeys yet." />
              ) : (
                <>
                  <p className="text-3xl font-semibold tabular-nums">
                    {Math.round(recovery.rate * 100)}%
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                    {recovery.recoveryTouchesFired} of {recovery.journeysTotal} journeys reached
                    recovery
                  </p>
                </>
              )}
            </MetricCard>

            <MetricCard
              title="Return rate by touch"
              hint="For each touch in the sequence, what share of journeys had returned by then. Higher early = guests come back fast."
            >
              <ReturnRateChart data={returnByTouch} />
            </MetricCard>

            <MetricCard
              title="Days to return"
              hint="Distribution of how many days between enrollment and the guest's second visit."
            >
              {daysToReturn.totalReturned === 0 ? (
                <EmptyMetric note="No guests have returned yet." />
              ) : (
                <>
                  <p className="text-3xl font-semibold tabular-nums">
                    {daysToReturn.medianDays == null
                      ? '—'
                      : `${daysToReturn.medianDays.toFixed(1)} days`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                    median across {daysToReturn.totalReturned} returns
                  </p>
                  <DaysToReturnHistogram buckets={daysToReturn.buckets} />
                </>
              )}
            </MetricCard>
          </div>
        </div>

        {/* Recently active journeys */}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Recently active journeys
          </h2>
          {recentJourneys.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              No journeys yet. Enrollment begins when a connect card lands in PCO.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Enrolled</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJourneys.map((j) => (
                    <tr
                      key={j.id}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/journeys/${j.id}`}
                          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                        >
                          {j.guestName}
                        </Link>
                        <div className="text-xs text-zinc-500">PCO {j.personPcoId}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        <div>{relativeDay(j.enrolledAt)}</div>
                        <div className="text-xs text-zinc-500">{formatDateTime(j.enrolledAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className="h-full rounded-full bg-zinc-900"
                              style={{
                                width:
                                  j.touchesTotal === 0
                                    ? '0%'
                                    : `${Math.round((j.touchesDone / j.touchesTotal) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-zinc-600">
                            {j.touchesDone}/{j.touchesTotal}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <JourneyStatusPill status={j.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MetricCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h3>
      <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyMetric({ note }: { note: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500">
      {note}
    </div>
  );
}

function ReturnRateChart({
  data,
}: {
  data: Array<{ touchNumber: number; rate: number | null; totalAtTouch: number }>;
}) {
  const anyData = data.some((d) => d.totalAtTouch > 0);
  if (!anyData) {
    return <EmptyMetric note="No data yet — no journeys have completed enough touches." />;
  }
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.touchNumber} className="flex items-center gap-3">
          <span className="w-10 text-xs font-medium tabular-nums text-zinc-500">
            T{d.touchNumber}
          </span>
          <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-emerald-500"
              style={{ width: d.rate == null ? '0%' : `${Math.round(d.rate * 100)}%` }}
            />
          </div>
          <span className="w-14 text-right text-xs tabular-nums text-zinc-600">
            {d.totalAtTouch === 0 ? '—' : `${Math.round((d.rate ?? 0) * 100)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

function DaysToReturnHistogram({
  buckets,
}: {
  buckets: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="mt-3 space-y-1.5">
      {buckets.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-24 text-xs text-zinc-500">{b.label}</span>
          <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-zinc-900"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-zinc-600">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

function JourneyStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    returned: 'bg-blue-100 text-blue-800',
    completed: 'bg-zinc-100 text-zinc-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status] ?? 'bg-zinc-100 text-zinc-700'
      }`}
    >
      {status}
    </span>
  );
}
