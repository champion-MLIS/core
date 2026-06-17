import Link from 'next/link';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

import { signOutAction } from '../actions';
import {
  addVolunteerAction,
  removeVolunteerAction,
  setActiveAction,
} from './actions';
import { SubmitButton } from '../touches/_components/SubmitButton';

type VolunteerRole = 'connections' | 'lay';

type VolunteerRow = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  current_load: number;
  created_at: string;
};

const ROLE_SECTIONS: Array<{ role: VolunteerRole; title: string; blurb: string }> = [
  {
    role: 'connections',
    title: 'Connections pool',
    blurb:
      'Continuity for touches 1, 5, 7, and the contextual reference. Lowest current_load wins at enrollment; established volunteers tiebreak.',
  },
  {
    role: 'lay',
    title: 'Lay pool',
    blurb: 'Continuity for touch 4 — the lay-led personal invite.',
  },
];

export default async function VolunteersPage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  const { data, error } = await db
    .from('volunteers')
    .select('id, full_name, email, role, is_active, current_load, created_at')
    .order('is_active', { ascending: false })
    .order('full_name', { ascending: true });

  if (error) throw new Error(`volunteers query failed: ${error.message}`);

  const all = (data ?? []) as VolunteerRow[];
  const byRole: Record<VolunteerRole, VolunteerRow[]> = {
    connections: all.filter((v) => v.role === 'connections'),
    lay: all.filter((v) => v.role === 'lay'),
  };

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Volunteer Pool</h1>
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
            <Link
              href="/responses"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Callbacks
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

      <section className="mx-auto max-w-6xl px-6 py-8 space-y-10">
        <p className="text-sm text-zinc-600">
          Add, deactivate, or reactivate volunteers without touching the database. Deactivated
          volunteers stop receiving new journeys but their history on past touches stays intact.
        </p>

        {ROLE_SECTIONS.map((section) => (
          <PoolSection
            key={section.role}
            role={section.role}
            title={section.title}
            blurb={section.blurb}
            rows={byRole[section.role]}
          />
        ))}
      </section>
    </main>
  );
}

function PoolSection({
  role,
  title,
  blurb,
  rows,
}: {
  role: VolunteerRole;
  title: string;
  blurb: string;
  rows: VolunteerRow[];
}) {
  const active = rows.filter((r) => r.is_active);
  const inactive = rows.filter((r) => !r.is_active);

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-900 uppercase">{title}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{blurb}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
          No volunteers in this pool yet. Add the first below.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Current load</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((v) => (
                <VolunteerRowView key={v.id} v={v} />
              ))}
              {inactive.map((v) => (
                <VolunteerRowView key={v.id} v={v} dimmed />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddVolunteerForm role={role} />
    </div>
  );
}

function VolunteerRowView({ v, dimmed = false }: { v: VolunteerRow; dimmed?: boolean }) {
  return (
    <tr
      className={`border-b border-zinc-100 last:border-0 ${
        dimmed ? 'bg-zinc-50/60 text-zinc-500' : 'hover:bg-zinc-50'
      }`}
    >
      <td className="px-4 py-3">
        <div className={`font-medium ${dimmed ? 'text-zinc-500' : 'text-zinc-900'}`}>
          {v.full_name}
        </div>
      </td>
      <td className="px-4 py-3 text-zinc-700">
        {v.email ? (
          <a
            href={`mailto:${v.email}`}
            className="underline-offset-4 hover:underline"
          >
            {v.email}
          </a>
        ) : (
          <span className="text-xs italic text-zinc-400">no email</span>
        )}
      </td>
      <td className="px-4 py-3">
        <LoadBadge load={v.current_load} dimmed={dimmed} />
      </td>
      <td className="px-4 py-3">
        {v.is_active ? (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            active
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
            inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {v.is_active ? (
            <>
              <form action={setActiveAction}>
                <input type="hidden" name="volunteer_id" value={v.id} />
                <input type="hidden" name="active" value="false" />
                <SubmitButton pendingLabel="Saving…" tone="secondary">
                  Deactivate
                </SubmitButton>
              </form>
              <form action={removeVolunteerAction}>
                <input type="hidden" name="volunteer_id" value={v.id} />
                <SubmitButton pendingLabel="Removing…" tone="secondary">
                  Remove
                </SubmitButton>
              </form>
            </>
          ) : (
            <form action={setActiveAction}>
              <input type="hidden" name="volunteer_id" value={v.id} />
              <input type="hidden" name="active" value="true" />
              <SubmitButton pendingLabel="Saving…" tone="primary">
                Reactivate
              </SubmitButton>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}

function LoadBadge({ load, dimmed }: { load: number; dimmed: boolean }) {
  const style = dimmed
    ? 'bg-zinc-100 text-zinc-500'
    : load === 0
      ? 'bg-zinc-100 text-zinc-600'
      : load < 3
        ? 'bg-emerald-100 text-emerald-800'
        : load < 6
          ? 'bg-amber-100 text-amber-800'
          : 'bg-rose-100 text-rose-800';
  return (
    <span
      className={`inline-flex min-w-[1.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${style}`}
    >
      {load}
    </span>
  );
}

function AddVolunteerForm({ role }: { role: VolunteerRole }) {
  const label = role === 'connections' ? 'connections volunteer' : 'lay volunteer';
  return (
    <form
      action={addVolunteerAction}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <input type="hidden" name="role" value={role} />
      <div className="flex-1 min-w-[12rem]">
        <label
          htmlFor={`full_name_${role}`}
          className="block text-xs font-medium text-zinc-600"
        >
          Full name <span className="text-rose-600">*</span>
        </label>
        <input
          id={`full_name_${role}`}
          name="full_name"
          type="text"
          required
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
          placeholder={`New ${label}`}
        />
      </div>
      <div className="flex-1 min-w-[14rem]">
        <label
          htmlFor={`email_${role}`}
          className="block text-xs font-medium text-zinc-600"
        >
          Email <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          id={`email_${role}`}
          name="email"
          type="email"
          autoComplete="off"
          className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none"
          placeholder="name@example.com"
        />
      </div>
      <SubmitButton pendingLabel="Adding…" tone="primary">
        Add {label}
      </SubmitButton>
    </form>
  );
}
