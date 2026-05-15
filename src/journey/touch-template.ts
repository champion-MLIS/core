/**
 * 21-day Guest Follow-Up touch template.
 *
 * This file encodes the workflow spec from
 *   docs/master-instructions.md + workflows/guest-follow-up/spec.md
 *
 * 8 touches over 21 days. Each entry below defines:
 *   - touch_number    (1..8)
 *   - kind            — what the action is (AI-drafted message or human action)
 *   - owner_role      — who's responsible (continuity matters for 1/5/7)
 *   - day_offset      — days after Day 1 (enrollment day)
 *   - grace_hours     — how long past scheduled before it becomes "missed"
 *   - is_recovery     — touches 6, 7, 8 only fire if guest hasn't returned by Day 10
 *   - guidance        — human instruction string, embedded in the task description
 *
 * Days are Day 1 = enrollment day (Sunday). Subsequent days are calendar
 * days from Day 1, NOT business days. Day 1 = +0, Day 7 = +6, Day 21 = +20.
 *
 * Per Stephen's spec, hours-of-day ("by 2 PM", "5-7 PM") are guidance to
 * the human owner, not enforced by the scheduler. They become part of the
 * task description so the volunteer knows when to act.
 */

import type { TouchKind, TouchOwnerRole } from '../db/index.ts';

export interface TouchTemplate {
  touch_number: number;
  kind: TouchKind;
  owner_role: TouchOwnerRole;
  /** Days after enrollment day (Day 1 = 0 offset). */
  day_offset: number;
  /** Hours past scheduled before the touch is considered missed. Default 24. */
  grace_hours: number;
  /** Is this part of the recovery sequence (touches 6-8)? */
  is_recovery: boolean;
  /** Human-readable label for dashboards / CLI. */
  label: string;
  /** Guidance for the owner: when, where, tone, content notes. Goes into the task. */
  guidance: string;
}

export const TOUCH_TEMPLATE: readonly TouchTemplate[] = [
  {
    touch_number: 1,
    kind: 'sms',
    owner_role: 'connections_volunteer',
    day_offset: 0,
    grace_hours: 12,
    is_recovery: false,
    label: 'Day 1 — Sunday SMS',
    guidance:
      'Send by 2:00 PM the same Sunday. "We noticed you, no reply needed." Warm, brief, personal. Voice sample to model: Guest Follow-Up SMS.',
  },
  {
    touch_number: 2,
    kind: 'handwritten_card',
    owner_role: 'senior_pastor',
    day_offset: 1,
    grace_hours: 36,
    is_recovery: false,
    label: 'Day 2 — Handwritten card from Pastor Stephen',
    guidance:
      'Mailed Monday AM. Address by name. One short note. Pastor Stephen\'s personal voice.',
  },
  {
    touch_number: 3,
    kind: 'email',
    owner_role: 'connections_pastor',
    day_offset: 2,
    grace_hours: 24,
    is_recovery: false,
    label: 'Day 3 — Email from Becky',
    guidance:
      'Personal email from Connections Pastor (Becky). ONE ask, ONE link, no newsletter format. Voice sample to model: Guest Follow-Up Email.',
  },
  {
    touch_number: 4,
    kind: 'phone_call',
    owner_role: 'lay_volunteer',
    day_offset: 3,
    grace_hours: 36,
    is_recovery: false,
    label: 'Day 4–5 — Lay volunteer call',
    guidance:
      'Wed or Thu, 5–7 PM local. Listening-focused, NOT selling. Ask how their Sunday felt. If no answer, leave a single voicemail and mark as attempted.',
  },
  {
    touch_number: 5,
    kind: 'sms',
    owner_role: 'connections_volunteer',
    day_offset: 6,
    grace_hours: 6,
    is_recovery: false,
    label: 'Day 7 — Saturday reminder SMS',
    guidance:
      'Saturday 4–7 PM. SAME volunteer as Touch 1 (continuity). References specific Sunday content (sermon title or key point). Calm tone: NO exclamation marks, NO emoji. Different voice register from the others.',
  },
  {
    touch_number: 6,
    kind: 'handwritten_card',
    owner_role: 'matched_leader',
    day_offset: 9,
    grace_hours: 48,
    is_recovery: true,
    label: 'Day 10 — Second card (recovery)',
    guidance:
      'RECOVERY TOUCH — only fires if guest has not returned by Sunday Week 2. Different signer than Touch 2. LaCinda by default; substitute a ministry-leader-matched signer if life stage data warrants (e.g., kids\' pastor if family has young kids).',
  },
  {
    touch_number: 7,
    kind: 'event_invite',
    owner_role: 'connections_volunteer',
    day_offset: 13,
    grace_hours: 24,
    is_recovery: true,
    label: 'Day 14 — Event invite (recovery)',
    guidance:
      'RECOVERY TOUCH — only if no return. SAME volunteer as Touches 1 and 5. "Come to this thing," NOT "come back to church." Pick a low-friction upcoming event the guest could reasonably attend.',
  },
  {
    touch_number: 8,
    kind: 'email',
    owner_role: 'connections_pastor',
    day_offset: 20,
    grace_hours: 48,
    is_recovery: true,
    label: 'Day 21 — Final warm touch (recovery)',
    guidance:
      'RECOVERY TOUCH — only if no return. Final touch in the 21-day sequence. From Becky. Opens the door for ongoing contact WITHOUT pressure. No "come back" language. Closing tone: "we\'re here whenever."',
  },
] as const;

/**
 * Compute the scheduled_for and due_at timestamps for a given touch,
 * given the enrollment moment.
 *
 * Today: scheduled_for is set to (enrollment date + day_offset) at midnight
 * local time. The CLI / dashboard surfaces the guidance to the owner so
 * they act at the right hour. We don't enforce hours-of-day in code.
 *
 * Future: when we ship the actual send + scheduler, the guidance hours
 * become real cron-style triggers.
 */
export function computeTouchTiming(
  enrolledAt: Date,
  template: TouchTemplate,
): { scheduled_for: Date; due_at: Date } {
  const scheduled = new Date(enrolledAt);
  scheduled.setUTCDate(scheduled.getUTCDate() + template.day_offset);
  const due = new Date(scheduled);
  due.setUTCHours(due.getUTCHours() + template.grace_hours);
  return { scheduled_for: scheduled, due_at: due };
}
