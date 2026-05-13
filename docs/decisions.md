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
