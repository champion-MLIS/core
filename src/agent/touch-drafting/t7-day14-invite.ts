/**
 * Touch 7 — Day-14 event invitation (recovery).
 *
 * Recovery touch. Same connections volunteer as Touches 1 and 5. Invites
 * the guest to a specific low-friction upcoming event Champion has on
 * its calendar — NOT a generic "come back to church".
 *
 * Today, MLIS doesn't ingest events yet. The drafter has access only to
 * what is in the enriched context. If no upcoming events are known, the
 * draft references the sermon library and a "drop by anytime" framing —
 * with a note that this should ideally be an event invite once events
 * are wired up.
 *
 * Voice sample: closest is the Starting Point Invitation. Status:
 * approximated.
 */

import type { DrafterSpec } from './types.ts';

export const T7_DAY14_INVITE: DrafterSpec = {
  key: '7',
  voiceSampleCited: 'Starting Point Invitation (adjacent) — no canonical event-invite-from-volunteer sample',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
  ],
  maxTokens: 640,
  buildSystemPrompt: () => `You are writing on behalf of the SAME connections volunteer who sent Touches 1 and 5. The guest has not yet returned. Day 14. Goal: invite them to something specific and low-friction — "come to this thing", not "come back to church".

Compose ONE email. Set sms=null and brief=null.

Hard rules:
  - Subject is name-free, warm, and references the invitation generically (not the specific event name in the subject — keep that for the body).
  - Open with first name.
  - Frame as a personal invitation FROM the volunteer (first person where natural).
  - Pick ONE specific thing to invite to. Today, the MLIS doesn't ingest Champion's event calendar yet — so if no specific event is in the context, default to: "next Sunday with breakfast / coffee in the lobby" or "Wednesday night small group on [topic]" — the volunteer will edit before sending. Be honest in voice_notes that this is a placeholder pending event-data integration.
  - ONE link only: the sermon library / Champion website. The volunteer adds the event detail / RSVP in their own edit.
  - Reference something specific from THIS guest's history if you can (kids, sermon they heard, anything in prior_touches notes).
  - Sign-off: warm, first-person, the volunteer's first name only — placeholder "[Your name]" since the drafter doesn't know which volunteer until assigned.
  - No "come back" language. No pressure. No "we miss you" — Touch 6 already handled the "thinking of you" tone. Touch 7 is forward-looking.

Model on the Starting Point Invitation's "no agenda, no pressure" warmth. Cite that as adjacent in voice_notes.`,
  buildUserMessage: (c, links) => {
    const sermonLine = c.sermon?.sermon_title
      ? `From their first Sunday: "${c.sermon.sermon_title}"${c.sermon.sermon_series ? ` (series: ${c.sermon.sermon_series})` : ''}.`
      : 'No first-Sunday sermon title on file.';
    const kidsLine = c.kids?.household_children?.length
      ? `Kids in household (for event-fit context): ${c.kids.household_children.map((k) => k.first_name ?? '(child)').join(', ')}.`
      : 'No kids in household.';
    const volunteerLine = c.assigned_volunteer
      ? `Sign-off as: ${c.assigned_volunteer.full_name.split(' ')[0]} (the assigned connections volunteer). Replace the "[Your name]" placeholder with this.`
      : 'No assigned volunteer yet — use placeholder "[Your name]" for sign-off.';

    return `Touch 7 — Day-14 event invitation (recovery).

Person:
  - First name: ${c.person.preferred_name}

Context:
  ${sermonLine}
  ${kidsLine}

Available link (ONE only):
  Champion website / sermon library: ${links.website}

${volunteerLine}

Produce the JSON. Only email is populated; sms and brief null.`;
  },
  temperature: 0.55,
};
