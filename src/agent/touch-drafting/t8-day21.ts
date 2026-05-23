/**
 * Touch 8 — Day-21 final warm touch.
 *
 * Last touch in the 21-day sequence. From Becky. Opens the door for
 * ongoing contact WITHOUT pressure. The sermon library is framed as an
 * ongoing gift, not a "one last try".
 *
 * Voice sample: closest is the At-Risk Re-Engagement email's closing
 * tone ("we miss you, no catch"). Status: approximated.
 */

import type { DrafterSpec } from './types.ts';

export const T8_DAY21: DrafterSpec = {
  key: '8',
  voiceSampleCited: 'At-Risk Re-Engagement Email (closing tone) — no canonical Day-21 sample',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
  ],
  maxTokens: 640,
  buildSystemPrompt: () => `You are writing on behalf of Becky Cota, Champion Church's Connections Pastor. This is the final touch in the 21-day guest follow-up sequence to someone who hasn't returned. Goal: open the door for ongoing contact, gently. No pressure. No "last chance" framing.

Compose ONE email. Set sms=null and brief=null.

Hard rules:
  - Subject is name-free, warm, signals "still here whenever".
  - Open with first name.
  - Tone: settled, unhurried, generous. NOT "here's one more try". This is "we're not going anywhere; you're welcome whenever".
  - Frame the sermon library as an ongoing gift — "this is here whenever you want it" — not as bait.
  - ONE link: Champion website / sermon library.
  - End by opening the door to occasional check-ins ("we'll keep you on the very light list — let us know any time if you'd rather we didn't" or similar opt-out-friendly framing).
  - Sign-off: "Becky" (warm, first-name only).
  - No "we miss you" (Touch 6 owned that). No "come back" language. No urgency. No exclamation marks in the subject.

Model on the At-Risk Re-Engagement email's closing tone. Cite as adjacent in voice_notes.`,
  buildUserMessage: (c, links) => {
    const sermonLine = c.sermon?.sermon_title
      ? `From their first Sunday: "${c.sermon.sermon_title}"${c.sermon.sermon_series ? ` (series: ${c.sermon.sermon_series})` : ''}.`
      : 'No first-Sunday sermon title on file.';
    const priorLine = c.prior_touches.length
      ? `They've received ${c.prior_touches.length} earlier touches over the past three weeks.`
      : 'Earlier touches log is empty (system may have just enrolled them).';

    return `Touch 8 — Day-21 final warm touch from Becky.

Person:
  - First name: ${c.person.preferred_name}

Context:
  ${sermonLine}
  ${priorLine}

Available link (ONE only):
  Champion website / sermon library: ${links.website}

Produce the JSON. Only email is populated. sms and brief null.`;
  },
  temperature: 0.5,
};
