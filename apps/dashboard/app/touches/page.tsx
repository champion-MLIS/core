import Link from 'next/link';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';
import { signOutAction } from '../actions';
import { completeTouchAction, snoozeTouchAction } from './actions';
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

export default async function TouchesPage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  // Pull every open touch, with the guest's name attached.
  const { data: touches, error } = await db
    .from('touches')
    .select(
      `
      id,
      touch_number,
      kind,
      owner_role,
      is_recovery,
      scheduled_for,
      due_at,
      status,
      payload,
      journey_id,
      guest_journeys!inner (
        id,
        person_pco_id,
        people!inner ( pco_id, first_name, last_name, preferred_name )
      )
    `,
    )
    .in('status', OPEN_STATUSES)
    .order('scheduled_for', { ascending: true });

  if (error) throw new Error(`worklist query failed: ${error.message}`);

  type Row = NonNullable<typeof touches>[number];

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
        {(touches?.length ?? 0) === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Touch</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(touches ?? []).map((t) => (
                  <TouchRow key={t.id} touch={t as Row} />
                ))}
              </tbody>
            </table>
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

function TouchRow({ touch }: { touch: TouchRowData }) {
  const person = touch.guest_journeys.people;
  const guestName =
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() ||
    person.preferred_name ||
    `(${person.pco_id})`;
  const label =
    (touch.payload as { label?: string } | null)?.label ?? `Touch ${touch.touch_number}`;

  return (
    <tr className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
      <td className="px-4 py-3">
        <div className="font-medium text-zinc-900">{guestName}</div>
        <div className="text-xs text-zinc-500">PCO {person.pco_id}</div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-zinc-900">{label}</div>
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
        <div className="flex items-center justify-end gap-2">
          <form action={completeTouchAction}>
            <input type="hidden" name="touch_id" value={touch.id} />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            >
              Mark done
            </button>
          </form>
          <form action={snoozeTouchAction}>
            <input type="hidden" name="touch_id" value={touch.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Snooze 24h
            </button>
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

// Type for the joined query result. PostgREST infers this at runtime; we
// declare the shape so TouchRow stays strictly typed.
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
