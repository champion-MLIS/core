'use client';

import { useFormStatus } from 'react-dom';

/**
 * Checkbox-shaped affordance for marking a touch done. Lives inside a
 * <form action={completeTouchAction}>; submitting flips the row to
 * 'completed' on the server, and on the next render the row moves to the
 * "Recently completed" section.
 *
 * Visual states:
 *   - idle:       empty rounded square outlined in zinc-300, hoverable
 *   - submitting: filled with a spinner, disabled (prevents double-clicks)
 *   - completed:  filled zinc-900 with a white tick (rendered separately
 *                 on the recently-completed row, not by this component)
 */

interface Props {
  ariaLabel: string;
}

export function CompleteCheckbox({ ariaLabel }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      className="group grid size-6 place-items-center rounded-md border border-zinc-300 bg-white transition-colors hover:border-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Spinner />
      ) : (
        <svg
          className="size-4 opacity-0 transition-opacity group-hover:opacity-40"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M5 10l3.5 3.5L15 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin text-zinc-900" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M17 10a7 7 0 00-7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
