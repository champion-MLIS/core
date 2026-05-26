# MLIS — System Summary

**Champion Church · Member Lifecycle Intelligence System**
*A shared briefing for leadership, assimilation staff, and Claude Chat. Reflects the build as of late May 2026.*

---

## What MLIS is, in one paragraph

MLIS is Champion Church's system for accompanying every person on their journey of faith — from first encounter to multiplying leader — so that no guest ever falls through the cracks, and so that staff are freed from administrative follow-up to do the high-touch pastoral work only they can do. It is not a CRM and not a database. It is a coordinated set of AI agents working off one unified person profile, triggering the right communication and the right leadership awareness at the right moment, in Champion's voice, with a pastoral override built into every decision. The governing rule: **AI proposes, humans approve, people are never reduced to a record.**

---

## The four jobs

Everything the system does serves one of four jobs:

- **SENSE** — capture every meaningful signal about a person (first visit, connect card, prayer request, giving, kid checked in, missed Sundays).
- **SPEAK** — communicate on behalf of Champion, by name, in Champion's voice, at the right moment, through the right channel.
- **SEE** — give leadership a living picture of where every person actually is. A discernment tool, not a spreadsheet.
- **SUGGEST** — recommend the next pastoral or discipleship move; flag anyone drifting, stuck, or going dark.

---

## What the system actually does today (the guest journey, concretely)

1. **A guest takes an action** in Planning Center — fills out the "New Here" connect card, gives for the first time, or checks in a child.
2. **MLIS notices** (it polls PCO), mirrors that person into its own database, and **enrolls them in a 21-day journey** of 8 scheduled touches (plus a conditional 9th — see below).
3. **Each touch is owned by a specific person** and scheduled for a specific day. Some touches the AI drafts; some are inherently human (a handwritten card, a phone call).
4. **A Connections volunteer or staff member opens the dashboard**, sees the touches due, and for SMS/email touches clicks "Draft this message." Claude writes it in Champion's voice and checks its own tone against the voice spec.
5. **The human reads it, edits if needed, and sends** — one click, straight through Twilio (text) or Resend (email). Replies route to Becky's inbox.
6. **If the guest comes back** for a second visit, the system detects it and automatically cancels the "recovery" touches (they're only for people who haven't returned).
7. **Becky and Pastor Stephen** see the whole picture on their dashboards — who's in flight, who needs attention, what's overdue.

The point: every first-time guest gets a personal, named, on-brand follow-up within 24 hours, every time, without staff scrambling.

---

## The 21-day touch sequence

Eight standard touches, designed so the same Connections volunteer carries the relationship throughout (continuity is a person, not a role):

| # | Day | What | Who |
|---|-----|------|-----|
| 1 | Day 1 (Sun) | SMS — "we noticed you, no reply needed" | Connections volunteer |
| 2 | Day 2 | Handwritten card | **Pastor Stephen** |
| 3 | Day 3 | Email — one ask, one link | **Becky** (Connections Pastor) |
| 4 | Day 4–5 | Phone call — listening, not selling | Lay volunteer |
| 5 | Day 7 (Sat) | SMS reminder — calm, references Sunday | Same volunteer as #1 |
| 6 | Day 10 | Second handwritten card *(recovery)* | LaCinda or matched leader |
| 7 | Day 14 | Event invite *(recovery)* | Same volunteer as #1 |
| 8 | Day 21 | Final warm touch *(recovery)* | Becky |

**Recovery touches (6, 7, 8)** only fire if the guest hasn't returned by Day 10. The moment a return is detected, they're cancelled.

**A conditional 9th touch** (Day 11) is inserted only when a guest has shared a prayer request — a warm, human "how are you doing?" check-in from their volunteer. It never quotes the prayer back; it just signals care.

---

## How prayer requests are handled (the most pastorally sensitive part)

This is governed by [ADR-004](decisions.md) and is worth staff understanding clearly:

- When a guest shares a personal or sensitive prayer request, MLIS sends **one warm acknowledgment within minutes** — on the same channel they used. It says, in effect, "we received this, a real person is coming." It **never** quotes scripture, sends resource links, characterizes the request, or attempts pastoral work. Two walls enforce this: the AI is instructed not to, AND a deterministic scan catches any slip and holds the message for human review.
- The request is then **routed to the PCPOC** (Pastoral Care Point of Contact — defaults to Becky) for real human follow-up.
- **If no human follow-up happens within 48 hours, it escalates** and pauses automation for that person until cleared.
- Prayer content is stored with strict access control — only pastoral-care staff can read it. Stephen has read access but isn't paged; Becky and LaCinda are alerted.

The principle behind this: silence after vulnerability feels like the church not caring. A warm acknowledgment bridges the gap until a human arrives — without AI ever doing the pastor's job.

---

## The dashboard (what staff actually use)

A private web app, sign-in restricted to `@championchurch.org` emails. Five screens:

- **Dashboard (home)** — Becky's command center: active journeys, completion metrics, recovery usage, anything overdue.
- **My Touches Today** — the worklist. Each person's touches due, with one-click actions.
- **Touch Detail** — the guest's full context, the AI draft, and the send/approve panel.
- **Guest Journey** — the complete 21-day timeline for one person.
- **Pastor View** — Stephen's curated view: pastoral flags, the handwritten cards he owes, this week's signals, state-of-the-church.

---

## The pastoral override (the non-negotiable safety floor)

Nothing automated proceeds for a person with an active pastoral flag — not enrollment, not drafting, not sending. Triggers include death, crisis, mental-health concern, conflict, or anything flagged sensitive. When raised, the system stops and waits for a human. This is checked at every gate, every time.

---

## Technical shape (for Claude Chat / technical readers)

- **System of record:** Planning Center Online (PCO). Online giving currently flows through Subsplash, synced into PCO.
- **Backend:** TypeScript (Node 20+). A CMS-adapter layer abstracts PCO so the system is transferable to churches on Breeze, CCB, etc. — this is the Church Reimagined moat.
- **Database:** Supabase (Postgres), row-level-security locked, backend-only access via service role.
- **AI:** Anthropic Claude — Sonnet for drafting, Haiku for the voice check. Voice rules are read live from `templates/voice-samples.md` so pastoral leadership can tune the voice without a code change.
- **Sending:** Twilio (SMS), Resend (email).
- **Dashboard:** Next.js 15, hosted locally today, deployable to Vercel.
- **Repo:** `github.com/champion-MLIS/core`. Architecture decisions live in `docs/decisions.md` (ADR-001 through 004); remaining work in `docs/BACKLOG.md`.

---

## What's live vs. what's still ahead

**Live and working:**
- PCO intake, signal detection (connect cards + prayer requests), 21-day enrollment
- Volunteer continuity assignment
- AI drafting in Champion's voice with self voice-check, per-touch
- Real SMS + email sending
- Prayer-response acknowledgment + PCPOC routing + escalation
- The full five-screen dashboard

**Ahead (in rough priority):**
- **Voice samples** for 7 of the 9 touches — pastoral leadership writes the canonical examples (today they're AI-approximated). *Owner: Stephen + pastoral leadership.*
- **Becky + LaCinda first sign-in** + volunteer pool population, so the continuity routing goes live. *Owner: Becky + LaCinda.*
- **First-time giving + child check-in** as auto-triggers (waiting on Subsplash→PCO giving sync and PCO Check-Ins).
- **Sermon context** in drafts (PCO Services integration).
- **Analytics layer** (return-rate-by-touch, conversion funnel) — needs 30–90 days of real data.
- **Stages 2–5** (Connected → Grouped → Serving → Leader) — Stage 1 (guest follow-up) is the proof; the rest is the operating system.

---

## Who's involved

Operating under the authority of Senior Pastor **Stephen Bloomfield** and the Executive Leadership Team: **LaCinda Bloomfield, Becky Cota, Jessica McCormic, Shane McCormic**.

In the day-to-day assimilation workflow:
- **Becky Cota** — Connections Pastor. Owns the email touches (#3, #8), is the default Pastoral Care Point of Contact for prayer requests, and lives in the dashboard.
- **Pastor Stephen** — handwritten card on Day 2; oversight via Pastor View.
- **LaCinda** — second card on Day 10; prayer-request alerts.
- **Connections volunteers** — the continuity relationship: touches 1, 5, 7, and the Day-11 check-in.
- **Lay volunteers** — the Day 4–5 phone call.

---

*This is Champion Church's live proof-of-concept for a transferable church operating system — built by Champion, for Champion, designed from day one to be handed to other churches. The gospel never changes. The methods must.*
