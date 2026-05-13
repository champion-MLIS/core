# Champion MLIS — Core

**Member Lifecycle Intelligence System**
A Champion Church initiative · Built by Champion, for Champion, transferable to the Church Reimagined network.

---

## What This Is

The MLIS is the operational nervous system for how Champion Church moves people through the lifecycle of belonging:

```
Guest → Connected → Grouped → Serving → Leader
```

This is not a CRM. It is not a database. It is a coordinated set of AI agents working off a unified person profile, triggering the right communication and the right leadership awareness at the right moment — in Champion's voice, with pastoral override built in at every decision point.

---

## The Operating Principle

> *The gospel never changes. The methods must.*

Every agent in this system exists to free pastors for pastoral work — not to replace pastoral work. AI proposes. Humans approve. People are never reduced to a record.

---

## Lifecycle Stages

| Stage | Definition |
|-------|------------|
| **Guest** | New person. May attend 1–3 times before any formal connection. |
| **Connected** | Info gathered. Assimilation begun. Personal touch initiated. Starting Point offered. |
| **Grouped** | In a Champion group. Developing friendships, spiritual growth, and belonging. |
| **Serving** | On a team. Learning how church life works. Starting Point completed or in progress. |
| **Leader** | Invited into leadership. Helping others serve well. Stewarding the Champion vision. |

### Stage Transition Signals

- **Guest → Connected:** Connect card submitted, giving recorded, child check-in completed, or written prayer request received.
- **Connected → Grouped:** Group assignment made (informed by Starting Point if completed, or by general availability).
- **Grouped → Serving:** Person signs up to serve via app, welcome center, or team leader referral.
- **Serving → Leader:** Current leader identifies potential and issues a leadership invitation. This transition is always human-initiated.

---

## Starting Point

> *"We'd love to invite you to Starting Point — a relaxed conversation where we can hear your story, answer questions, and help you find your place at Champion Church."*

Starting Point is Champion's named intake process. It is:
- **Offered**, never required
- **Relaxed**, never formal
- **Progressive** — the same named process at every stage, deepening in context
- **The spine** of the person profile — every Starting Point conversation enriches the unified record

Starting Point data informs: group placement, team assignment, leadership development, and pastoral awareness.

---

## Champion's Voice

Every communication this system produces must sound like Champion Church — not like software.

**Champion's voice is:**
- Upbeat and faith-filled
- Expectant and welcoming
- Grace-based and non-judgmental
- A guilt-free zone

**Champion's voice never:**
- Says "You must" or uses obligation language
- Uses condemnation or sin-focused language
- Pressures, guilts, or overwhelms
- Sounds like a form letter

**The AI never presents itself as a person.** It always communicates on behalf of Champion Church.

---

## Pastoral Override Rule

> AI proposes. Humans approve. Any situation requiring a decision requires a pastoral gate.

**Automatic override triggers:**
- Death or bereavement
- Crisis or mental health concern
- Prayer request (personal or sensitive)
- Conflict or relational tension
- Any communication flagged as sensitive

When an override is triggered, the system pauses, alerts the appropriate staff member, and waits for human direction. Nothing sends. No decisions are made.

---

## System of Record

**Primary:** Planning Center Online (PCO)
**Transition note:** The team is actively migrating to PCO as the single source of truth. During transition, dual-source awareness (PCO + Subsplash) is maintained. All new records are PCO-first.

---

## Repository Structure

```
champion-mlis-core/
├── README.md               # This file — vision, architecture, operating rules
├── docs/
│   ├── architecture.md     # System architecture and agent map
│   ├── voice-spec.md       # Champion voice guidelines and examples
│   └── decisions.md        # Architecture decision log
├── schema/
│   ├── person-profile.md   # Unified person profile data model
│   └── stage-definitions.md # Stage criteria and transition logic
├── agents/
│   └── AGENTS.md           # Agent roles, responsibilities, override rules
├── workflows/
│   └── guest-follow-up/    # First workflow — Guest → Connected
└── templates/
    └── voice-samples.md    # Approved Champion voice communication samples
```

---

## Build Sequence

1. ✅ **Architecture captured** — this repo
2. 🔄 **Guest Follow-Up workflow** — first build, end to end
3. ⬜ **Weekly State of the Church** — after guest follow-up ships
4. ⬜ Additional workflows — one at a time, never in parallel

---

## Credentials

All credentials are Champion Church organizational assets stored in 1Password under the **Champion Church — Systems** vault.

| Credential | Status |
|------------|--------|
| Planning Center API (App ID + Secret) | ✅ Acquired |
| Subsplash API key | 🔄 Pending |
| Google Workspace service account | 🔄 Pending |
| SMS provider tokens | 🔄 Pending |
| Anthropic production API key | 🔄 Pending |
| Database credentials | 🔄 Pending |

**Credential hygiene rule:** No credential is ever a personal asset. Every key, token, and secret belongs to Champion Church and is stored in the church-owned vault.

---

## This Is Church Reimagined

The MLIS is Champion's live proof-of-concept for a transferable church operating system — designed to help independent, non-denominational churches scale through encoded pastoral decision-making frameworks. Every architectural decision made here is made with transferability in mind.

---

*Champion Church · Yuma, Arizona · Built for the Kingdom*
