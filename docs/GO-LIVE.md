# MLIS — Going Live: Build → Implement Runbook

*How MLIS goes from "the code works" to "it's running Champion's guest follow-up," without colliding with other systems or burning trust. Written for Stephen; shareable with staff.*

---

## Why this stage feels confusing

Building and implementing are different kinds of work, and the gap between them is mostly **not technical**:

- **Building** is done when the code works in isolation. MLIS is essentially there.
- **Implementing** is done when real people, real data, and real staff are running it as their actual process — and trust it enough to stop doing the old thing.

The gap is made of four things, none of them code: **trust** (does Becky believe the drafts?), **coordination** (who owns what?), **a controlled ramp** (prove it small before it's big), and **a clean cutover** (the old way actually stops). This runbook is those four things in order.

---

## Phase 0 — Prove it on yourselves (no real guests)

**Goal:** confirm the machine works end-to-end before a single guest touches it.

1. Seed a journey for yourself (or a staff member) — put yourself in PCO, run the intake + enrollment, so you have a real journey in the dashboard.
2. Walk all the touches: draft each SMS/email touch, read the voice, regenerate until it lands.
3. Send the real messages to your own phone and inbox. Confirm: deliverability (not spam), the Reply-To lands in Becky's inbox, the sender looks right, the timing makes sense.
4. Trigger a prayer request on your test guest; confirm the acknowledgment fires and the PCPOC alert reaches Becky.
5. Mark the test guest "returned"; confirm recovery touches cancel.

**Exit criteria:** every path works on a test human. Voice feels like Champion. Nothing surprised you.

---

## Phase 1 — De-conflict with the visitor workflow ⚠️ (do this BEFORE Phase 2)

**This is the most important phase and the one most likely to be skipped.** A staff member is building a visitor workflow without knowing about MLIS. If both go live untouched, guests get double-contacted.

**Step 1 — Get in a room with that staff member.** Map both systems side by side. Answer:

| Question | Why it matters |
|---|---|
| What **triggers** their workflow? | If it's the same connect card MLIS uses, you have a shared trigger and a guaranteed collision. |
| What does it actually **do**? (tasks? emails? texts? welcome-desk logistics? gift bags?) | Tells you where the overlap is. |
| What **channels** does it touch the guest on? | Two systems texting the same guest = the clash. |
| Who does it **notify** on staff? | Duplicate task assignments cause confusion. |

**Step 2 — Decide ownership using one rule: one guest, one follow-up system.**

The cleanest division, and my recommendation:

- **MLIS owns the digital follow-up sequence** — the texts, emails, the 21-day journey, the drafting, the tracking. One voice, one cadence, no double-touch.
- **The visitor workflow owns what MLIS can't do** — the *in-person, same-day, physical* things: the welcome desk, name tags, the gift/coffee, the Sunday-morning hospitality handoff, walking a guest to kids' check-in. That's real work MLIS doesn't touch, and it's where a human workflow shines.

If the staff member's workflow is *also* digital follow-up (texts/emails), then it's doing the same job as MLIS — and one of them has to yield. It should be the manual one, because MLIS is more consistent, on-voice, and tracked. Their effort isn't wasted; it gets repurposed to the in-person side, which matters enormously and which MLIS will never do.

**Step 3 — Write down the division** in one shared sentence both of you agree to, e.g.:
> *"MLIS handles every digital touch to a guest after Sunday. The visitor team handles everything that happens in the building on Sunday. Neither texts or emails a guest the other is also contacting."*

**Exit criteria:** the staff member knows MLIS exists, both systems have a written, non-overlapping lane, and nobody is building a parallel digital-follow-up path.

---

## Phase 2 — Soft launch (real guests, tight leash)

**Goal:** run MLIS on real guests with a human reviewing everything, alongside the existing process, for 2–4 weeks.

- MLIS enrolls real guests automatically.
- **Every touch is human-reviewed before it sends** — that's already how the dashboard works (the volunteer clicks Send; nothing auto-fires). Keep it that way for the soft-launch window.
- Becky watches the dashboard daily. She's the quality gate.
- Start with a **subset** if you want extra safety — e.g., only guests from one service, or only the first 5 guests each Sunday.
- Keep doing whatever in-person process you already do. The point is to see if MLIS's follow-up holds up under real conditions before it's the only thing.

**Watch for:** drafts that miss the voice, wrong timing, bounced sends, guests confused by getting both an MLIS touch and a manual one (that's a Phase 1 failure showing up — fix the division if so).

**Exit criteria:** a few weeks of real guests where the drafts are consistently good, sends land, and no guest got double-contacted.

---

## Phase 3 — Cutover

**Goal:** MLIS becomes *the* guest follow-up system, not a parallel experiment.

- The old/manual digital-follow-up process **stops**. (The in-person visitor workflow continues — that's the agreed lane.)
- Becky's morning routine officially includes the dashboard.
- The volunteer pool is populated (so continuity routing is live — see the BACKLOG; this needs Becky + LaCinda signed in).
- Voice samples for all touches are written by pastoral leadership (so drafts stop flagging "approximated").

**Exit criteria:** every new guest goes through MLIS, one system, and the staff trust it enough that the old way is genuinely retired.

---

## Phase 4 — Steady state

- **Weekly review** (15 min): Becky + Stephen look at the dashboard metrics — who returned, which touches correlate with return, anything overdue.
- **Voice tuning** as needed — edit `templates/voice-samples.md`, no code change required.
- **Iterate** on the touch sequence based on what the data shows.
- Only after this is stable do you build Stage 2 (Connected → Grouped follow-up). One workflow at a time, never in parallel.

---

## The data model question (PCO vs. Subsplash) — already aligned

You're moving database content from Subsplash to PCO, keeping Subsplash for front-facing content (app, giving UI). **MLIS is already built for exactly this**: PCO is its system of record. As content lands in PCO, MLIS sees it automatically. No conflict, no rework. Subsplash staying front-facing is fine — MLIS doesn't read Subsplash directly; it reads PCO, which Subsplash syncs into. The only watch-item is making sure the connect-card / visitor data actually arrives in PCO (it does today via the "New Here" form).

---

## The one-line version

**Prove it on staff → carve a clean lane with the visitor-workflow person → run it supervised on real guests → retire the old way → review weekly.** The technical part is done; the discipline is in the order.
