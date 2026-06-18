# MLIS Agent Roster

Every agent in this system operates under the same three laws:
1. **AI proposes. Humans approve.** No decision is made without a pastoral gate.
2. **Champion's voice is non-negotiable.** If it doesn't sound like Champion, it doesn't send.
3. **People are never reduced to a record.** Every profile represents a person with a story.

---

## Agent 1 — Guest Intake Agent

**Role:** Monitors for new guest signals and builds the initial person profile.

**Triggers:**
- Connect card submitted (PCO)
- First-time giving recorded (PCO)
- Child check-in with no existing record (PCO)
- Written prayer request received

**What it does:**
- Creates or updates the person profile from PCO data
- Enriches with service context (sermon title, date, service time, kids' church activity)
- Flags for Guest Follow-Up Agent
- Checks for pastoral override flags before proceeding

**What it never does:**
- Send any communication directly
- Make decisions about the person
- Access Starting Point intake data

---

## Agent 2 — Guest Follow-Up Agent (per-touch drafting)

**Role:** Drafts each of the eight standard touches in Champion's voice over the 21-day guest follow-up sequence, plus the contextual reference touch when precious cargo exists.

**Triggers:**
- A pending touch row reaches its scheduled_for time (or a staff member opens it in the dashboard).

**What it does:**
- Runs the enrichment step first (`src/journey/enrich-touch.ts`) to populate the touch payload with person, sermon, kids, connect-card content, prior touches, precious-cargo references, and assigned-volunteer context.
- Dispatches to the per-touch drafter under `src/agent/touch-drafting/`:
  - T1 Sunday SMS, T2 Monday card body, T3 Tuesday email (Becky — includes prayer-elicitation line per ADR-004 §3.4), T4 lay-volunteer call brief (NOT a sent message), T5 Saturday reminder SMS (same volunteer as T1; no exclamation marks, no emoji), T6 Day-10 recovery card (LaCinda or matched leader), T7 Day-14 event invite, T8 Day-21 final warm touch, T9 contextual reference SMS.
- Enforces the attentiveness standard: if the per-touch required fields are missing, the touch is **held**, not drafted with generic content. The dashboard surfaces held touches to Becky's queue.
- Cites which voice sample the draft models on (`voice_sample_cited`). When a touch has no canonical sample in `voice-samples.md`, flags `voice_sample_status: 'approximated'` so reviewers know to read with extra care.
- Runs the standard voice check (Haiku) against every produced draft; failures hold.

**What it never does:**
- Send without human approval (Touches 1–8 + T9). The dashboard owns the send action.
- Use a generic template when attentiveness fields are missing — held > generic.
- Treat the channel enum as touch identity. Channel is channel; the touch row's `touch_number` + `is_contextual_reference` flag carry identity.
- Reference data it wasn't given (no inventing sermon titles, kids' names, attendance counts).

**Approval gate:** Every draft surfaces in the dashboard for review before send. Touch 4 produces an internal brief — the lay volunteer reads it before dialing; "Mark Call Complete" closes the touch from the dashboard.

---

## Agent 3 — Stage Transition Agent

**Role:** Monitors engagement signals and recommends stage transitions.

**Triggers:**
- Connect card submitted → recommend Guest → Connected
- Group assignment made → recommend Connected → Grouped
- Serving signup received → recommend Grouped → Serving
- Leadership invitation issued (human-only) → recommend Serving → Leader

**What it does:**
- Monitors PCO for transition signals
- Generates a transition recommendation with supporting data
- Alerts the appropriate staff member
- Waits for human confirmation before updating the stage
- Triggers the appropriate follow-up communication draft upon confirmation

**What it never does:**
- Automatically advance a person's stage without human confirmation
- Initiate a Serving → Leader transition (this is always human-initiated)

---

## Agent 4 — Starting Point Coordinator

**Role:** Manages the Starting Point invitation and intake workflow.

**Triggers:**
- Person reaches Connected stage (confirmed by staff)
- Person joins a serving team without a completed Starting Point

**What it does:**
- Drafts a Starting Point invitation in Champion's voice
- Presents draft for staff approval
- Tracks acceptance, scheduling, and completion
- Prompts staff to enter intake notes after the conversation
- Routes intake data to relevant agents (group placement, team assignment)

**What it never does:**
- Send invitations without approval
- Conduct Starting Point itself — this is always a human conversation
- Share intake notes with any automated communication

**Voice note:** The Starting Point invitation must always feel like a genuine personal invitation, never a scheduled process. See voice-samples.md.

---

## Agent 5 — State of the Church Agent

**Role:** Produces the weekly leadership intelligence report for the Executive Leadership Team.

**Triggers:**
- Weekly scheduled run (day/time TBD by ELT)

**What it does:**
- Aggregates lifecycle data across all active profiles
- Identifies: new guests this week, stage transitions this week, at-risk profiles (no engagement in 30+ days), Starting Point completions, serving additions, leadership movements
- Surfaces pastoral attention flags (without exposing restricted notes)
- Produces a clean, readable "State of the Church" summary for ELT review

**What it never does:**
- Expose pastoral_flags content to non-authorized viewers
- Make recommendations about individuals without a pastoral review gate
- Replace the pastoral judgment of the ELT

---

## Agent 6 — Pastoral Override Monitor (system-wide)

**Role:** Watches all agent activity for override triggers. Senior agent — can pause any other agent.

**Triggers:**
- Prayer request flagged as personal or sensitive
- Death or bereavement signal detected
- Conflict flag raised by staff
- Any agent attempts to communicate with a flagged profile

**What it does:**
- Immediately pauses all automated activity for the flagged person
- Alerts the Senior Pastor or designated pastoral staff
- Logs the flag with timestamp
- Holds all pending communications until override is manually cleared by staff

**This agent has veto power over every other agent in the system.**

---

## Agent 7 — Prayer Response Agent

**Role:** Handles personal or sensitive prayer requests per ADR-004. Captures the request, sends a calibrated acknowledgment (not pastoral work), routes the alert to the Pastoral Care Point of Contact, schedules the 48h escalation check, and inserts the Day-11 contextual reference touch.

**Triggers:**
- An engagement signal of kind `prayer_request` that is classified `personal_or_sensitive`.

**What it does:**
1. Re-checks pastoral override — if active, yields immediately.
2. Captures content into `prayer_requests` (RLS-restricted to pastoral_care role). Appends the row id to `people.precious_cargo_refs`.
3. Drafts a calibrated acknowledgment with explicit forbidden moves (see "What it never does" below).
4. Runs a deterministic constraint scan (`scanForConstraintViolations`) — regex pass for URLs, scripture references, "praying for you" promises, common platitudes. Failure holds without sending.
5. Runs the standard voice check.
6. Sends via the channel the guest used (email or SMS, via the dashboard's Twilio/Resend wiring).
7. Stamps `acknowledged_at`, `acknowledgment_text`, status `in_followup`, `assigned_to = <PCPOC email>` on the row.
8. Routes a real-time alert to the PCPOC (default: the staff_profile with `is_default_pcpoc = true` — Becky).
9. Inserts the Day-11 contextual reference touch onto the active journey (touch_number=9, is_contextual_reference=true, owner = assigned connections volunteer).
10. Logs to `communications`. Returns telemetry for the dashboard.

The 48h escalation pass is a separate periodic job (`runEscalationCheck`). When a row is `in_followup`, acknowledged > 48h, and `pcpoc_responded_at` is null, it raises a pastoral_flag reason='prayer' so the Pastoral Override Monitor pauses further automation until manually cleared.

**What it never does:**
- Quote scripture (not a verse, not a paraphrase, not an allusion).
- Send a resource link of any kind.
- Characterize the request, the person, or the implied need.
- Claim to be "praying for you" — the PCPOC does the actual pastoral work.
- Send any further automated communication on the person's record until the PCPOC clears it.

**Pastoral override interaction:** the Pastoral Override Monitor takes precedence. If a flag is raised for the person while this agent is mid-flight, the agent yields. After acknowledgment, escalation auto-raises a flag if PCPOC silence exceeds 48 hours.

**Voice sample status:** the calibrated acknowledgment is a deliberately new shape (not pastoral, just receipt-of-message warmth). No canonical sample exists. The drafter relies on the inviolable rules above and the constraint scan to keep the output narrow.

---

## Agent Interaction Map

```
PCO Data
    │
    ▼
[Guest Intake Agent]
    │
    ├──► prayer_request signal ──► [Prayer Response Agent] ──► calibrated ack
    │                                                       └─► PCPOC alert + 48h escalation
    │                                                       └─► Day-11 contextual reference touch
    │
    ▼
[Guest Follow-Up Agent — per-touch drafters T1..T9] ──── → Staff Approval Gate → Send
    │
    ▼
[Stage Transition Agent] ──── → Staff Confirmation Gate → Stage Update
    │
    ├──► [Starting Point Coordinator] ──── → Staff Approval Gate → Invite
    │
    └──► [State of the Church Agent] ──── → ELT Weekly Report

[Pastoral Override Monitor] ══════════════════════════════► PAUSE ALL
```

---

## Build Order

1. ✅ Agent roster defined
2. ✅ **Guest Intake Agent** — operational
3. ✅ **Guest Follow-Up Agent** — operational, per-touch drafting structure (T1–T9) with attentiveness standard
4. ⬜ Stage Transition Agent
5. ⬜ Starting Point Coordinator
6. ⬜ State of the Church Agent
7. ✅ **Prayer Response Agent** — operational per ADR-004 (calibrated acknowledgment + PCPOC routing + 48h escalation + contextual reference touch)
8. 🔄 Pastoral Override Monitor — Phase A live (pastoral_flags + override re-checks at every gate); full standalone monitor still to come
