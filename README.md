# Champion MLIS — Core

**Member Lifecycle Intelligence System**
A Champion Church initiative · Built by Champion, for Champion, transferable to the Church Reimagined network.

> **Strategic frame:** See [`docs/master-instructions.md`](docs/master-instructions.md) for the Master System Instructions — the authoritative vision that governs every agent, workflow, and decision in this repo.

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

## The Four Jobs

Every agent, workflow, and piece of code in this system serves one of four jobs:

- **SENSE** — capture every meaningful signal about every person: first visit, response card, group sign-up, serving milestone, missed Sundays, life event, baptism, giving pattern shift, kid registered, anniversary.
- **SPEAK** — communicate to people on behalf of Champion Church, by name, in Champion's voice, at the right moment, through the right channel. Never spammy, never invasive, never robotic-feeling.
- **SEE** — give leadership a living dashboard of where every person actually is. Not a CRM. A discernment tool.
- **SUGGEST** — recommend the next pastoral, ministry, or discipleship move; flag anyone who is drifting, stuck, or going dark.

---

## Three Operating Surfaces

MLIS operates across three Claude surfaces. Every contributor must know which one they are in.

- **Claude Chat** — where leadership thinks. Strategy, pastoral judgment, weekly review of the state of the church, decision support.
- **Claude Cowork** — where Champion staff run recurring human-in-the-loop workflows. Drafting follow-up batches, working the approval inbox, pulling the weekly "who needs a touch" report.
- **Claude Code** — where the actual integrations, agents, watchers, and automations get built. Production code, tested, documented, version-controlled.

---

## Executive Leadership Team

The system operates under the direct authority of:

- **Senior Pastor Stephen Bloomfield**
- LaCinda Bloomfield
- Becky Cota
- Jessica McCormic
- Shane McCormic

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
.
├── README.md                       # This file — overview and operating frame
├── docs/
│   ├── master-instructions.md      # Master System Instructions (strategic spine)
│   ├── architecture.md             # System architecture and agent map
│   ├── decisions.md                # Architecture decision log
│   └── pco-integration.md          # Planning Center conventions and quirks
├── schema/
│   └── person-profile.md           # Unified person profile data model
├── agents/
│   └── AGENTS.md                   # Agent roles, responsibilities, override rules
├── workflows/
│   └── guest-follow-up/
│       └── spec.md                 # First workflow — Guest → Connected
├── templates/
│   └── voice-samples.md            # Approved Champion voice communication samples
├── src/                            # Backend / CLI code (CMS sync, agents, journey logic)
│   ├── config/                     # Env loading and validation
│   ├── pco/                        # Planning Center API client (people, forms, ...)
│   ├── cms/                        # CMS adapter interface (transferability)
│   ├── db/                         # Supabase client + generated types
│   ├── intake/                     # Guest Intake Agent + signal poller
│   ├── journey/                    # 21-day touch sequence + enrollment + return detection
│   ├── agent/                      # Guest Follow-Up Agent (Claude drafting + voice check)
│   └── cli/                        # Operator-facing CLI tools
├── apps/
│   └── dashboard/                  # Next.js 15 in-house dashboard (Phase B)
└── tests/                          # Vitest tests + fixtures
```

---

## Quickstart

**Prerequisites:** Node.js 22+ (`nvm use` will pick the right version via `.nvmrc`).

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and paste real values from 1Password / Supabase / Anthropic
cp .env.example .env

# 3. Probe PCO: list the 20 most recently created people (Step 1)
npm run pco:recent

# 4. Run the Guest Intake Agent once — mirror PCO people into Supabase (Step 2)
npm run intake:poll

# 5. Discover PCO forms and how the auto-classifier maps them (Step 3)
npm run pco:forms

# 6. Run the signal poller — record engagement_signals and enqueue followups
npm run intake:signals

# 7. Draft follow-ups for pending queue items (Step 4 — Claude)
npm run agent:draft

# 7a. Test the agent on a specific person without writing to the queue:
npm run agent:draft -- --person=<PCO_ID> --dry-run

# 7b. Inspect a guest's 21-day journey + 8-touch schedule
npm run touches:status -- --person=<PCO_ID>

# 8. Run the in-house dashboard locally (Next.js, Phase B.1)
cd apps/dashboard
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY + SUPABASE_SERVICE_ROLE
npm install
npm run dev
# → open http://localhost:3000, sign in with your @championchurch.org email

# 8. Run tests (no network, no Claude calls — fully stubbed)
npm test

# 9. Typecheck and lint
npm run typecheck
npm run lint
```

### Where each credential comes from

| Variable | Where to find it |
|---|---|
| `PCO_APP_ID` / `PCO_SECRET` | 1Password → "Champion Church — Systems" → Planning Center |
| `SUPABASE_URL` | Already filled in `.env.example` (it's not a secret). Project `champion-mlis`. |
| `SUPABASE_SERVICE_ROLE` | Supabase Dashboard → champion-mlis → Project Settings → API Keys → `service_role` (the **secret** one, not the publishable key) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) — generate a Workspace key under the Champion Church workspace. Required for `agent:draft`. |

> ⚠️ The `service_role` key bypasses Row-Level Security. Treat it like a master password — never paste it into a frontend, never commit it, never share it outside Champion Church staff.

---

## Tech Stack (Confirmed)

| Layer | Choice | Status |
|---|---|---|
| Runtime | Node.js 20+ (TypeScript, strict) | ✅ |
| HTTP | Native `fetch` + Zod validation | ✅ |
| PCO auth | App ID + Secret (HTTP Basic) | ✅ |
| Tests | Vitest with recorded fixtures | ✅ |
| Database | Supabase (Postgres, RLS-locked, service_role from backend only) | ✅ |
| Agent runtime | Anthropic Claude (Sonnet 4.6 drafting + Haiku 4.5 voice check) | ✅ |
| Email delivery | TBD (Sendgrid preferred) | ⬜ |
| SMS delivery | TBD (Twilio preferred) | ⬜ |
| Hosting | TBD (Supabase Edge Functions / Fly.io) | ⬜ |

---

## Build Sequence

1. ✅ **Architecture captured** — this repo
2. 🔄 **Guest Follow-Up workflow** — first build, end to end
   - ✅ **Step 1:** PCO read probe — credentials proven, response shape validated (`npm run pco:recent`)
   - ✅ **Step 2:** Guest Intake Agent — Supabase persistence + watermark-driven incremental sync (`npm run intake:poll`)
   - ✅ **Step 3:** Signal poller — connect cards & prayer requests via PCO Forms → `engagement_signals` + `followup_queue` (`npm run intake:signals`)
   - ✅ **Step 4:** Guest Follow-Up Agent — Claude draft + voice check, writes to `followup_queue.payload` (`npm run agent:draft`)

3. 🔄 **21-Day Touch Sequence** — Stage 1 depth ([ADR-003](docs/decisions.md))
   - ✅ **Phase A:** Schedule + state machine — 8 touches per guest, enrollment on signal, return detection (`npm run touches:status -- --person=PCO_ID`)
   - ✅ **Phase A.2:** CMS adapter refactor — intake behind `src/cms/adapter.ts` interface for transferability
   - 🔄 **Phase B:** In-house dashboard — Next.js + Supabase Auth + RLS
     - ✅ **B.1:** Scaffold + magic-link auth (championchurch.org domain restricted) + protected home with system counts
     - ⬜ **B.2:** My Touches Today (worklist screen)
     - ⬜ **B.3:** Touch Detail (context, draft, action panel)
     - ⬜ **B.4:** Guest Journey timeline
     - ⬜ **B.5:** Becky's Dashboard (active journeys + metrics)
     - ⬜ **B.6:** Pastor View (state of the church)
   - ⬜ **Phase C:** Touch-specific drafting — per-touch prompt rules, sermon context (formerly Step 4.1), family/kids personalization
   - ⬜ **Phase D:** Send + escalation — Twilio (SMS) + SendGrid (email), missed-touch grace period → Becky's queue
   - ⬜ **Phase E:** Tracking metrics — touch completion rate, recovery usage, return rate by touch, days-to-return

4. **Cross-cutting**
   - ⬜ **Step 3.1:** First-time giving signal via PCO Giving (Subsplash → PCO sync going live week of 2026-05-21)
   - ⬜ **Step 3.2:** Child check-in signal via PCO Check-Ins
3. ⬜ **Weekly State of the Church** — after guest follow-up ships
4. ⬜ Additional workflows — one at a time, never in parallel

---

## Credentials

All credentials are Champion Church organizational assets stored in 1Password under the **Champion Church — Systems** vault.

| Credential | Status |
|------------|--------|
| Planning Center API (App ID + Secret) | ✅ Acquired |
| Supabase project (`champion-mlis`, us-west-1) | ✅ Provisioned — see [ADR-002](docs/decisions.md) |
| Supabase `service_role` key | 🔄 Pending — grab from dashboard, paste to `.env` |
| Subsplash API key | 🔄 Pending |
| Google Workspace service account | 🔄 Pending |
| SMS provider tokens | 🔄 Pending |
| Anthropic API key (Workspace) | 🔄 Pending — required for `agent:draft` |

**Credential hygiene rule:** No credential is ever a personal asset. Every key, token, and secret belongs to Champion Church and is stored in the church-owned vault.

---

## This Is Church Reimagined

The MLIS is Champion's live proof-of-concept for a transferable church operating system — designed to help independent, non-denominational churches scale through encoded pastoral decision-making frameworks. Every architectural decision made here is made with transferability in mind.

---

*Champion Church · Yuma, Arizona · Built for the Kingdom*
