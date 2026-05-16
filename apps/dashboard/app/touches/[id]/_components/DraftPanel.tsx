'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

interface DraftEmail {
  subject: string;
  body: string;
}
interface DraftSms {
  body: string;
}
interface VoiceCheck {
  warm_personal: { pass: boolean; note: string };
  zero_pressure: { pass: boolean; note: string };
  sounds_like_champion: { pass: boolean; note: string };
  overall: 'pass' | 'fail';
  concerns: string[];
}
export interface DraftBundle {
  draft: { email: DraftEmail | null; sms: DraftSms | null; voice_notes?: string };
  voice_check: VoiceCheck;
  drafted_at: string;
}

interface Props {
  touchId: string;
  channel: 'sms' | 'email' | 'event_invite';
  bundle: DraftBundle | null;
  /** Server action that generates / regenerates the draft. */
  draftAction: (formData: FormData) => Promise<void>;
  /** Server action that sends the drafted message and marks the touch complete. */
  sendAction: (formData: FormData) => Promise<void>;
  /** Primary recipient email on file. Null if none — disables the email send button. */
  recipientEmail: string | null;
  /** Primary recipient phone on file. Null if none — disables the SMS send button. */
  recipientPhone: string | null;
}

export function DraftPanel({
  touchId,
  channel,
  bundle,
  draftAction,
  sendAction,
  recipientEmail,
  recipientPhone,
}: Props) {
  if (!bundle) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">AI draft</p>
        <p className="mt-1 text-sm text-zinc-700">
          No draft yet. Generate one in Champion&apos;s voice — you can copy / edit / rewrite
          before sending, or send directly with one click.
        </p>
        <form action={draftAction} className="mt-3">
          <input type="hidden" name="touch_id" value={touchId} />
          <BusyButton label="Draft this message" busyLabel="Drafting…" tone="primary" />
        </form>
      </div>
    );
  }

  const showEmail = bundle.draft.email && (channel === 'email' || channel === 'event_invite');
  const showSms = bundle.draft.sms && (channel === 'sms' || channel === 'event_invite');

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">AI draft</p>
        <span className="text-xs text-zinc-500">
          {new Date(bundle.drafted_at).toLocaleString('en-US', {
            timeZone: 'America/Phoenix',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      {showEmail && bundle.draft.email && (
        <ChannelBlock
          title="Email"
          recipient={recipientEmail}
          recipientLabel="To"
          body={`Subject: ${bundle.draft.email.subject}\n\n${bundle.draft.email.body}`}
          sendAction={sendAction}
          touchId={touchId}
          channelValue="email"
          canSend={recipientEmail !== null}
          noRecipientMessage="No email on file."
        />
      )}

      {showSms && bundle.draft.sms && (
        <ChannelBlock
          title="SMS"
          recipient={recipientPhone}
          recipientLabel="To"
          body={bundle.draft.sms.body}
          sendAction={sendAction}
          touchId={touchId}
          channelValue="sms"
          canSend={recipientPhone !== null}
          noRecipientMessage="No phone on file."
        />
      )}

      <VoiceCheckBadge check={bundle.voice_check} />

      <form action={draftAction} className="mt-4">
        <input type="hidden" name="touch_id" value={touchId} />
        <BusyButton label="Regenerate" busyLabel="Regenerating…" tone="secondary" />
      </form>
    </div>
  );
}

function ChannelBlock({
  title,
  recipient,
  recipientLabel,
  body,
  sendAction,
  touchId,
  channelValue,
  canSend,
  noRecipientMessage,
}: {
  title: string;
  recipient: string | null;
  recipientLabel: string;
  body: string;
  sendAction: (formData: FormData) => Promise<void>;
  touchId: string;
  channelValue: 'sms' | 'email';
  canSend: boolean;
  noRecipientMessage: string;
}) {
  return (
    <div className="mt-4 rounded-md border border-zinc-100 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
        <CopyButton text={body} />
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        {recipientLabel}:{' '}
        {recipient ? (
          <span className="font-medium text-zinc-700">{recipient}</span>
        ) : (
          <span className="italic">{noRecipientMessage}</span>
        )}
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 font-sans text-sm leading-relaxed text-zinc-800">
        {body}
      </pre>
      {canSend && (
        <form action={sendAction} className="mt-3">
          <input type="hidden" name="touch_id" value={touchId} />
          <input type="hidden" name="channel" value={channelValue} />
          <BusyButton
            label={`Send ${title} now`}
            busyLabel="Sending…"
            tone="primary"
            confirmFirst={`Send this ${title.toLowerCase()} to ${recipient}? This cannot be undone.`}
          />
        </form>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* swallow; fallback would be a selectable textarea */
        }
      }}
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

function VoiceCheckBadge({ check }: { check: VoiceCheck }) {
  const passing = check.overall === 'pass';
  return (
    <details className="mt-5 rounded-md border border-zinc-100 bg-zinc-50 p-3 text-sm">
      <summary className="cursor-pointer">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            passing ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          Voice check: {check.overall}
        </span>
        <span className="ml-2 text-xs text-zinc-500">show details</span>
      </summary>
      <ul className="mt-3 space-y-2 text-sm">
        <CheckRow label="Warm & personal" item={check.warm_personal} />
        <CheckRow label="Zero pressure" item={check.zero_pressure} />
        <CheckRow label="Sounds like Champion" item={check.sounds_like_champion} />
      </ul>
      {check.concerns.length > 0 && (
        <div className="mt-3 border-t border-zinc-200 pt-2">
          <p className="text-xs font-medium text-zinc-700">Concerns to address:</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-zinc-700">
            {check.concerns.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

function CheckRow({
  label,
  item,
}: {
  label: string;
  item: { pass: boolean; note: string };
}) {
  return (
    <li className="flex gap-2">
      <span aria-hidden="true">{item.pass ? '✅' : '❌'}</span>
      <div>
        <span className="font-medium text-zinc-900">{label}</span>
        <span className="ml-1 text-zinc-600">— {item.note}</span>
      </div>
    </li>
  );
}

function BusyButton({
  label,
  busyLabel,
  tone = 'primary',
  confirmFirst,
}: {
  label: string;
  busyLabel: string;
  tone?: 'primary' | 'secondary';
  /** If provided, ask the user to confirm via window.confirm before submitting. */
  confirmFirst?: string;
}) {
  const { pending } = useFormStatus();
  const base =
    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const styles =
    tone === 'primary'
      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
      : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100';
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirmFirst) return;
        if (!window.confirm(confirmFirst)) e.preventDefault();
      }}
      className={`${base} ${styles}`}
    >
      {pending ? busyLabel : label}
    </button>
  );
}
