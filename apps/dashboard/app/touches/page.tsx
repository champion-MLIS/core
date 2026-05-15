import Link from 'next/link';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';
import { signOutAction } from '../actions';
import {
  completeTouchAction,
  snoozeTouchAction,
  uncompleteTouchAction,
} from './actions';
import { SubmitButton } from './_components/SubmitButton';
import { CompleteCheckbox } from './_components/CompleteCheckbox';
import { formatDateTime, relativeDay } from '../../lib/format';
import type { Database } from '@core/db/types.generated';

type TouchStatus = Database['public']['Enums']['touch_status'];

const OPEN_STATUSES: TouchStatus[] = ['pending', 'drafting', 'awaiting_action'];

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

// Recently-completed window: 24 hours.
const COMPLETED_WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function TouchesPage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const completedSince = new Date(Date.now() - COMPLETED_WINDOW_MS).toISOString();

  const [openRes, doneRes] = await Promise.all([
    db
      .from('touches')
      .select(
        `
        id, touch_number, kind, owner_role, is_recovery,
        scheduled_for, due_at, status, payload, journey_id, completed_at, completed_by,
        guest_journeys!inner (
          id, person_pco_id,
          people!inner ( pco_id, first_name, last_name, preferred_name )
        )
      `,
      )
      .in('status', OPEN_STATUSES)
      .order('scheduled_for', { ascending: true }),
    db
      .from('touches')
      .select(
        `
        id, touch_number, kind, owner_role, is_recovery,
        scheduled_for, due_at, status, payload, journey_id, completed_at, completed_by,
        guest_journeys!inner (
          id, person_pco_id,
          people!inner ( pco_id, first_name, last_name, preferred_name )
        )
      `,
      )
      .eq('status', 'completed')
      .gte('completed_at', completedSince)
      .order('completed_at', { ascending: false })
      .limit(20),
  ]);

  if (openRes.error) throw new Error(`open worklist query failed: ${openRes.error.message}`);
  if (doneRes.error) throw new Error(`recently-completed query failed: ${doneRes.error.message}`);

  const openTouches = (openRes.data ?? []) as TouchRowData[];
  const doneTouches = (doneRes.data ?? []) as TouchRowData[];

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">My Touches Today</h1>
          </div>
          <form action={signOutAction}>
            <Link
              href="/"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Dashboard
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

      <section className="mx-auto max-w-6xl px-6 py-8">
        {openTouches.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="w-12 px-4 py-3 font-medium">Done</th>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Touch</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {openTouches.map((t) => (
                  <OpenTouchRow key={t.id} touch={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {doneTouches.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Recently completed (last 24 hours)
            </h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <tbody>
                  {doneTouches.map((t) => (
                    <CompletedTouchRow key={t.id} touch={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          Showing every open touch across the system. User-specific filtering arrives once we
          map Supabase users to volunteer roles (Phase B.5).
        </p>
      </section>
    </main>
  );
}

function OpenTouchRow({ touch }: { touch: TouchRowData }) {
  const guestName = guestNameOf(touch);
  const label =
    (touch.payload as { label?: string } | null)?.label ?? `Touch ${touch.touch_number}`;

  return (
    <tr className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
      <td className="px-4 py-3 align-middle">
        <form action={completeTouchAction}>
          <input type="hidden" name="touch_id" value={touch.id} />
          <CompleteCheckbox ariaLabel={`Mark ${label} for ${guestName} as done`} />
        </form>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/journeys/${touch.journey_id}`}
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          {guestName}
        </Link>
        <div className="text-xs text-zinc-500">PCO {touch.guest_journeys.people.pco_id}</div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/touches/${touch.id}`}
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          {label}
        </Link>
        <div className="text-xs text-zinc-500">
          {TOUCH_KIND_LABELS[touch.kind] ?? touch.kind}
          {touch.is_recovery ? ' · recovery' : ''}
        </div>
      </td>
      <td className="px-4 py-3 text-zinc-700">
        {OWNER_ROLE_LABELS[touch.owner_role] ?? touch.owner_role}
      </td>
      <td className="px-4 py-3 text-zinc-700">
        <div>{relativeDay(touch.due_at)}</div>
        <div className="text-xs text-zinc-500">{formatDateTime(touch.due_at)}</div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={touch.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end">
          <form action={snoozeTouchAction}>
            <input type="hidden" name="touch_id" value={touch.id} />
            <SubmitButton pendingLabel="Snoozing…" tone="secondary">
              Snooze 24h
            </SubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}

function CompletedTouchRow({ touch }: { touch: TouchRowData }) {
  const guestName = guestNameOf(touch);
  const label =
    (touch.payload as { label?: string } | null)?.label ?? `Touch ${touch.touch_number}`;
  const completedAt = touch.completed_at ?? new Date().toISOString();

  return (
    <tr className="border-b border-zinc-100 last:border-0 text-zinc-500">
      <td className="w-12 px-4 py-3 align-middle">
        <span className="grid size-6 place-items-center rounded-md bg-zinc-900">
          <svg className="size-4 text-white" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 10l3.5 3.5L15 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium line-through decoration-zinc-400">{guestName}</div>
        <div className="text-xs">PCO {touch.guest_journeys.people.pco_id}</div>
      </td>
      <td className="px-4 py-3">
        <div className="line-through decoration-zinc-400">{label}</div>
        <div className="text-xs">{TOUCH_KIND_LABELS[touch.kind] ?? touch.kind}</div>
      </td>
      <td className="px-4 py-3 text-xs" colSpan={2}>
        Completed {relativeDay(completedAt)} · {formatDateTime(completedAt)}
        {touch.completed_by ? ` · by ${touch.completed_by}` : ''}
      </td>
      <td className="px-4 py-3" colSpan={2}>
        <div className="flex items-center justify-end">
          <form action={uncompleteTouchAction}>
            <input type="hidden" name="touch_id" value={touch.id} />
            <SubmitButton pendingLabel="Undoing…" tone="secondary">
              Undo
            </SubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    pending: 'bg-zinc-100 text-zinc-700',
    drafting: 'bg-amber-100 text-amber-800',
    awaiting_action: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        style[status] ?? 'bg-zinc-100 text-zinc-700'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-zinc-900">No open touches.</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Every touch is complete, snoozed, or no journeys are active yet.
      </p>
      <p className="mt-4 text-xs text-zinc-500">
        Journeys start when a connect card arrives in PCO. Until that happens, this page is
        quiet.
      </p>
    </div>
  );
}

function guestNameOf(touch: TouchRowData): string {
  const p = touch.guest_journeys.people;
  return (
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
    p.preferred_name ||
    `(${p.pco_id})`
  );
}

// Joined-query shape. PostgREST resolves this at runtime; we declare it for
// strict typing on the row components.
type TouchRowData = {
  id: string;
  touch_number: number;
  kind: string;
  owner_role: string;
  is_recovery: boolean;
  scheduled_for: string;
  due_at: string;
  status: string;
  payload: unknown;
  journey_id: string;
  completed_at: string | null;
  completed_by: string | null;
  guest_journeys: {
    id: string;
    person_pco_id: string;
    people: {
      pco_id: string;
      first_name: string | null;
      last_name: string | null;
      preferred_name: string | null;
    };
  };
};
