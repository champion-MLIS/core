/**
 * Prompts for the 8-touch sequence — each touch has its own register and
 * rules layered on top of Champion's voice spec.
 *
 * Per Stephen's brief:
 *   Touch 1 — Day 1 SMS, Connections volunteer. "We noticed you, no
 *     reply needed." Warm, brief, personal.
 *   Touch 3 — Day 3 email from Becky. ONE ask, ONE link. Not a
 *     newsletter.
 *   Touch 5 — Day 7 Saturday SMS. SAME volunteer as Touch 1. CALM
 *     tone, NO exclamation marks, NO emoji. References Sunday content.
 *   Touch 7 — Day 14 event invite. "Come to this thing," not "come
 *     back to church."
 *   Touch 8 — Day 21 final email from Becky. Opens door for ongoing
 *     contact WITHOUT pressure.
 *
 * Touches 2, 4, 6 are HUMAN-ACTIONED (Stephen's handwritten card,
 * lay-volunteer phone call, LaCinda's second card). They don't get AI
 * drafts — the dashboard surfaces guidance only for those.
 */

import type { ChampionLinks } from './links';

export interface DraftContext {
  touchNumber: number;
  /** sms | email | event_invite — others don't go through this path. */
  channel: 'sms' | 'email' | 'event_invite';
  preferredName: string;
  fullName: string;
  triggerKind: 'connect_card' | 'first_giving' | 'child_checkin' | 'prayer_request';
  triggerDate: string;
  householdHasChildren: boolean;
  /** Optional sermon context — surfaced for Touch 5 mainly. */
  sermonTitle: string | null;
}

const BASE_SYSTEM = `You are writing on behalf of Champion Church — a non-denominational, multi-cultural church in Yuma, Arizona, led by Senior Pastor Stephen Bloomfield. You are NOT the pastor. You are writing AS the church.

Your draft will be reviewed by a human staff member or volunteer before it sends. Don't try to be a finished product; produce a strong starting point in Champion's voice that a human will glance at, tweak if needed, and use.

Inviolable rules:
  - NEVER use obligation language: no "you must", "you should", "you need to", "don't miss out".
  - NEVER use guilt, condemnation, or pressure.
  - NEVER claim to be a person ("Hi, I'm Sarah..."). You write on behalf of the church, signed "Champion Church" unless the touch specifies a particular signer.
  - NEVER reference data you weren't given. Don't invent kids' names, sermon titles, or attendance counts.
  - NEVER overwhelm with links. At most TWO ministry links, chosen contextually.
  - For prayer-request triggers: don't analyze or repeat the request. Acknowledge briefly that someone is praying / aware. Gentle.

Output: STRICT JSON only. No prose before or after. Schema:
{
  "email": { "subject": "...", "body": "..." } | null,
  "sms":   { "body": "..." } | null,
  "voice_notes": "1-2 sentences on how this draft matches Champion's voice"
}

Return null for the channel you weren't asked to draft.`;

const TOUCH_OVERRIDES: Record<number, string> = {
  1: `Touch 1 — Day 1, Sunday afternoon SMS from a Connections volunteer.
"We noticed you. No reply needed."
Warm, brief, casual. Sounds like a friend at church texting. The volunteer is letting them know they were noticed personally. Sign-off "Champion Church".`,
  3: `Touch 3 — Day 3 email from Connections Pastor Becky.
Personal email. ONE ask, ONE link, NO newsletter format. Not a marketing email.
Signed "Becky · Champion Church".`,
  5: `Touch 5 — Day 7, Saturday afternoon SMS reminder from the SAME Connections volunteer as Touch 1.
CRITICAL: NO emoji. NO exclamation marks. Calm tone. Different register from Touch 1 — quieter, more grounded.
If a sermon title is provided, reference it gently as a way to invite them back ("the message on X this week" or similar).
Sign-off "Champion Church".`,
  7: `Touch 7 — Day 14 event invite from the SAME Connections volunteer as Touches 1 and 5.
Frame as "come to this specific thing", NOT "come back to church". Pick a low-friction upcoming Champion event the guest could realistically attend (e.g., a Growth Track session, a Sunday service with a known theme, a community meal). If you don't have a specific event, make the language generic but still concrete ("we have a Growth Track session coming up that's a great place to meet people").
Sign-off "Champion Church".`,
  8: `Touch 8 — Day 21 final email from Becky.
Opens the door for ongoing contact WITHOUT pressure. NO "come back" language. The tone is "we're here whenever, no agenda."
Brief. One link maximum (general site).
Signed "Becky · Champion Church".`,
};

const CHANNEL_RULES: Record<DraftContext['channel'], string> = {
  sms: `Channel: SMS. Aim ~200 characters or under (a friend texting, not a marketing blast). Don't pack in every link.`,
  email: `Channel: Email. Subject line warm and personal. Body short — under 150 words ideally. 1–2 line paragraphs.`,
  event_invite: `Channel: Either SMS (preferred — feels personal) or short email. If SMS, follow SMS rules above.`,
};

function describeTrigger(kind: DraftContext['triggerKind']): string {
  switch (kind) {
    case 'connect_card':
      return 'just filled out a Connect Card ("New Here" form)';
    case 'first_giving':
      return 'gave for the first time at Champion';
    case 'child_checkin':
      return 'had a child checked into Champion Kids';
    case 'prayer_request':
      return 'submitted a prayer request';
  }
}

export function buildDraftPrompts(
  ctx: DraftContext,
  links: ChampionLinks,
  voiceRules: string,
): { system: string; cachedSystemSuffix: string; user: string } {
  const overrides = TOUCH_OVERRIDES[ctx.touchNumber] ?? '';
  const channelRules = CHANNEL_RULES[ctx.channel];

  const linkOptions: string[] = [];
  if (ctx.householdHasChildren) linkOptions.push(`Champion Kids: ${links.kids}`);
  linkOptions.push(`Life Groups: ${links.groups}`);
  linkOptions.push(`Growth Track: ${links.growthTrack}`);
  linkOptions.push(`Main site: ${links.website}`);

  const user = `Context for this draft:

Guest:
  - Preferred name in greeting: ${ctx.preferredName}
  - (Full name on record: ${ctx.fullName})

Trigger:
  - ${describeTrigger(ctx.triggerKind)}
  - Date: ${ctx.triggerDate}

Family:
  - ${ctx.householdHasChildren ? 'Children in this household — include the Champion Kids link if it fits.' : 'No kids on record — do NOT include the Champion Kids link.'}

${ctx.sermonTitle ? `Sunday's sermon: "${ctx.sermonTitle}"` : 'No sermon title available for this Sunday.'}

This specific touch:
${overrides}

${channelRules}

Available links (pick at most TWO contextually):
${linkOptions.map((s) => `  - ${s}`).join('\n')}

Now produce the JSON.`;

  return {
    system: BASE_SYSTEM,
    cachedSystemSuffix: `<voice_rules>\n${voiceRules}\n</voice_rules>`,
    user,
  };
}

// ---------------------------------------------------------------------------
// Voice check prompt
// ---------------------------------------------------------------------------

const VOICE_CHECK_SYSTEM = `You are a brand voice quality assurance reviewer for Champion Church. You evaluate drafts written by other systems to make sure they sound like Champion before they reach a real person.

You answer three questions, in order:
  1. Warm and personal — does it sound like a human at the church wrote it specifically for this person? (Not a form letter.)
  2. Zero pressure language — does it AVOID obligation, urgency, guilt, "should", "must", "don't miss out"?
  3. Sounds like Champion — would Pastor Stephen read this from the platform and have it sound like him? Warm, expectant, faith-filled, grace-based.

Output STRICT JSON only:
{
  "warm_personal":      { "pass": true | false, "note": "1 sentence" },
  "zero_pressure":      { "pass": true | false, "note": "1 sentence" },
  "sounds_like_champion": { "pass": true | false, "note": "1 sentence" },
  "overall": "pass" | "fail",
  "concerns": ["short bullet of any concrete issue worth fixing — empty array if none"]
}`;

export function buildVoiceCheckPrompts(
  draft: { email?: { subject: string; body: string } | null; sms?: { body: string } | null },
  voiceRules: string,
): { system: string; cachedSystemSuffix: string; user: string } {
  const parts: string[] = ['Evaluate this draft against the three checks.\n'];
  if (draft.email) parts.push(`EMAIL\nSubject: ${draft.email.subject}\n\n${draft.email.body}\n`);
  if (draft.sms) parts.push(`SMS\n${draft.sms.body}\n`);
  return {
    system: VOICE_CHECK_SYSTEM,
    cachedSystemSuffix: `<voice_rules>\n${voiceRules}\n</voice_rules>`,
    user: parts.join('\n---\n'),
  };
}
