import Link from 'next/link';
import { createServerClient, createServiceClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

import { signOutAction } from '../actions';
import {
  markCalledAction,
  markNoActionAction,
  reopenResponseAction,
  claimResponseAction,
} from './actions';
import { SubmitButton } from '../touches/_components/SubmitButton';
import { formatDateTime, relativeDay, formatPhone } from '../../lib/format';

const COMPLETED_WINDOW_MS = 24 * 60 * 60 * 1000;

const INTENT_LABELS: Record<string, string> = {
  home: 'Said HOME — decision / wants Champion',
};

type ResponseMeta = {
  salvation?: boolean;
  prayer?: boolean;
  processed_at?: string;
  pco_action?: string;
};

type ResponseRow = {
  id: string;
  from_phone: string;
  keyword: string;
  intent: string;
  body_raw: string;
  auto_reply_sent: boolean;
  auto_reply_body: string | null;
  status: string;
  received_at: string;
  callback_due_at: string;
  completed_at: string | null;
  completed_by: string | null;
  person_pco_id: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  meta: ResponseMeta | null;
};

const SELECT =
  'id, from_phone, keyword, intent, body_raw, auto_reply_sent, auto_reply_body, status, received_at, callback_due_at, completed_at, completed_by, person_pco_id, claimed_by, claimed_at, meta';

export default async function ResponsesPage() {
  const auth = await createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();
  const completedSince = new Date(Date.now() - COMPLETED_WINDOW_MS).toISOString();

  const [pendingRes, doneRes] = await Promise.all([
    db
      .from('inbound_responses')
      .select(SELECT)
      .eq('status', 'needs_callback')
      .order('callback_due_at', { ascending: true }),
    db
      .from('inbound_responses')
      .select(SELECT)
      .in('status', ['callback_done', 'no_action'])
      .gte('completed_at', completedSince)
      .order('completed_at', { ascending: false })
      .limit(20),
  ]);

  if (pendingRes.error) throw new Error(`callback queue query failed: ${pendingRes.error.message}`);
  if (doneRes.error) throw new Error(`recently-closed query failed: ${doneRes.error.message}`);

  const pending = (pendingRes.data ?? []) as ResponseRow[];
  const done = (doneRes.data ?? []) as ResponseRow[];
  const now = Date.now();
  const overdueCount = pending.filter((r) => new Date(r.callback_due_at).getTime() < now).length;

  return (
    <main className="min-h-dvh">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-zinc-500">Champion MLIS</p>
            <h1 className="text-lg font-semibold">Decision responses — callback queue</h1>
          </div>
          <form action={signOutAction}>
            <Link href="/" className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline">
              Dashboard
            </Link>
            <Link
              href="/touches"
              className="mr-4 text-sm text-zinc-600 underline-offset-4 hover:underline"
            >
              Touches
            </Link>
            <span className="mr-3 text-sm text-zinc-600">{user.email}</span>
            <button type="submit" className="text-sm text-zinc-600 underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-900">
          <p>
            People who texted <span className="font-semibold">HOME</span> got an instant welcome and
            the promise of a real person within 24 hours. This is that promise. Call them, then mark
            it done. Once you learn who they are, link them to their Planning Center record.
          </p>
          {overdueCount > 0 && (
            <p className="mt-2 font-semibold text-rose-700">
              {overdueCount} {overdueCount === 1 ? 'response is' : 'responses are'} past the 24-hour
              window — call these first.
            </p>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
            <h2 className="text-base font-semibold text-zinc-900">No one waiting on a call.</h2>
            <p className="mt-1 text-sm text-zinc-600">
              When someone texts HOME, they show up here with a 24-hour countdown.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">What they sent</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Call by</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <PendingRow key={r.id} row={r} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {done.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Recently closed (last 24 hours)
            </h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <tbody>
                  {done.map((r) => (
                    <ClosedRow key={r.id} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          Inbound keyword campaign (Phase F). Linking a response to a Planning Center person and
          enrolling them in the 21-day journey is a manual step today — see the backlog.
        </p>
      </section>
    </main>
  );
}

function FlagBadges({ meta }: { meta: ResponseMeta | null }) {
  if (!meta) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {meta.salvation && (
        <span className="inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
          decision for Christ
        </span>
      )}
      {meta.prayer && (
        <span className="inline-flex rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
          prayer — care engaged
        </span>
      )}
    </div>
  );
}

function PendingRow({ row, now }: { row: ResponseRow; now: number }) {
  const overdue = new Date(row.callback_due_at).getTime() < now;
  return (
    <tr
      className={`border-b border-zinc-100 last:border-0 ${
        overdue ? 'bg-rose-50/60' : 'hover:bg-zinc-50'
      }`}
    >
      <td className="px-4 py-3 align-top">
        <a
          href={`tel:${row.from_phone}`}
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          {formatPhone(row.from_phone)}
        </a>
        <div className="text-xs text-zinc-500">
          {row.person_pco_id
            ? `PCO ${row.person_pco_id}${row.meta?.pco_action === 'created' ? ' (new)' : ''}`
            : 'not yet in PCO'}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-zinc-900">{INTENT_LABELS[row.intent] ?? row.intent}</div>
        <div className="mt-0.5 text-xs text-zinc-500">
          texted “{row.body_raw.slice(0, 80)}”
          {row.auto_reply_sent ? ' · auto-reply sent' : ' · auto-reply NOT sent'}
        </div>
        <FlagBadges meta={row.meta} />
      </td>
      <td className="px-4 py-3 align-top text-zinc-700">
        <div>{relativeDay(row.received_at)}</div>
        <div className="text-xs text-zinc-500">{formatDateTime(row.received_at)}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className={overdue ? 'font-semibold text-rose-700' : 'text-zinc-700'}>
          {relativeDay(row.callback_due_at)}
        </div>
        <div className="text-xs text-zinc-500">{formatDateTime(row.callback_due_at)}</div>
        {row.claimed_by && (
          <div className="mt-1 text-xs font-medium text-emerald-700">claimed by {row.claimed_by}</div>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center justify-end gap-2">
          {!row.claimed_by && (
            <form action={claimResponseAction}>
              <input type="hidden" name="response_id" value={row.id} />
              <SubmitButton pendingLabel="Claiming…" tone="secondary">
                Claim
              </SubmitButton>
            </form>
          )}
          <form action={markCalledAction}>
            <input type="hidden" name="response_id" value={row.id} />
            <SubmitButton pendingLabel="Saving…" tone="primary">
              Mark called
            </SubmitButton>
          </form>
          <form action={markNoActionAction}>
            <input type="hidden" name="response_id" value={row.id} />
            <SubmitButton pendingLabel="Saving…" tone="secondary">
              No action
            </SubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}

function ClosedRow({ row }: { row: ResponseRow }) {
  const closedAt = row.completed_at ?? new Date().toISOString();
  const label = row.status === 'callback_done' ? 'Called' : 'No action';
  return (
    <tr className="border-b border-zinc-100 last:border-0 text-zinc-500">
      <td className="px-4 py-3">
        <div className="font-medium line-through decoration-zinc-400">
          {formatPhone(row.from_phone)}
        </div>
        <div className="text-xs">{INTENT_LABELS[row.intent] ?? row.intent}</div>
      </td>
      <td className="px-4 py-3 text-xs">
        {label} {relativeDay(closedAt)} · {formatDateTime(closedAt)}
        {row.completed_by ? ` · by ${row.completed_by}` : ''}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end">
          <form action={reopenResponseAction}>
            <input type="hidden" name="response_id" value={row.id} />
            <SubmitButton pendingLabel="Undoing…" tone="secondary">
              Undo
            </SubmitButton>
          </form>
        </div>
      </td>
    </tr>
  );
}
