import Link from 'next/link';
import { createServerClient, createServiceClient } from '../lib/supabase/server';
import { resolveStaffRole, isPastoralCare } from '../lib/roles';

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
import { runPrayerResponseAction } from './touches/[id]/prayer-response-action';
import { SubmitButton } from './touches/_components/SubmitButton';

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

  const staffRole = await resolveStaffRole(user.email);
  const pastoralCare = isPastoralCare(staffRole);

  const db = createServiceClient();

  // For pastoral-care users, fetch the precious-cargo queue alongside the
  // metrics. Non-pastoral users skip the queries entirely.
  const preciousCargoPromise = pastoralCare
    ? loadPreciousCargoQueue(db)
    : Promise.resolve({ pendingSignals: [], activeRequests: [] });

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
    preciousCargo,
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
    preciousCargoPromise,
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

        {/* Precious cargo queue — pastoral_care only (ADR-004) */}
        {pastoralCare && (preciousCargo.pendingSignals.length > 0 || preciousCargo.activeRequests.length > 0) && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-5">
            <h2 className="text-sm font-semibold tracking-wide text-violet-900 uppercase">
              Precious cargo
            </h2>
            <p className="mt-1 text-xs text-violet-700">
              Visible to pastoral care role only. ADR-004 §3.1.
            </p>

            {preciousCargo.pendingSignals.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-900">
                  Pending prayer-request signals ({preciousCargo.pendingSignals.length})
                </h3>
                <p className="mt-1 text-xs text-violet-700">
                  These signals have not yet been captured + acknowledged by the Prayer Response
                  Agent. Process now to send the calibrated acknowledgment and schedule the Day-11
                  contextual reference touch.
                </p>
                <ul className="mt-3 space-y-2">
                  {preciousCargo.pendingSignals.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-violet-200 bg-white p-3 text-sm"
                    >
                      <div>
                        <div className="font-medium text-zinc-900">
                          {s.guestName}{' '}
                          <span className="text-xs text-zinc-500">· PCO {s.personPcoId}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-600">
                          Captured {relativeDay(s.occurredAt)} · channel {s.channel}
                        </div>
                      </div>
                      <form action={runPrayerResponseAction}>
                        <input type="hidden" name="signal_id" value={s.id} />
                        <SubmitButton pendingLabel="Processing…" tone="primary">
                          Process now
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preciousCargo.activeRequests.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-900">
                  In follow-up ({preciousCargo.activeRequests.length})
                </h3>
                <ul className="mt-2 divide-y divide-violet-200 rounded-md border border-violet-200 bg-white">
                  {preciousCargo.activeRequests.map((r) => (
                    <li key={r.id} className="px-3 py-2 text-sm">
                      <div className="flex items-baseline justify-between">
                        <div className="font-medium text-zinc-900">
                          {r.guestName}
                          <span className="ml-2 text-xs text-zinc-500">· PCO {r.personPcoId}</span>
                        </div>
                        <div className="text-xs text-zinc-600">
                          {r.escalated ? (
                            <span className="font-medium text-red-700">⚠ escalated</span>
                          ) : r.acknowledgedAt ? (
                            <>Acknowledged {relativeDay(r.acknowledgedAt)}</>
                          ) : (
                            <>Captured, not yet acknowledged</>
                          )}
                        </div>
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-600">
                        Assigned to {r.assignedTo ?? '(unassigned)'} · channel {r.channel}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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

interface PendingPrayerSignal {
  id: string;
  personPcoId: string;
  guestName: string;
  occurredAt: string;
  channel: string;
}

interface ActivePrayerRequest {
  id: string;
  personPcoId: string;
  guestName: string;
  channel: string;
  acknowledgedAt: string | null;
  assignedTo: string | null;
  escalated: boolean;
}

async function loadPreciousCargoQueue(
  db: ReturnType<typeof createServiceClient>,
): Promise<{
  pendingSignals: PendingPrayerSignal[];
  activeRequests: ActivePrayerRequest[];
}> {
  // 1) prayer_request signals that haven't been captured into prayer_requests yet
  const { data: signals } = await db
    .from('engagement_signals')
    .select('id, person_pco_id, occurred_at, payload')
    .eq('kind', 'prayer_request')
    .order('occurred_at', { ascending: true });

  const signalRows = signals ?? [];
  let pendingSignals: PendingPrayerSignal[] = [];
  if (signalRows.length > 0) {
    const signalIds = signalRows.map((s) => s.id);
    const { data: captured } = await db
      .from('prayer_requests')
      .select('source_signal_id')
      .in('source_signal_id', signalIds);
    const capturedSet = new Set((captured ?? []).map((c) => c.source_signal_id).filter(Boolean));
    const uncaptured = signalRows.filter((s) => !capturedSet.has(s.id));

    if (uncaptured.length > 0) {
      const personIds = uncaptured.map((s) => s.person_pco_id);
      const { data: people } = await db
        .from('people')
        .select('pco_id, first_name, last_name, preferred_name')
        .in('pco_id', personIds);
      const peopleMap = new Map(
        (people ?? []).map((p) => [p.pco_id, p]),
      );

      pendingSignals = uncaptured.map((s) => {
        const p = peopleMap.get(s.person_pco_id);
        const guestName =
          (p &&
            ([p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
              p.preferred_name)) ||
          `(${s.person_pco_id})`;
        const channel = (s.payload as { channel?: string } | null)?.channel ?? 'unknown';
        return {
          id: s.id,
          personPcoId: s.person_pco_id,
          guestName,
          occurredAt: s.occurred_at,
          channel,
        };
      });
    }
  }

  // 2) prayer_requests currently in_followup — Becky's working queue
  const { data: active } = await db
    .from('prayer_requests')
    .select('id, person_pco_id, channel, acknowledged_at, assigned_to, escalated_at, status')
    .eq('status', 'in_followup')
    .order('acknowledged_at', { ascending: false });

  const activeRows = active ?? [];
  let activeRequests: ActivePrayerRequest[] = [];
  if (activeRows.length > 0) {
    const personIds = activeRows.map((r) => r.person_pco_id);
    const { data: people } = await db
      .from('people')
      .select('pco_id, first_name, last_name, preferred_name')
      .in('pco_id', personIds);
    const peopleMap = new Map((people ?? []).map((p) => [p.pco_id, p]));
    activeRequests = activeRows.map((r) => {
      const p = peopleMap.get(r.person_pco_id);
      const guestName =
        (p &&
          ([p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
            p.preferred_name)) ||
        `(${r.person_pco_id})`;
      return {
        id: r.id,
        personPcoId: r.person_pco_id,
        guestName,
        channel: r.channel,
        acknowledgedAt: r.acknowledged_at,
        assignedTo: r.assigned_to,
        escalated: r.escalated_at !== null,
      };
    });
  }

  return { pendingSignals, activeRequests };
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
