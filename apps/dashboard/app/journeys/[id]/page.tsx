import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient, createServiceClient } from '../../../lib/supabase/server';
import { signOutAction } from '../../actions';
import { formatDateTime, relativeDay } from '../../../lib/format';

const OWNER_ROLE_LABELS: Record<string, string> = {
  connections_volunteer: 'Connections volunteer',
  senior_pastor: 'Pastor Stephen',
  connections_pastor: 'Becky',
  lay_volunteer: 'Lay volunteer',
  matched_leader: 'Ministry leader',
};

const TOUCH_KIND_LABELS: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  handwritten_card: 'Handwritten card',
  phone_call: 'Phone call',
  event_invite: 'Event invite',
};

const SIGNAL_KIND_LABELS: Record<string, string> = {
  connect_card: 'Submitted a Connect Card',
  prayer_request: 'Submitted a prayer request',
  first_giving: 'Made a first-time gift',
  child_checkin: 'Had a child checked in',
  service_attendance: 'Attended a service',
};

const STAGE_LABELS: Record<string, string> = {
  guest: 'Guest',
  connected: 'Connected',
  grouped: 'Grouped',
  serving: 'Serving',
  leader: 'Leader',
};

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: journeyId } = await params;

  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  const { data: journey, error: jErr } = await db
    .from('guest_journeys')
    .select(
      `
      id, person_pco_id, enrollment_kind, enrollment_signal_id,
      enrolled_at, returned_at, completed_at, cancelled_at, cancel_reason,
      status, workflow_version, notes,
      people!inner (
        pco_id, first_name, last_name, preferred_name,
        is_child, household_pco_id, current_stage, first_visit_date
      )
    `,
    )
    .eq('id', journeyId)
    .maybeSingle();
  if (jErr) throw new Error(`journey fetch failed: ${jErr.message}`);
  if (!journey) notFound();

  const person = journey.people;

  // Touches + signals + household + flags + other journeys for this person.
  const [touchesRes, signalsRes, householdRes, flagsRes, otherJourneysRes, emailRes, phoneRes] =
    await Promise.all([
      db
        .from('touches')
        .select(
          'id, touch_number, kind, owner_role, is_recovery, scheduled_for, due_at, status, payload, completed_at, completed_by, notes',
        )
        .eq('journey_id', journey.id)
        .order('touch_number', { ascending: true }),
      db
        .from('engagement_signals')
        .select('id, kind, occurred_at, source_pco_id, payload')
        .eq('person_pco_id', person.pco_id)
        .order('occurred_at', { ascending: false })
        .limit(10),
      person.household_pco_id
        ? db
            .from('households')
            .select(
              'pco_id, name, member_count, people!people_household_pco_id_fkey ( pco_id, first_name, last_name, is_child )',
            )
            .eq('pco_id', person.household_pco_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db
        .from('pastoral_flags')
        .select('id, reason, raised_at')
        .eq('person_pco_id', person.pco_id)
        .is('resolved_at', null),
      db
        .from('guest_journeys')
        .select('id, enrollment_kind, status, enrolled_at')
        .eq('person_pco_id', person.pco_id)
        .neq('id', journey.id)
        .order('enrolled_at', { ascending: false })
        .limit(5),
      db
        .from('emails')
        .select('address, is_primary')
        .eq('person_pco_id', person.pco_id)
        .eq('blocked', false)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('phone_numbers')
        .select('number, is_primary')
        .eq('person_pco_id', person.pco_id)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const touches = (touchesRes.data ?? []) as Array<{
    id: string;
    touch_number: number;
    kind: string;
    owner_role: string;
    is_recovery: boolean;
    scheduled_for: string;
    due_at: string;
    status: string;
    payload: unknown;
    completed_at: string | null;
    completed_by: string | null;
    notes: string | null;
  }>;
  const signals = (signalsRes.data ?? []) as Array<{
    id: string;
    kind: string;
    occurred_at: string;
    source_pco_id: string | null;
    payload: unknown;
  }>;
  const household = (householdRes.data ?? null) as null | {
    pco_id: string;
    name: string | null;
    member_count: number | null;
    people: Array<{
      pco_id: string;
      first_name: string | null;
      last_name: string | null;
      is_child: boolean | null;
    }>;
  };
  const flags = flagsRes.data ?? [];
  const otherJourneys = otherJourneysRes.data ?? [];
  const primaryEmail = emailRes.data?.address ?? null;
  const primaryPhone = phoneRes.data?.number ?? null;

  const guestName =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() ||
    person.preferred_name ||
    `(${person.pco_id})`;

  const completedCount = touches.filter((t) => t.status === 'completed').length;
  const naCount = touches.filter((t) => t.status === 'na').length;
  const progressPct =
    touches.length === 0 ? 0 : Math.round(((completedCount + naCount) / touches.length) * 100);

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Guest Journey</h1>
          </div>
          <form action={signOutAction}>
            <Link
              href="/touches"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              ← Worklist
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

      <section className="mx-auto max-w-6xl px-6 py-8">
        {flags.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="text-sm font-semibold text-red-900">
              ⚠️ Pastoral flag active — automated touches paused
            </h3>
            <p className="mt-1 text-sm text-red-800">
              {flags.map((f) => `${f.reason}`).join(', ')}. Do not act without explicit clearance.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: header + timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Guest + journey header */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-semibold tracking-tight">{guestName}</h2>
                <StagePill stage={person.current_stage} />
              </div>
              <p className="mt-1 text-sm text-zinc-500">PCO {person.pco_id}</p>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Email</dt>
                  <dd className="mt-0.5">
                    {primaryEmail ? (
                      <a
                        className="text-zinc-900 underline-offset-4 hover:underline"
                        href={`mailto:${primaryEmail}`}
                      >
                        {primaryEmail}
                      </a>
                    ) : (
                      <span className="text-zinc-400">(none on file)</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Phone</dt>
                  <dd className="mt-0.5">
                    {primaryPhone ? (
                      <a
                        className="text-zinc-900 underline-offset-4 hover:underline"
                        href={`tel:${primaryPhone}`}
                      >
                        {primaryPhone}
                      </a>
                    ) : (
                      <span className="text-zinc-400">(none on file)</span>
                    )}
                  </dd>
                </div>
              </dl>

              {/* Journey summary */}
              <div className="mt-5 border-t border-zinc-100 pt-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold tracking-tight">21-day journey</h3>
                  <JourneyStatusPill status={journey.status} />
                </div>
                <p className="mt-2 text-sm text-zinc-700">
                  Triggered by{' '}
                  <strong>
                    {SIGNAL_KIND_LABELS[journey.enrollment_kind] ?? journey.enrollment_kind}
                  </strong>{' '}
                  · enrolled {formatDateTime(journey.enrolled_at)} ({relativeDay(journey.enrolled_at)})
                </p>
                {journey.returned_at && (
                  <p className="mt-1 text-sm text-emerald-700">
                    🎉 Returned for a second visit on {formatDateTime(journey.returned_at)} —
                    recovery touches cancelled.
                  </p>
                )}
                {journey.completed_at && (
                  <p className="mt-1 text-sm text-zinc-600">
                    Journey completed {formatDateTime(journey.completed_at)}.
                  </p>
                )}
                {journey.cancelled_at && (
                  <p className="mt-1 text-sm text-red-700">
                    Cancelled {formatDateTime(journey.cancelled_at)}
                    {journey.cancel_reason ? ` — ${journey.cancel_reason}` : ''}.
                  </p>
                )}

                {/* Progress bar */}
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-2 rounded-full bg-zinc-900 transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums text-zinc-600">
                    {completedCount}/{touches.length} done
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold tracking-tight">Timeline</h3>
              <ol className="mt-4 space-y-3">
                {touches.map((t) => (
                  <TimelineRow key={t.id} touch={t} />
                ))}
              </ol>
            </div>
          </div>

          {/* Right: household + signals + other journeys */}
          <aside className="space-y-6">
            {household && (
              <div className="rounded-lg border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-semibold tracking-tight">Household</h3>
                <p className="mt-1 text-sm text-zinc-700">
                  {household.name ?? 'unnamed'}
                  {household.member_count != null && ` · ${household.member_count} members`}
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  {household.people.map((m) => {
                    const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
                    const isThis = m.pco_id === person.pco_id;
                    return (
                      <li
                        key={m.pco_id}
                        className={isThis ? 'font-medium text-zinc-900' : 'text-zinc-600'}
                      >
                        {name || `(${m.pco_id})`}
                        {m.is_child ? <span className="ml-1 text-xs text-zinc-500">(child)</span> : null}
                        {isThis ? <span className="ml-2 text-xs text-zinc-500">(this person)</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold tracking-tight">Engagement signals</h3>
              {signals.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">No signals recorded yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {signals.map((s) => (
                    <li key={s.id} className="border-l-2 border-zinc-200 pl-3">
                      <div className="font-medium text-zinc-900">
                        {SIGNAL_KIND_LABELS[s.kind] ?? s.kind}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {formatDateTime(s.occurred_at)} · {relativeDay(s.occurred_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {otherJourneys.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-semibold tracking-tight">Other journeys</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {otherJourneys.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/journeys/${j.id}`}
                        className="text-zinc-900 underline-offset-4 hover:underline"
                      >
                        {SIGNAL_KIND_LABELS[j.enrollment_kind] ?? j.enrollment_kind}
                      </Link>
                      <div className="text-xs text-zinc-500">
                        {j.status} · {relativeDay(j.enrolled_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function TimelineRow({
  touch,
}: {
  touch: {
    id: string;
    touch_number: number;
    kind: string;
    owner_role: string;
    is_recovery: boolean;
    scheduled_for: string;
    due_at: string;
    status: string;
    payload: unknown;
    completed_at: string | null;
    completed_by: string | null;
  };
}) {
  const label =
    (touch.payload as { label?: string } | null)?.label ?? `Touch ${touch.touch_number}`;

  return (
    <li className="flex items-start gap-4 rounded-md border border-zinc-100 p-3 hover:border-zinc-300">
      <TimelineGlyph status={touch.status} />
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <Link
            href={`/touches/${touch.id}`}
            className="font-medium text-zinc-900 underline-offset-4 hover:underline"
          >
            {label}
          </Link>
          <span className="text-xs text-zinc-500">{relativeDay(touch.scheduled_for)}</span>
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">
          {TOUCH_KIND_LABELS[touch.kind] ?? touch.kind} ·{' '}
          {OWNER_ROLE_LABELS[touch.owner_role] ?? touch.owner_role}
          {touch.is_recovery ? ' · recovery' : ''}
        </div>
        {touch.status === 'completed' && touch.completed_at && (
          <div className="mt-1 text-xs text-emerald-700">
            ✓ Completed {relativeDay(touch.completed_at)}
            {touch.completed_by ? ` by ${touch.completed_by}` : ''}
          </div>
        )}
        {touch.status === 'na' && (
          <div className="mt-1 text-xs text-zinc-500">Skipped — guest returned</div>
        )}
        {touch.status === 'missed' && (
          <div className="mt-1 text-xs text-red-700">Missed — escalated to Becky</div>
        )}
      </div>
    </li>
  );
}

function TimelineGlyph({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-white">
        <svg className="size-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 10l3.5 3.5L15 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === 'na') {
    return (
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-zinc-200 text-zinc-400">
        —
      </span>
    );
  }
  if (status === 'missed') {
    return (
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-red-100 text-red-700 text-sm font-bold">
        !
      </span>
    );
  }
  return (
    <span className="mt-0.5 size-6 shrink-0 rounded-full border-2 border-zinc-300 bg-white" />
  );
}

function StagePill({ stage }: { stage: string }) {
  const styles: Record<string, string> = {
    guest: 'bg-emerald-100 text-emerald-800',
    connected: 'bg-blue-100 text-blue-800',
    grouped: 'bg-indigo-100 text-indigo-800',
    serving: 'bg-purple-100 text-purple-800',
    leader: 'bg-amber-100 text-amber-800',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[stage] ?? 'bg-zinc-100 text-zinc-700'
      }`}
    >
      stage: {STAGE_LABELS[stage] ?? stage}
    </span>
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
