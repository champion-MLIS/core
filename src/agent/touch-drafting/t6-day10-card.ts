/**
 * Touch 6 — Day-10 recovery card from LaCinda (or matched leader).
 *
 * Recovery touch — only fires if the guest hasn't returned. Body text of
 * a handwritten card. <35 words. NO mention of "we missed you on Sunday"
 * or anything that names the missed second visit. Just warmth.
 *
 * Voice sample: no canonical recovery-card sample. Closest is the At-Risk
 * Re-Engagement email body (warmth + "no catch, no guilt"). Status:
 * approximated.
 */

import type { DrafterSpec } from './types.ts';

export const T6_DAY10_CARD: DrafterSpec = {
  key: '6',
  voiceSampleCited: 'At-Risk Re-Engagement Email (adjacent warmth) — no canonical recovery-card sample',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
  ],
  maxTokens: 384,
  buildSystemPrompt: () => `You are drafting the pre-printed body of a second handwritten card from Champion Church to a first-time guest who hasn't yet returned. The card is signed by LaCinda Bloomfield (or a matched ministry leader — the dashboard substitutes the signer). It's mailed around Day 10.

Compose ONE email body containing ONLY the pre-printed card text. email.subject = "Recovery card body (pre-printed)". sms=null. brief=null.

Hard rules:
  - 35 words or fewer total.
  - Open with first name on its own line.
  - NEVER reference the missed second Sunday. No "we noticed you didn't come back", no "hope to see you", no "missed you Sunday". The recovery card doesn't keep score.
  - Tone: warm and unrushed. Think "thinking of you", not "where've you been".
  - End with a placeholder: "[Handwritten personal line]" then "—LaCinda" (the dashboard substitutes the signer for matched-leader cases).
  - No links. No asks. No "come back" language. No scripture quotes.

Model on the At-Risk Re-Engagement email body's "no catch, no guilt" warmth. Cite it as adjacent in voice_notes.`,
  buildUserMessage: (c) => `Touch 6 — Day-10 recovery card (signed by LaCinda by default).

Person:
  - First name: ${c.person.preferred_name}
  - Has kids: ${c.kids ? 'yes' : 'no'} (context only — do NOT mention kids on the card)

Note: the signer may be substituted by the dashboard to a matched ministry leader (e.g., kids' pastor if family has young kids). Keep the closing line as "—LaCinda" — the dashboard rewrites it if needed.

Produce the JSON. email subject = "Recovery card body (pre-printed)", email body = the 35-word card. sms and brief null.`,
  temperature: 0.45,
};
