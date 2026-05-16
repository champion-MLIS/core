import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient, createServiceClient } from '../../../lib/supabase/server';

// Server-rendered per request. Without this, Next dev mode tries to pre-
// generate static paths and trips on the Supabase package import.
export const dynamic = 'force-dynamic';
import { signOutAction } from '../../actions';
import {
  completeTouchAction,
  snoozeTouchAction,
  uncompleteTouchAction,
} from '../actions';
import { SubmitButton } from '../_components/SubmitButton';
import { DraftPanel, type DraftBundle } from './_components/DraftPanel';
import { draftTouchAction } from './draft-action';
import { sendTouchAction } from './send-action';
import { formatDateTime, relativeDay } from '../../../lib/format';

const AI_DRAFTABLE_KINDS = new Set(['sms', 'email', 'event_invite']);

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

const VOICE_SAMPLE_HINTS: Record<string, string> = {
  sms: 'Guest Follow-Up SMS (templates/voice-samples.md)',
  email: 'Guest Follow-Up Email (templates/voice-samples.md)',
  handwritten_card: "Pastor Stephen's personal voice — warm, brief, by name",
  phone_call: 'Listening-focused, NOT selling. Voice samples speak to tone.',
  event_invite: '"Come to this thing," not "come back to church."',
};

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-zinc-100 text-zinc-700',
  drafting: 'bg-amber-100 text-amber-800',
  awaiting_action: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-emerald-100 text-emerald-800',
  missed: 'bg-red-100 text-red-700',
  na: 'bg-zinc-100 text-zinc-500',
};

export default async function TouchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: touchId } = await params;

  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  // Touch + journey + person + household, all in one query.
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select(
      `
      id, touch_number, kind, owner_role, is_recovery,
      scheduled_for, due_at, status, payload, journey_id,
      completed_at, completed_by, notes,
      guest_journeys!inner (
        id, person_pco_id, enrolled_at, enrollment_kind, status,
        people!inner (
          pco_id, first_name, last_name, preferred_name,
          is_child, household_pco_id, current_stage
        )
      )
    `,
    )
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch fetch failed: ${tErr.message}`);
  if (!touch) notFound();

  const person = touch.guest_journeys.people;
  const journey = touch.guest_journeys;

  // Parallel: contact, household with kids, all touches on the journey,
  // active pastoral flags.
  const [emailRes, phoneRes, householdRes, allTouchesRes, flagRes] = await Promise.all([
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
      .from('touches')
      .select('id, touch_number, kind, is_recovery, scheduled_for, status, payload')
      .eq('journey_id', journey.id)
      .order('touch_number', { ascending: true }),
    db
      .from('pastoral_flags')
      .select('id, reason, raised_at')
      .eq('person_pco_id', person.pco_id)
      .is('resolved_at', null),
  ]);

  const primaryEmail = emailRes.data?.address ?? null;
  const primaryPhone = phoneRes.data?.number ?? null;
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
  const allTouches = (allTouchesRes.data ?? []) as Array<{
    id: string;
    touch_number: number;
    kind: string;
    is_recovery: boolean;
    scheduled_for: string;
    status: string;
    payload: unknown;
  }>;
  const flags = flagRes.data ?? [];

  const guestName =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() ||
    person.preferred_name ||
    `(${person.pco_id})`;
  const preferredName = person.preferred_name ?? person.first_name ?? guestName;

  const touchLabel =
    (touch.payload as { label?: string } | null)?.label ?? `Touch ${touch.touch_number}`;
  const guidance = (touch.payload as { guidance?: string } | null)?.guidance ?? '';

  const isComplete = touch.status === 'completed';
  const isNa = touch.status === 'na';

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Touch Detail</h1>
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
              {flags.length === 1
                ? `Reason: ${flags[0]!.reason}. `
                : `${flags.length} active flags. `}
              Do not act on this touch without explicit pastoral clearance.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: guest header + the touch itself + actions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Guest header */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-semibold tracking-tight">{guestName}</h2>
                <StagePill stage={person.current_stage} />
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {person.preferred_name && person.preferred_name !== person.first_name
                  ? `Goes by ${person.preferred_name}. `
                  : ''}
                PCO {person.pco_id}
              </p>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Email</dt>
                  <dd className="mt-0.5">
                    {primaryEmail ? (
                      <a className="text-zinc-900 underline-offset-4 hover:underline" href={`mailto:${primaryEmail}`}>
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
                      <a className="text-zinc-900 underline-offset-4 hover:underline" href={`tel:${primaryPhone}`}>
                        {primaryPhone}
                      </a>
                    ) : (
                      <span className="text-zinc-400">(none on file)</span>
                    )}
                  </dd>
                </div>
                {household && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Household</dt>
                    <dd className="mt-0.5 text-zinc-900">
                      {household.name ?? 'unnamed'}
                      {household.member_count != null && ` · ${household.member_count} members`}
                      {household.people
                        .filter((m) => m.pco_id !== person.pco_id)
                        .map((m) => {
                          const name = [m.first_name, m.last_name]
                            .filter(Boolean)
                            .join(' ')
                            .trim();
                          return (
                            <span key={m.pco_id} className="ml-2 text-xs text-zinc-500">
                              · {name}
                              {m.is_child ? ' (child)' : ''}
                            </span>
                          );
                        })}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                <span>
                  Journey started by <strong>{journey.enrollment_kind.replace('_', ' ')}</strong>{' '}
                  on {formatDateTime(journey.enrolled_at)} ({relativeDay(journey.enrolled_at)})
                </span>
                <Link
                  href={`/journeys/${journey.id}`}
                  className="text-zinc-900 underline-offset-4 hover:underline"
                >
                  View full journey →
                </Link>
              </div>
            </div>

            {/* The touch */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Touch {touch.touch_number} of 8
                    {touch.is_recovery ? ' · recovery' : ''}
                  </p>
                  <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{touchLabel}</h2>
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_BADGES[touch.status] ?? 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {touch.status.replace('_', ' ')}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Kind</dt>
                  <dd className="mt-0.5 text-zinc-900">
                    {TOUCH_KIND_LABELS[touch.kind] ?? touch.kind}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Owner</dt>
                  <dd className="mt-0.5 text-zinc-900">
                    {OWNER_ROLE_LABELS[touch.owner_role] ?? touch.owner_role}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Due</dt>
                  <dd className="mt-0.5 text-zinc-900">
                    {relativeDay(touch.due_at)}
                    <span className="block text-xs text-zinc-500">
                      {formatDateTime(touch.due_at)}
                    </span>
                  </dd>
                </div>
              </dl>

              {guidance && (
                <div className="mt-5 rounded-md border border-zinc-100 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-800">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Guidance for {preferredName}
                  </p>
                  <p className="mt-1.5 whitespace-pre-line">{guidance}</p>
                </div>
              )}

              {VOICE_SAMPLE_HINTS[touch.kind] && (
                <p className="mt-3 text-xs text-zinc-500">
                  <strong className="text-zinc-700">Voice reference:</strong>{' '}
                  {VOICE_SAMPLE_HINTS[touch.kind]}
                </p>
              )}

              {/* AI draft + send — Phase C & D */}
              {AI_DRAFTABLE_KINDS.has(touch.kind) ? (
                <div className="mt-5">
                  <DraftPanel
                    touchId={touch.id}
                    channel={touch.kind as 'sms' | 'email' | 'event_invite'}
                    bundle={
                      ((touch.payload as { draft?: DraftBundle } | null)?.draft as
                        | DraftBundle
                        | undefined) ?? null
                    }
                    draftAction={draftTouchAction}
                    sendAction={sendTouchAction}
                    recipientEmail={primaryEmail}
                    recipientPhone={primaryPhone}
                  />
                </div>
              ) : (
                <div className="mt-5 rounded-md border border-dashed border-zinc-200 bg-white p-4 text-xs text-zinc-500">
                  This is a human-actioned touch — no AI draft. The guidance above is the
                  spec; act on it directly and mark done when complete.
                </div>
              )}
            </div>

            {/* Action panel */}
            {!isNa && (
              <div className="rounded-lg border border-zinc-200 bg-white p-5">
                <h3 className="text-sm font-semibold tracking-tight">Actions</h3>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {isComplete ? (
                    <>
                      <p className="mr-2 text-sm text-zinc-600">
                        Completed {touch.completed_at && relativeDay(touch.completed_at)} by{' '}
                        {touch.completed_by ?? 'unknown'}.
                      </p>
                      <form action={uncompleteTouchAction}>
                        <input type="hidden" name="touch_id" value={touch.id} />
                        <SubmitButton pendingLabel="Undoing…" tone="secondary">
                          Undo "done"
                        </SubmitButton>
                      </form>
                    </>
                  ) : (
                    <>
                      <form action={completeTouchAction}>
                        <input type="hidden" name="touch_id" value={touch.id} />
                        <SubmitButton pendingLabel="Marking…" tone="primary">
                          Mark done
                        </SubmitButton>
                      </form>
                      <form action={snoozeTouchAction}>
                        <input type="hidden" name="touch_id" value={touch.id} />
                        <SubmitButton pendingLabel="Snoozing…" tone="secondary">
                          Snooze 24h
                        </SubmitButton>
                      </form>
                      <button
                        type="button"
                        disabled
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-400"
                        title="Becky escalation — wired in Phase D"
                      >
                        Escalate to Becky
                      </button>
                      <button
                        type="button"
                        disabled
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-400"
                        title="Pastoral flag — wired with the override admin UI"
                      >
                        Flag for pastoral review
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: journey at a glance */}
          <aside className="space-y-6">
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold tracking-tight">21-day journey</h3>
              <ul className="mt-4 space-y-2">
                {allTouches.map((t) => {
                  const label =
                    (t.payload as { label?: string } | null)?.label ?? `Touch ${t.touch_number}`;
                  const active = t.id === touch.id;
                  return (
                    <li
                      key={t.id}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                        active ? 'bg-zinc-100 font-medium text-zinc-900' : ''
                      }`}
                    >
                      <TouchStatusGlyph status={t.status} />
                      <Link
                        href={`/touches/${t.id}`}
                        className={`flex-1 ${active ? 'pointer-events-none' : 'hover:underline'}`}
                      >
                        <div>{label}</div>
                        <div className="text-xs text-zinc-500">
                          {TOUCH_KIND_LABELS[t.kind] ?? t.kind}
                          {t.is_recovery ? ' · recovery' : ''}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </main>
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
      stage: {stage}
    </span>
  );
}

function TouchStatusGlyph({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="grid size-5 place-items-center rounded-md bg-zinc-900 text-white">
        <svg className="size-3" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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
      <span className="grid size-5 place-items-center rounded-md border border-zinc-200 text-zinc-400 text-xs">
        —
      </span>
    );
  }
  if (status === 'missed') {
    return (
      <span className="grid size-5 place-items-center rounded-md bg-red-100 text-red-700 text-xs font-medium">
        !
      </span>
    );
  }
  return <span className="size-5 rounded-md border border-zinc-300" />;
}
