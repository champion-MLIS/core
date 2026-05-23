/**
 * Touch 9 — Day-11 contextual reference SMS (precious cargo).
 *
 * Inserted by the Prayer Response Agent when a precious-cargo record
 * exists for the guest. ADR-004 §3.5. Day 11 (between Touch 5 and Touch 6).
 *
 * Constraints (non-negotiable):
 *   - References the prayer-share by TOPIC ONLY — never quotes the
 *     original content back at the guest.
 *   - Human warmth, NOT pastoral content. No scripture, no resource
 *     links, no "praying for you" promise — the PCPOC is doing the
 *     actual pastoral work.
 *   - Sender is the assigned connections volunteer (continuity from
 *     Touches 1/5/7). Sign-off uses the volunteer's first name.
 *
 * Voice sample: no canonical sample for this touch. The closest adjacent
 * is the Guest Follow-Up SMS warmth (Touch 1) softened. Status:
 * approximated.
 */

import type { DrafterSpec } from './types.ts';

export const T9_CONTEXTUAL_SMS: DrafterSpec = {
  key: 'contextual_reference',
  voiceSampleCited: 'Guest Follow-Up SMS (adjacent softened) — no canonical contextual-reference sample',
  voiceSampleStatus: 'approximated',
  attentiveness: [
    {
      id: 'preferred_name',
      required: (c) => Boolean(c.person.preferred_name && c.person.preferred_name !== '(friend)'),
    },
    {
      id: 'assigned_volunteer',
      required: (c) => Boolean(c.assigned_volunteer?.full_name),
    },
  ],
  maxTokens: 384,
  buildSystemPrompt: () => `You are writing on behalf of a connections volunteer at Champion Church who has been walking with this guest for the past week and a half. The guest shared something personal earlier in the journey (a prayer request) and the pastoral team has already followed up separately. This SMS is a light, human check-in — NOT a pastoral move.

Compose ONE SMS. Set email=null and brief=null.

INVIOLABLE RULES (ADR-004 §3.5):
  - Reference what they shared by TOPIC OR FEELING ONLY. Never quote any words from the original. Never name what you think they're going through.
  - Default openings — pick whichever fits best, in this exact spirit:
      "Hey [name] — just thinking about you. How are you doing?"
      "Hey [name] — how's [generic referent, e.g., your week, your family] been?"
  - NO scripture. NO links. NO resource pointers. NO "praying for you" promise (the pastoral team is doing that work — you are NOT).
  - Tone: warm, low-key, friend-to-friend. Same calm register as Touch 5 but slightly warmer because of relational continuity.
  - 200 characters or fewer.
  - Sign-off: volunteer's first name only (e.g., "—Sarah").

Model on the Guest Follow-Up SMS but softer and more relational. Cite that as adjacent in voice_notes.`,
  buildUserMessage: (c) => {
    const volunteerFirst = c.assigned_volunteer?.full_name.split(' ')[0] ?? 'the volunteer';
    return `Touch 9 — Day-11 contextual reference SMS.

Person:
  - First name: ${c.person.preferred_name}

Sender (the volunteer who's been with them through Touches 1/5/7):
  - First name: ${volunteerFirst}

You know there is a precious-cargo record on file — they shared something personal a few days ago. The pastoral team has already been in touch about it separately. You are NOT acknowledging or referencing the specific content. Reference the relationship — "thinking about you", "how are you doing" — and leave it at that.

Produce the JSON. Only sms is populated. Sign-off uses "${volunteerFirst}" as the first name.`;
  },
  temperature: 0.4,
};
