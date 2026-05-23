# MLIS Backlog

Living list of remaining work across all phases. Updated as items land.
Categories are stable; items move in and out as state changes. Size hints:
**S** = a sitting (hours), **M** = a day or two, **L** = multi-day or
multi-week. Priority is a forward-looking judgement, not a ranking;
multiple items can be "high" because they unblock different paths.

Tasks owned by a specific human are tagged. Engineering work without an
owner tag defaults to Claude Code execution under Stephen's direction.

Last reviewed: 2026-05-22.

---

## CMS Integration (PCO)

### Step 3.1 — First-time giving signal via PCO Giving
**Size:** M · **Priority:** medium
**Description:** Wire PCO Giving API into the signal poller. Detect first-time donations as enrollment signals — fourth of the four guest signal types in the spec.
**Why it matters:** First-time giving is one of the documented guest signals. Currently silent — no journeys enroll via this path.
**Dependencies:** Subsplash → PCO giving sync going live (external, ETA week of 2026-05-21 per memory).
**Owner:** Engineering

### Step 3.2 — Child check-in signal via PCO Check-Ins
**Size:** M · **Priority:** medium
**Description:** Wire PCO Check-Ins API for child check-ins (new families) and for adult service_attendance (the return signal). Today both go through manual paths — child_checkin only via seed, service_attendance via the CLI `attendance:record` or the dashboard "Mark Attended" button.
**Why it matters:** Auto-detection is the long-term return signal. Until wired, return detection requires staff action every Sunday.
**Dependencies:** None. PCO Check-Ins API is available.
**Owner:** Engineering

### PCO Services integration — sermon plans for enrichment
**Size:** M · **Priority:** high
**Description:** Implement `PcoAdapter.getServicePlan()` against PCO Services API. Currently returns null, so the per-touch drafters that require sermon context degrade.
**Why it matters:** Without sermon data, T1/T3/T5 drafters can't reference specific Sunday content — `held_pending_data` fires more often than necessary, slowing Becky's queue.
**Dependencies:** None.
**Owner:** Engineering

### PCO Pastoral Care permission group configuration
**Size:** S · **Priority:** medium
**Description:** Configure the Pastoral Care permission group in PCO so prayer-request content can eventually migrate from Supabase to PCO. ADR-004 §3.2 documents the strategy.
**Why it matters:** Until configured, prayer-request content stays in Supabase as operational store. PCO is the system of record for identity; this aligns precious-cargo with that.
**Dependencies:** None.
**Owner:** Becky

### Precious-cargo migration: Supabase → PCO
**Size:** M · **Priority:** low
**Description:** Migrate `prayer_requests` content from Supabase to PCO once the Pastoral Care permission group is configured. Supabase becomes a reference/cache; PCO becomes canonical.
**Why it matters:** ADR-004 storage strategy. No urgency — current Supabase store works fine.
**Dependencies:** PCO Pastoral Care permission group configuration.
**Owner:** Engineering

### Inbound email/SMS webhook for prayer-request replies
**Size:** M · **Priority:** medium
**Description:** When a guest replies to Touch 3's prayer-elicitation email (per ADR-004 §3.4) with a prayer request, that reply needs to be captured as a new `engagement_signal` of kind `prayer_request`. Today the signal poller only reads PCO forms — inbound email replies and inbound SMS aren't ingested. Requires Resend inbound (or Mailgun/SES) for email, Twilio inbound webhook for SMS.
**Why it matters:** Without this, the elicitation line in T3 is one-way — guests can reply but the system doesn't notice. PCPOC won't get an alert.
**Dependencies:** Decision on inbound mail provider.
**Owner:** Engineering

---

## Dashboard Surfaces

### Phase E — Tracking metrics + analytics layer
**Size:** L · **Priority:** low
**Description:** Per-touch return rate analytics, conversion funnel guest → connected, days-to-return distribution by enrollment source, voice-check pass-rate trends. B.5 has basic completion + recovery metrics; this is the full analytics layer.
**Why it matters:** Becky and Stephen can't tune the workflow without knowing what works. The four metrics in master-instructions.md are the target.
**Dependencies:** 30–90 days of operational data (real journeys completing).
**Owner:** Engineering

### Dashboard `lib/agent/*` duplicate collapse
**Size:** S · **Priority:** low
**Description:** Dashboard has its own `lib/agent/{draft,prompts,voice-rules,claude}.ts` that duplicate `src/agent/`. Now that `allowImportingTsExtensions` + the `@core` Webpack/Turbopack alias work, these can collapse into shared imports.
**Why it matters:** Drift risk — voice rules diverging between CLI agent and dashboard agent.
**Dependencies:** None.
**Owner:** Engineering

### Volunteer pool management UI
**Size:** M · **Priority:** medium
**Description:** A dashboard surface (admin-only) for Becky to add/remove/activate volunteers in the connections + lay pools. Without this, populating the pool requires direct DB access.
**Why it matters:** Becky shouldn't need engineering help to onboard a new volunteer.
**Dependencies:** None.
**Owner:** Engineering

### Supabase Auth: enable leaked-password protection
**Size:** S · **Priority:** low
**Description:** Toggle the Supabase Auth setting to enable HaveIBeenPwned password checking. Currently disabled per advisor warning. Defense in depth.
**Why it matters:** Prevents staff from using known-compromised passwords. Free feature; one toggle.
**Dependencies:** None.
**Owner:** Stephen (Supabase dashboard)

---

## Agent Work

### Voice sample authoring — T2, T4, T5, T6, T7, T8, T9
**Size:** M · **Priority:** high
**Description:** Pastoral leadership writes canonical voice samples for the seven touches that currently use `voice_sample_status: 'approximated'`. Add to `templates/voice-samples.md`. The drafters automatically clear the approximated flag once a canonical sample exists.
**Why it matters:** Seven of nine drafters flag `approximated` today. Each Becky approval takes longer because reviewers can't trust the voice match.
**Dependencies:** None.
**Owner:** Stephen + pastoral leadership

### Agent 3 — Stage Transition Agent
**Size:** L · **Priority:** medium
**Description:** Monitors engagement signals and recommends stage transitions (Guest → Connected, etc.). Generates a transition recommendation with supporting data; requires human confirmation.
**Why it matters:** Today, stage transitions don't happen automatically. A guest who's now grouped stays on Guest stage until manual update — the dashboard's stage_health metrics decay.
**Dependencies:** 30+ days of operational data to validate transition triggers.
**Owner:** Engineering

### Agent 4 — Starting Point Coordinator
**Size:** L · **Priority:** low
**Description:** Drafts Starting Point invitations, tracks acceptance + scheduling + completion, prompts staff for intake notes, routes intake data to relevant agents (group placement, team assignment).
**Why it matters:** Starting Point is the bridge between Connected and Grouped. Intake informs group placement + team assignment.
**Dependencies:** Agent 3 — Stage Transition Agent (to know when to send).
**Owner:** Engineering

### Agent 5 — State of the Church Agent (weekly ELT report)
**Size:** L · **Priority:** low
**Description:** Weekly leadership intelligence report. Aggregates new guests, stage transitions, at-risk profiles, Starting Point completions. Surfaces pastoral attention flags without exposing restricted notes.
**Why it matters:** ELT visibility without manual rollup. Pastor View (B.6) is real-time; this is the weekly cadence.
**Dependencies:** Agent 3 — Stage Transition Agent.
**Owner:** Engineering

### Agent 6 — Pastoral Override Monitor (full standalone)
**Size:** M · **Priority:** medium
**Description:** Today, pastoral override is a flag-check at every gate (enrollment, drafting, sending). A full standalone monitor watches for new override triggers proactively — death, abuse, suicide ideation, crisis language detection in incoming communications.
**Why it matters:** Active detection vs. reactive checking. Catches crisis signals before they fall through a gate.
**Dependencies:** None — extends existing pastoral_flags infrastructure.
**Owner:** Engineering

### Stage 2 workflows — Connected / Grouped / Serving / Leader
**Size:** L (each) · **Priority:** low
**Description:** The 21-day guest-follow-up workflow is Stage 1. Each subsequent stage gets its own workflow with its own touches, agents, voice register. All four currently unbuilt.
**Why it matters:** Champion's lifecycle vision is end-to-end. Stage 1 alone is the proof; Stages 2–5 are the operating system.
**Dependencies:** Stage 1 stabilization (90+ days of data); Agents 3 + 4.
**Owner:** Engineering

---

## Pipeline / Architecture

### 9-stage pipeline expansion
**Size:** L · **Priority:** low
**Description:** Per ADR-001, the strategic direction is the 9-stage version (Aware → First-Time Guest → Returning Guest → Connected → Grouped → Serving → Member → Leader → Multiplier). Adds pre-visit Aware stage, first-time/returning split, Member/Leader split, Multiplier terminus.
**Why it matters:** Captures pre-visit signals (web, ads, invitations). Recognizes Leader is not the terminal stage. Foundational for sending-church framework.
**Dependencies:** Stage 1 + Stage 2 workflows stabilized first.
**Owner:** Engineering

---

## Infrastructure / Ops

### Supabase org transfer (ADR-002 follow-up)
**Size:** S · **Priority:** medium
**Description:** Create a Champion-owned Supabase account (church-controlled email + 1Password). Transfer the `champion-mlis` project from Stephen's personal org. Update ADR-002 status to "Migrated". Org transfers preserve project ID, URL, and keys — zero downtime.
**Why it matters:** Credential hygiene — no infrastructure depends on a personal account. Should happen before real guest data accumulates at scale.
**Dependencies:** None.
**Owner:** Stephen

### RLS policies on `followup_queue` / `pastoral_flags` / `poll_watermarks`
**Size:** S · **Priority:** low
**Description:** Three tables have RLS enabled but no policies, meaning only service_role can read them. That's intentional for backend-only tables but the Supabase advisor flags it. Either add explicit `service_role can read all` policies for clarity, or document the intent inline.
**Why it matters:** Defense in depth + clarity. INFO-level advisor warning today.
**Dependencies:** None.
**Owner:** Engineering

### First sign-in: Becky and LaCinda
**Size:** S · **Priority:** high
**Description:** Becky and LaCinda need to sign in to the dashboard with their `@championchurch.org` emails. The `auth.users` trigger backfills their `staff_profiles.user_id` on first sign-in, enabling the RLS path through `user_id = auth.uid()`.
**Why it matters:** Today only Stephen has tested the dashboard end-to-end as an authenticated user. Becky's PCPOC workflow can't actually be exercised by Becky until she signs in.
**Dependencies:** None.
**Owner:** Becky + LaCinda

### Becky's volunteer pool population
**Size:** S · **Priority:** high
**Description:** Becky designates which Champion volunteers are in the connections + lay pools. Until populated, touches 1/5/7/9 + Touch 4 lack assigned volunteers and surface via role-based routing only.
**Why it matters:** Continuity is a person, not a role. Without populated pools, the volunteer-continuity guarantee (same person across T1/5/7/9) is inactive — guests experience role-based routing instead.
**Dependencies:** Either the Volunteer pool management UI (above), or direct DB insert via engineering.
**Owner:** Becky

### Cleanup: Maria Test seed data
**Size:** S · **Priority:** medium
**Description:** Remove the test guest `test-maria-001`, her emails, signals, journey, touches, and any prayer_requests once the dashboard demo wraps. Reply `cleanup` to the demo conversation.
**Why it matters:** Test data in a production database. Easy to confuse with a real "Maria" if Champion gets one.
**Dependencies:** Stephen finishes the dashboard demo.
**Owner:** Engineering (Claude Code on request)
