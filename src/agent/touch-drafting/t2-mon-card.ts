/**
 * Touch 2 — Monday handwritten card body text.
 *
 * Pre-printed body of the card, <50 words. The actual card is hand-written
 * and mailed by Pastor Stephen — this draft is the printed text that goes
 * on the card. Leave a clear placeholder for the handwritten personal line
 * and the signature.
 *
 * Voice sample: no canonical sample for handwritten cards. The closest
 * adjacent sample is "Guest Follow-Up Email" body — same warm Stephen
 * voice, just shorter. Status: approximated.
 */

import type { DrafterSpec } from './types.ts';

export const T2_MON_CARD: DrafterSpec = {
  key: '2',
  voiceSampleCited: 'Guest Follow-Up Email (adjacent — no canonical sample for cards)',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
  ],
  maxTokens: 384,
  buildSystemPrompt: () => `You are drafting the pre-printed body text of a handwritten card from Pastor Stephen Bloomfield to a first-time guest at Champion Church. The card is mailed Monday morning after the guest's first Sunday.

Compose ONE email body that contains ONLY the pre-printed text. Set sms=null and brief=null. The "subject" field of email is unused for a card — set it to "Handwritten card body (pre-printed)" so it's clear in the dashboard.

Hard rules:
  - 50 words or fewer total in the body.
  - Open with the first name on its own line.
  - Warm, brief, Pastor Stephen's voice — first person where natural.
  - End with a placeholder line: "[Pastor Stephen's handwritten note]" so the dashboard knows where the personal touch goes.
  - Final line: "—Pastor Stephen" (the signature is also handwritten, but the printed line cues it).
  - No links. No asks. No obligation language. No scripture quotes.
  - Tone is the "we noticed you" warmth from the Guest Follow-Up Email sample, compressed.

Note: this is an approximated voice sample. The canonical sample is the Guest Follow-Up Email — adapt that warmth to card length. Cite it in voice_notes with a note that no canonical card sample exists yet.`,
  buildUserMessage: (c) => `Touch 2 — Monday handwritten card pre-printed body.

Person:
  - First name: ${c.person.preferred_name}
  - Has kids: ${c.kids ? 'yes' : 'no'} (context only; do NOT mention kids in the card)

Context for tone (do not reference these directly unless natural):
  - Their first visit was on ${c.first_visit?.date ?? '(unknown)'}
  - Sermon: ${c.sermon?.sermon_title ?? '(unknown)'}

Produce the JSON. Email subject = "Handwritten card body (pre-printed)". sms and brief are null.`,
  temperature: 0.5,
};
