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

## Agent 2 — Guest Follow-Up Agent

**Role:** Drafts the first personal communication to every new guest within 24 hours.

**Triggers:**
- Guest profile flagged by Guest Intake Agent

**What it does:**
- Drafts a personalized, named follow-up email/SMS in Champion's voice
- Includes: personal name, service date, relevant ministry links, soft invitation to return
- Presents draft to designated staff member for approval
- Sends only after human approval
- Logs communication to person profile

**What it never does:**
- Send without staff approval
- Use generic or template-sounding language
- Reference sin, obligation, or pressure language
- Claim to be a person

**Approval gate:** Every draft requires one-touch approval from designated staff before sending.

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
- Crisis language detected in any incoming communication
- Conflict flag raised by staff
- Any agent attempts to communicate with a flagged profile

**What it does:**
- Immediately pauses all automated activity for the flagged person
- Alerts the Senior Pastor or designated pastoral staff
- Logs the flag with timestamp
- Holds all pending communications until override is manually cleared by staff

**This agent has veto power over every other agent in the system.**

---

## Agent Interaction Map

```
PCO Data
    │
    ▼
[Guest Intake Agent]
    │
    ▼
[Guest Follow-Up Agent] ──── → Staff Approval Gate → Send
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
2. 🔄 **Guest Intake Agent** — first build
3. 🔄 **Guest Follow-Up Agent** — first build (paired with Intake)
4. ⬜ Stage Transition Agent
5. ⬜ Starting Point Coordinator
6. ⬜ State of the Church Agent
7. ⬜ Pastoral Override Monitor (wired in from day one as a stub, fully built after core agents ship)
