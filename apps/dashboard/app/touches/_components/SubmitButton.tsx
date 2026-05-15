'use client';

import { useFormStatus } from 'react-dom';

/**
 * Submit button that disables itself + swaps label while the parent <form>'s
 * action is in flight. Fixes the "did I click it?" double-click problem on
 * the worklist.
 *
 * Two variants:
 *   - <SubmitButton tone="primary">Mark done</SubmitButton>
 *   - <SubmitButton tone="secondary">Snooze 24h</SubmitButton>
 */

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel: string;
  tone?: 'primary' | 'secondary';
}

export function SubmitButton({ children, pendingLabel, tone = 'primary' }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const base =
    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const styles =
    tone === 'primary'
      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
      : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100';
  return (
    <button type="submit" disabled={pending} className={`${base} ${styles}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
