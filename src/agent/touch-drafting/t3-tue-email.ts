/**
 * Touch 3 — Tuesday email from Becky (Connections Pastor).
 *
 * Personal email, ONE ask, ONE link (the sermon library or relevant
 * ministry). Includes the prayer-request elicitation line per ADR-004 §3.4.
 *
 * Voice sample: "Guest Follow-Up Email" in templates/voice-samples.md
 * (canonical).
 */

import type { DrafterSpec } from './types.ts';

export const T3_TUE_EMAIL: DrafterSpec = {
  key: '3',
  voiceSampleCited: 'Guest Follow-Up Email',
  voiceSampleStatus: 'canonical',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
  ],
  maxTokens: 768,
  buildSystemPrompt: () => `You are writing on behalf of Becky Cota, Champion Church's Connections Pastor, to a guest on the Tuesday after their first Sunday.

Compose ONE email only. Set sms=null and brief=null.

Hard rules:
  - Subject is name-free (the body opens with their name).
  - Open with the first name on its own line.
  - Personal, warm, expectant — Becky's voice. Friend, not announcement.
  - Exactly ONE ask: invite them into ONE next step (e.g., reply with a question, or check out the sermon library).
  - Exactly ONE link in the body. Prefer the sermon library / Champion website. NEVER two links.
  - INCLUDE this elicitation line, verbatim or with light voice tweaks:
      "As we get to know you, is there anything we can be praying for you about? No pressure to share — but if there is, we'd consider it a privilege."
    This line is non-optional per ADR-004 §3.4. Place it near the end, before the sign-off.
  - Sign-off: warm closing + "Becky" (not "Pastor Becky", not "Champion Church"). She's writing as a person.
  - No "Dear" / "Hello" stiff openers. Just the first name.
  - No obligation language. No exclamation marks in the subject.
  - Reference something specific from Sunday if you have it (sermon title or kids' check-in).

Model on the canonical "Guest Follow-Up Email" sample. Cite it in voice_notes.`,
  buildUserMessage: (c, links) => {
    const linkChoice = `Champion website (default link choice): ${links.website}`;
    const sermonLine = c.sermon?.sermon_title
      ? `This past Sunday's sermon: "${c.sermon.sermon_title}"${c.sermon.sermon_series ? ` (series: ${c.sermon.sermon_series})` : ''}.`
      : 'No sermon title on file.';
    const kidsLine = c.kids?.household_children?.length
      ? `Kids in the household: ${c.kids.household_children.map((k) => k.first_name ?? '(child)').join(', ')}.`
      : 'No kids in household.';
    const connectCardLine = c.connect_card?.content
      ? `Connect Card free-text said: "${c.connect_card.content.slice(0, 240)}". You may gently reference the spirit of what they shared but don't quote back verbatim.`
      : 'No Connect Card free text on file.';

    return `Touch 3 — Tuesday email from Becky.

Person:
  - First name: ${c.person.preferred_name}

Context:
  ${sermonLine}
  ${kidsLine}
  ${connectCardLine}

Available link (pick exactly one, the most contextual):
  ${linkChoice}

Required elicitation line — include verbatim or with light voice tweaks:
  "As we get to know you, is there anything we can be praying for you about? No pressure to share — but if there is, we'd consider it a privilege."

Now produce the JSON. Only the email field is populated; sms and brief are null.`;
  },
  temperature: 0.6,
};
