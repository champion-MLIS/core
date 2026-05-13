# MLIS System Architecture

---

## Overview

The MLIS is a coordinated set of AI agents working off a unified person profile. It is not a monolithic application — it is a pipeline of specialized agents, each with a narrow role, connected by a shared data model and governed by a universal override rule.

```
External Data Sources
        │
        ▼
┌───────────────────┐
│   Data Layer      │  PCO (primary) + Subsplash (transition)
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Person Profile   │  Unified record — the source of truth for all agents
│  (MLIS Core DB)   │
└───────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                    Agent Layer                         │
│                                                       │
│  [Guest Intake] → [Guest Follow-Up] → Approval Gate   │
│       │                                               │
│  [Stage Transition] → Confirmation Gate               │
│       │                                               │
│  [Starting Point Coordinator] → Approval Gate         │
│       │                                               │
│  [State of the Church] → ELT Report                   │
│                                                       │
│  [Pastoral Override Monitor] ══► PAUSE ALL            │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────┐
│  Staff Interface  │  Approval queue, alerts, pastoral dashboard
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Communication    │  Email / SMS / Future: in-app
│  Delivery Layer   │
└───────────────────┘
```

---

## Data Layer

**Primary system of record:** Planning Center Online (PCO)

**Integration method:** PCO REST API + webhooks (where available)

**Polling strategy:** Every 15 minutes during and after services. Daily sync at 2am for full reconciliation.

**Dual-source period:** During migration from Subsplash to PCO, the system maintains a mapping table:
- `pco_id` → canonical identifier
- `subsplash_id` → legacy reference, deprecated on full migration

**New records:** Always written to PCO first.

---

## Person Profile

The unified person profile is the spine of the entire system. See `/schema/person-profile.md` for the full data model.

Key principle: **One profile per person, enriched over time.** Every agent reads from and writes to this same record. No agent has its own silo.

---

## Agent Layer

See `/agents/AGENTS.md` for full agent specifications.

**Agent communication:** Agents do not call each other directly. They write to the person profile and set flags. The orchestration layer reads flags and triggers the next agent. This keeps agents decoupled and independently testable.

**Orchestration:** Event-driven. PCO data changes → profile update → flag set → agent triggered.

---

## Approval Gate Architecture

Every communication passes through a human approval gate before sending. The gate is:

1. **Draft generated** by agent
2. **Package sent** to designated staff member (email or dashboard notification)
3. **Staff action:** Approve / Edit+Approve / Hold / Flag
4. **Outcome logged** to person profile regardless of action taken
5. **Timeout escalation** if no response within configured window

The approval gate is not optional. It cannot be disabled at the agent level. It is enforced at the delivery layer.

---

## Pastoral Override Architecture

The Pastoral Override Monitor runs as a system-wide process alongside all other agents. It:

- Reads incoming data for override signals before any agent processes it
- Monitors agent outputs for sensitive content
- Can pause any agent's output at any point in the pipeline
- Writes override flags to the person profile
- Cannot be overridden by any other agent

Override flags are cleared only by authorized staff. The system maintains a full audit log of all override events.

---

## Communication Delivery Layer

**Phase 1 (initial build):**
- Email via [provider TBD — Sendgrid / Mailgun / Google Workspace]
- SMS via [provider TBD — Twilio / SimpleTexting]

**Phase 2 (future):**
- In-app push notification via Subsplash or future Champion app
- Direct integration with PCO Communications

**Delivery rules:**
- Never send before 8am or after 8pm local time
- Maximum 1 automated communication per person per 7-day window (pastoral override can exceed this)
- All sends logged to person profile with full content and approval chain

---

## Tech Stack (Initial Build)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js or Python | TBD based on Claude Code build |
| Database | Supabase (PostgreSQL) | Hosted, scalable, PCO-compatible |
| Agent orchestration | Anthropic Claude API | claude-sonnet-4-6 for drafting, claude-haiku-4-5 for classification |
| PCO integration | PCO REST API v2 | OAuth2 credentials in 1Password |
| Email delivery | TBD | Sendgrid preferred |
| SMS delivery | TBD | Twilio preferred |
| Approval interface | TBD | Email-based v1, dashboard v2 |
| Hosting | TBD | Vercel / Railway / Fly.io |

---

## Security & Credentials

All credentials are stored in 1Password under the **Champion Church — Systems** vault. No credential is ever committed to this repository. Environment variables only.

See README.md for current credential inventory.

**`.env` structure (never committed):**
```
PCO_APP_ID=
PCO_SECRET=
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_KEY=
EMAIL_PROVIDER_KEY=
SMS_PROVIDER_KEY=
```

---

## Transferability

Every architectural decision is made with Church Reimagined transferability in mind:

- No Champion-specific hardcoding in the agent logic
- Church name, voice spec, stage names, and override rules are all **configuration**, not code
- A new church onboards by providing their own config file — the engine runs unchanged
- This is the commercial moat: the encoded pastoral decision-making framework, not the software itself
