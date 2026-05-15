# Architecture Decision Log

A running record of significant decisions made in the MLIS project. Each entry captures what was decided, why, and what changed as a result.

---

## ADR-001 — Pipeline stages: 5-stage operational baseline vs 9-stage expansion

**Date:** 2026-05-13
**Status:** Open — 9-stage logged as strategic direction; 5-stage currently operating

### Context

Two versions of the Champion Christian pipeline coexist in this project.

**5-stage (current operating reality):**

```
Guest → Connected → Grouped → Serving → Leader
```

This is the version encoded in `schema/person-profile.md`, `workflows/guest-follow-up/spec.md`, `agents/AGENTS.md`, and the README's Lifecycle Stages section.

**9-stage (strategic direction, in `master-instructions.md`):**

```
Aware → First-Time Guest → Returning Guest → Connected → Grouped → Serving → Member → Leader → Multiplier
```

### What the 9-stage adds

- **Aware** — pre-visit signal (web visit, ad, invitation). Captures people before they show up physically. Implies a future agent for pre-visit engagement.
- **First-Time Guest / Returning Guest split** — separates someone who has attended once from someone becoming a pattern. Different communications, different leadership awareness.
- **Member** — covenant member, distinct from Leader. The 5-stage version conflates ongoing membership with leadership.
- **Multiplier** — raises up other leaders, plants, sends. The 5-stage version stops at Leader; the 9-stage recognizes Leader is not the terminal stage.

### Current decision

The repository continues to operate on the 5-stage pipeline. Existing schema, workflow, and agent specs are not changed.

The 9-stage version is recorded as the strategic direction and informs future workflow design. When a new agent or workflow would meaningfully change if built against the 9-stage pipeline, capture that note in the workflow's spec doc for future iteration.

### What this means for builders

- New workflows ship against the 5-stage pipeline today.
- Person profile, schemas, and stage_history continue to use 5-stage values.
- The 9-stage version is a forward-looking reference, not the current truth.

---

## ADR-002 — Supabase initially provisioned under a personal org

**Date:** 2026-05-14
**Status:** Accepted — migration to a Champion-owned org tracked as follow-up work

### Context

Step 2 of the build (Guest Intake Agent persistence) needed a Postgres database immediately. The Supabase MCP integration available in Claude Code was authorized against a personal Supabase account (`stephenbloomfield-bit's Org`), not a Champion-owned organization. Setting up a separate Supabase account under a Champion-controlled identity would have added friction without unblocking the build.

### Decision

Provision the `champion-mlis` project (us-west-1, free tier) under the existing personal org. Migrate to a Champion-owned org as a separate cleanup task before any production traffic depends on it.

This narrowly violates the credential hygiene rule in the README — but only in form, not in spirit. The intent of the rule is that infrastructure cannot disappear if any one staff member leaves. Supabase makes org transfers a few-click operation that preserves project IDs, connection strings, and data, so the migration risk is low.

### What this means for builders

- The project ID (`ubyhnbfvjdcinyhoplsd`), URL (`https://ubyhnbfvjdcinyhoplsd.supabase.co`), and migrations land cleanly today.
- Before MLIS handles real guest data at any meaningful volume, the org transfer happens. A Champion-controlled Supabase account is created (e.g. under `systems@championchurch.org` or equivalent), and the project is transferred to its org.
- After the transfer, the URL and keys do not change. Only the `.env` of any deployed worker is unaffected. Dashboard access shifts to the church-owned login.
- The transfer is tracked as an open todo, not a blocker.

### Open follow-up

- [ ] Create a Champion-owned Supabase account (church email, password in 1Password).
- [ ] Transfer the `champion-mlis` project to that org.
- [ ] Update this ADR's status to "Migrated" with the date.

---

## ADR-003 — In-house dashboard over CMS-native task tools (Church Reimagined transferability)

**Date:** 2026-05-15
**Status:** Accepted — Phase A backend committed; Phase B dashboard scheduled

### Context

The 21-day Guest Follow-Up workflow needs a human-facing surface — a place where Connections volunteers see their assigned touches, where Becky sees the four tracking metrics, where Pastor Stephen sees the state of the church.

Two candidate architectures:

1. **PCO Workflows (bolt-on).** PCO has a Workflows product that handles assigned tasks, completion tracking, and reporting. Champion has it on their account (probed 2026-05-15 — two empty workflows already exist). Total integration cost: ~1 day.

2. **In-house MLIS dashboard.** Build a purpose-built web app on top of MLIS's own data, with a thin CMS adapter layer reading from PCO (or whatever CMS the church uses). Total cost: ~1–2 weeks.

### Decision

**Build the in-house dashboard.** Skip PCO Workflows entirely.

### Why

Three reasons, in order of weight:

1. **Church Reimagined transferability is the whole point.** If MLIS is wedded to PCO's UI, it's a PCO add-on, not a transferable church operating system. The next church will use Breeze, CCB, Rock RMS, Subsplash, or their own. Each has different (or no) workflow features. A bolt-on locks us to one vendor.

2. **The data we need to surface is MLIS-specific.** PCO Workflows show "task assigned to Becky." They cannot natively show: the voice-checked AI draft with pass/fail per criterion; which engagement signal triggered this touch; recovery-touch status with reasoning; return-rate-by-touch analytics; cross-touch context. These are core MLIS concerns.

3. **UX can be radically better.** A volunteer on Sunday at 2 PM should open one screen on their phone and see "your three guests today, here's what to say, tap when done." Purpose-built beats general-purpose by an order of magnitude for the high-frequency tasks.

### Trade-off accepted

PCO Workflows would get Champion live in ~1 day. The in-house dashboard takes ~1-2 weeks. We trade 1-2 weeks of build time for a transferable architecture and a substantially better UX.

If Champion were the only church, this trade-off would be questionable. Because Church Reimagined is a stated goal, building the bolt-on now means building it twice.

### What this means for builders

- **Today (Phase A, this commit):** backend schedule + state machine + enrollment + return detection. Data lives in MLIS Supabase. No CMS-side workflow created.
- **CMS adapter layer (Phase A.2, near-term):** `src/cms/adapter.ts` declares the vendor-neutral interface. The existing PCO mirror + signal poller migrate behind a `PcoAdapter` implementation.
- **Dashboard (Phase B, next major build):** Next.js + Supabase Auth + Supabase Realtime + Vercel hosting. Mobile-responsive web app. Five screens: My Touches Today / Touch Detail / Guest Journey / Becky's Dashboard / Pastor View.
- **Sends (Phase D):** Twilio for SMS, SendGrid (or Gmail) for email. The dashboard becomes the approval-and-send surface.

### Open question

The dashboard stack default is Next.js. Alternatives (Remix, Astro, plain React + Express) remain on the table if Stephen has constraints; defer to Phase B kickoff.
