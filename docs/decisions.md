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
