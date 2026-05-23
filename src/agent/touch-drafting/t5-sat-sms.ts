/**
 * Touch 5 — Saturday reminder SMS.
 *
 * Calm, specific to tomorrow's service. Same connections volunteer as
 * Touch 1 (continuity). NO exclamation marks, NO emoji — a different
 * voice register from Touch 1.
 *
 * Voice sample: no canonical Saturday-reminder sample. Closest is the
 * At-Risk Re-Engagement SMS (calm, low-pressure register). Status:
 * approximated.
 */

import type { DrafterSpec } from './types.ts';

export const T5_SAT_SMS: DrafterSpec = {
  key: '5',
  voiceSampleCited: 'At-Risk Re-Engagement SMS (adjacent calm register) — no canonical Saturday sample',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
  ],
  maxTokens: 384,
  buildSystemPrompt: () => `You are writing on behalf of the SAME connections volunteer who sent Touch 1 a week ago. The guest is the same first-time visitor; they have not yet returned for a second Sunday. It's now Saturday afternoon. Goal: a gentle, specific reminder that tomorrow is Sunday.

Compose ONE SMS. Set email=null and brief=null.

Hard rules — different register from Touch 1:
  - 200 characters or fewer.
  - Open with first name.
  - CALM tone. Not bright, not cheerleady.
  - NO exclamation marks. NO emoji. (Touch 1 may have used both — Touch 5 deliberately doesn't.)
  - Reference something specific to tomorrow if available — sermon series or topic. Otherwise: "tomorrow morning at Champion".
  - Imply continuity: "wanted to check in", "no pressure, just thinking of you".
  - No links. No asks. No "see you there!" — too pushy.
  - Sign-off implicit — no footer.

Model on the At-Risk Re-Engagement SMS register (calm, "no catch, no guilt"), adapted for "tomorrow" rather than "we miss you". Cite that sample as adjacent, and note in voice_notes that no canonical Saturday sample exists.`,
  buildUserMessage: (c) => {
    const sermonLine = c.sermon?.sermon_title
      ? `Tomorrow's sermon: "${c.sermon.sermon_title}"${c.sermon.sermon_series ? ` (series: ${c.sermon.sermon_series})` : ''}. (This is THIS Sunday — Touch 5 references tomorrow's service, which is the Sunday after enrollment week. Use it if specific; otherwise reference "tomorrow morning".)`
      : 'No sermon title for tomorrow — reference "tomorrow morning at Champion" generically.';

    return `Touch 5 — Saturday reminder SMS (same volunteer as Touch 1).

Person:
  - First name: ${c.person.preferred_name}
  - First visit: ${c.first_visit?.date ?? '(unknown)'}

${sermonLine}

Produce the JSON. Only sms is populated. No exclamation marks. No emoji.`;
  },
  temperature: 0.45,
};
