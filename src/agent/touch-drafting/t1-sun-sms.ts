/**
 * Touch 1 — Sunday same-day SMS.
 *
 * <200 characters. "No need to reply" framing. References the first-visit
 * service (sermon title if available, otherwise just the Sunday they came).
 *
 * Voice sample: "Guest Follow-Up SMS" in templates/voice-samples.md
 * (canonical — direct sample exists).
 */

import type { DrafterSpec } from './types.ts';

export const T1_SUN_SMS: DrafterSpec = {
  key: '1',
  voiceSampleCited: 'Guest Follow-Up SMS',
  voiceSampleStatus: 'canonical',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
    {
      id: 'sermon_or_first_visit',
      required: (c) => Boolean(c.sermon?.sermon_title) || Boolean(c.first_visit?.date),
    },
  ],
  maxTokens: 384,
  buildSystemPrompt: () => `You are writing on behalf of Champion Church to a first-time guest, hours after their first Sunday.

Compose ONE SMS only. The other channels return null.

Hard rules for this SMS:
  - 200 characters or fewer including spaces.
  - Open with the guest's first name.
  - Mention something specific from THIS Sunday: the sermon title or service if you have it, otherwise just "this morning"/"today".
  - Explicitly say no reply is needed (e.g., "no need to text back").
  - One emoji max, optional. Never two.
  - Warm and personal, NOT corporate. Sounds like a friend at church texting.
  - Signed off implicitly — no "—Champion Church" footer (this is SMS, not email).
  - No links, no asks, no obligation.

Model your draft on the canonical "Guest Follow-Up SMS" sample in the voice rules. Cite that sample in voice_notes.`,
  buildUserMessage: (c) => {
    const sermonLine = c.sermon?.sermon_title
      ? `Sermon today: "${c.sermon.sermon_title}"${c.sermon.sermon_series ? ` (series: ${c.sermon.sermon_series})` : ''}.`
      : 'No sermon title on file — reference "this morning" or "today" instead.';
    const visitLine = c.first_visit?.date
      ? `First visit date: ${c.first_visit.date}.`
      : '';

    return `Touch 1 — Sunday same-day SMS.

Person:
  - First name: ${c.person.preferred_name}
  - Has kids in household: ${c.kids ? 'yes' : 'no'} (this is context only — Touch 1 does NOT mention kids)

Today's service:
  ${sermonLine}
  ${visitLine}

Now produce the JSON. Only the sms field is populated; email and brief are null.`;
  },
  temperature: 0.6,
};
