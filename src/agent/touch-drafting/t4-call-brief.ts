/**
 * Touch 4 — Lay volunteer phone-call brief.
 *
 * NOT a sent message. Produces a one-page brief the lay volunteer reads
 * before dialing. Brief includes: person summary, sermon context, kids,
 * Connect Card content, opening line, key listening question, and a
 * listening-discipline reminder.
 *
 * Voice sample: no canonical sample. The brief is an internal document,
 * not outbound voice. Status: approximated (cite the closest adjacent
 * which is the Guest Follow-Up Email opening warmth, for the suggested
 * opening line).
 */

import type { DrafterSpec } from './types.ts';

export const T4_CALL_BRIEF: DrafterSpec = {
  key: '4',
  voiceSampleCited: 'Guest Follow-Up Email (for opening-line warmth) — no canonical brief sample',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
    {
      id: 'kids_or_connect_card_or_sermon',
      required: (c) =>
        Boolean(c.kids?.household_children?.length) ||
        Boolean(c.connect_card?.content) ||
        Boolean(c.sermon?.sermon_title),
    },
  ],
  maxTokens: 1024,
  buildSystemPrompt: () => `You are producing a one-page brief for a lay volunteer at Champion Church who is about to make a phone call to a first-time guest.

This is NOT a sent message. It's a document the volunteer reads on screen before dialing. Set email=null and sms=null. The brief lives in the "brief" field as a single string of plain text with section headers.

The brief has SIX sections, in this order:

  1. Who you're calling. Name, ages of kids if any, the household at a glance.
  2. What we know about Sunday. Sermon title, what they checked into, anything from the Connect Card. Use the actual data — don't invent.
  3. Suggested opening line. ONE sentence the volunteer can say. Warm, personal, not scripted-sounding. Models on the Guest Follow-Up Email opening: "So glad you were with us Sunday."
  4. Key question to ask. ONE question, open-ended, listening-focused. NOT "do you want to come back?" or "are you planning to join?". Something like "What brought you to Champion this week?" or "Was there anything from Sunday that stuck with you?"
  5. Listening discipline reminder. ONE short paragraph: this call is to listen, not to recruit. Don't sell ministries. Don't ask them to commit to anything. If they ask a question, answer it. Otherwise, hear them out, take a couple of notes, and end the call warmly.
  6. If no answer / voicemail. ONE sentence the volunteer can leave on voicemail. Then: "Mark the touch attempted and move on. No second voicemail."

Format the brief as plain text with section headers like "1. Who you're calling" on their own lines. No markdown bold; this displays in a plain text panel.

The voice for the opening line and voicemail line should model the Guest Follow-Up Email's warmth. Cite "Guest Follow-Up Email (for opening-line warmth) — no canonical brief sample" in voice_notes.`,
  buildUserMessage: (c) => {
    const kidsLine = c.kids?.household_children?.length
      ? `Children in household: ${c.kids.household_children
          .map((k) => `${k.first_name ?? '(child)'}${k.age_years !== null ? ` (age ${k.age_years})` : ''}`)
          .join(', ')}.`
      : 'No children in household.';
    const sermonLine = c.sermon?.sermon_title
      ? `Sunday sermon: "${c.sermon.sermon_title}"${c.sermon.sermon_series ? ` (series: ${c.sermon.sermon_series})` : ''}.`
      : 'No sermon title on file.';
    const checkinLine = c.kids?.recent_checkins?.length
      ? `Kids check-ins: ${c.kids.recent_checkins
          .map((ci) => `${ci.person_pco_id} → ${ci.ministry_environment ?? 'unspecified'} at ${ci.occurred_at.slice(0, 10)}`)
          .join('; ')}.`
      : 'No kids check-in data.';
    const connectCardLine = c.connect_card?.content
      ? `Connect Card free text: "${c.connect_card.content.slice(0, 600)}"`
      : 'No Connect Card free text.';
    const priorLine = c.prior_touches.length
      ? `Prior touches completed for this guest: ${c.prior_touches
          .map((t) => `T${t.touch_number} (${t.kind}, ${t.completed_at.slice(0, 10)})`)
          .join(', ')}.`
      : 'No prior touches completed yet.';

    return `Touch 4 — Lay volunteer call brief.

Person:
  - First name: ${c.person.preferred_name}
  - Full name: ${c.person.full_name}
  - First visit: ${c.first_visit?.date ?? '(unknown)'}

Household + Sunday data:
  ${kidsLine}
  ${sermonLine}
  ${checkinLine}
  ${connectCardLine}

History:
  ${priorLine}

Produce the JSON. Only "brief" is populated; email and sms are null.`;
  },
  temperature: 0.4,
};
