# Workflow: Guest Follow-Up
**Status:** Operational · 21-day sequence with prayer-response architecture

---

## Purpose

Every first-time guest receives a personal, named follow-up sequence over 21 days. Not a single message — a coordinated, voice-checked, human-approved touch every few days, calibrated to where they are in their first-month arc. The four humans they hear from (Connections Volunteer, Pastor Stephen, Becky Cota, lay caller) say warm, specific, Champion-voiced things, with the system handling timing, drafting, voice review, and continuity.

If the workflow ships and consistently sounds like Champion, four jobs are proven:
- **SENSE** — return signals correctly cancel recovery touches
- **SPEAK** — per-touch drafting clears Champion's voice bar without staff babysitting every message
- **SUGGEST** — precious-cargo records surface to the PCPOC fast enough to matter
- **SEE** — Becky and Pastor Stephen can read the state of every guest in one screen

---

## Trigger

A new person record appears in the CMS (today: Planning Center) with one or more of these engagement signals:
- Connect card submitted
- First-time giving recorded
- Child check-in with no existing profile
- Written prayer request received

The signal poller (`npm run intake:signals`) writes an `engagement_signals` row and enqueues a journey for any person currently at the `guest` stage. Pastoral override re-checks at both poll time and enrollment time — an active `pastoral_flags` row blocks the journey from starting.

---

## The 21-Day Touch Sequence

Eight standard touches plus an inserted contextual reference touch when a precious-cargo record exists.

| # | Day | Channel | Owner | Recovery? | Purpose |
|---|-----|---------|-------|-----------|---------|
| 1 | 0 (Sun) | SMS | Connections volunteer | no | "We noticed you, no reply needed." Sunday same-day. |
| 2 | 1 (Mon) | Handwritten card | Pastor Stephen | no | Mailed Monday AM. Warm pastoral note. |
| 3 | 2 (Tue) | Email | Becky (Connections Pastor) | no | One ask, one link. Includes prayer-elicitation line (ADR-004 §3.4). |
| 4 | 3 (Wed–Thu) | Phone call | Lay volunteer | no | NOT a sent message. Drafter produces a one-page guest brief. |
| 5 | 6 (Sat) | SMS | **Same** connections volunteer | no | Saturday reminder. Calm. No exclamation marks, no emoji. |
| 9 | 10 (Wed) | SMS | **Same** connections volunteer | no | Inserted only when precious cargo exists. ADR-004 §3.5. |
| 6 | 9 (Sat) | Handwritten card | LaCinda (or matched leader) | yes | Recovery. <35 words. No mention of missed second Sunday. |
| 7 | 13 (Sat) | Event invite (email) | **Same** connections volunteer | yes | Recovery. Event-specific, not "come back to church." |
| 8 | 20 (Sat) | Email | Becky | yes | Recovery. Final warm touch. Door open for ongoing contact. |

Recovery touches (6, 7, 8) only fire if the guest has not returned. The contextual reference touch (9) is inserted between Touch 5 and Touch 6 — concretely `day_offset: 10, grace_hours: 48`.

**Continuity is a person, not a role.** Touches 1, 5, 7, and 9 all route to the same `connections_volunteer_id`. Touch 4 routes to the same `lay_volunteer_id`. The volunteer pool lives in the `volunteers` table; load-balanced selection at enrollment (lowest current_load wins, oldest-first tiebreak).

Day offsets are calendar days from enrollment day (Day 1 = +0 offset). Hours-of-day in the guidance are advisory to the human owner, not enforced by the scheduler.

---

## Workflow Steps

### Step 1 — Guest Intake Agent: Detect & Build Profile

**Module:** `src/intake/`
**CLI:** `npm run intake:poll`, `npm run intake:signals`

**Actions:**
1. Poll CMS for new people and engagement signals since the last watermark.
2. Mirror new people + households + emails + phones into MLIS.
3. Classify each signal (connect_card / first_giving / child_checkin / prayer_request).
4. Pastoral-override re-check on every signal — an active `pastoral_flags` row routes to the override monitor, not the agent.
5. For guest-stage people, enqueue a `followup_queue` row OR, for the new Phase A enrollment path, kick off a `guest_journeys` row directly.

**Output:** Mirrored profile + classified engagement signals.

---

### Step 2 — Journey Enrollment

**Module:** `src/journey/enroll.ts`

**Actions on `enrollGuest()`:**
1. Verify person exists in the mirror.
2. Re-check pastoral_flags (defense in depth).
3. Check for an existing active journey — refuse to double-enroll.
4. **Pick volunteers** from the connections + lay pools (load-balanced; NULL when pool empty — role-based routing kicks in until pools populate).
5. Create the `guest_journeys` row with `assigned_connections_volunteer_id` + `assigned_lay_volunteer_id`.
6. Increment volunteer `current_load` counters.
7. Schedule all 8 standard touches, setting `owner_user_id` to the volunteer's user_id when they've signed in (or NULL — worklist falls back to role).

**Output:** A `guest_journeys` row with 8 child `touches` rows.

---

### Step 3 — Touch Enrichment

**Module:** `src/journey/enrich-touch.ts`

Runs *just before* a touch is presented for drafting (not at enrollment — context can change between).

Populates `touches.payload.context` with:
- `person` — preferred name, family composition
- `first_visit` — date
- `sermon` — title, series, theme (from CMS service plan; null today, wired for when Phase C-PCO-Services lands)
- `connect_card` — verbatim free text from the original signal
- `kids` — children in household + recent check-in environments
- `prior_touches` — completed touches earlier in the journey
- `precious_cargo_refs` — id + date + status only (full content gated by RLS)
- `assigned_volunteer` — name, email, role (for sign-off rendering)

Idempotent — re-running refreshes context, preserves label/guidance/draft fields.

---

### Step 4 — Per-Touch Drafting (Phase C)

**Module:** `src/agent/touch-drafting/`

Eight per-touch drafters plus the contextual reference drafter. Each declares:
- **Voice sample cited** — names which sample in `templates/voice-samples.md` the draft models on.
- **`voice_sample_status`** — `'canonical'` if a direct sample exists (T1, T3), `'approximated'` otherwise (T2, T4, T5, T6, T7, T8, T9). The dashboard surfaces a badge so reviewers know.
- **Attentiveness fields** — required context for that touch. Missing data → held, no LLM call, no generic content.
- **Prompt rules** — per-touch instructions (character limits, no-emoji, sermon-specific reference, etc.).

The shared runner (`runner.ts`) enforces the attentiveness standard first, then calls Claude for the draft, then runs the standard voice check (Haiku) against the result.

**Hold-pending-data discipline:** if any required attentiveness field is missing, the touch transitions to `held_pending_data_at = <timestamp>` with a reason string. The dashboard surfaces these to Becky's queue. She can either supply context manually or accept the hold.

**Voice sample coverage gap:** the canonical `voice-samples.md` currently includes Guest Follow-Up SMS (T1) and Guest Follow-Up Email (T3). The other seven drafters cite an adjacent sample and self-flag `approximated`. When pastoral leadership writes new canonical samples for T2/T4/T5/T6/T7/T8/T9, the flag auto-clears on subsequent drafts.

---

### Step 5 — Human Review & Send (Dashboard)

**Module:** `apps/dashboard/`

The Touch Detail page (B.3) shows three sections:

**Context** — the enriched payload. Precious-cargo references show count + dates to all roles; full content visible only to `pastoral_care` role per RLS.

**Draft** — the AI-generated draft, the voice sample cited, the voice check verdict, the `approximated` badge if applicable, and inline editing.

**Action panel** — Mark Sent, Customize and Send, Mark Mailed (for cards), View Brief (for Touch 4), Hold, Pastoral Override, Mark Attended.

For touches that send a message (SMS/email), the dashboard wires Twilio/Resend per Phase D. Sending logs to `communications` and stamps the touch with `completed_at` + sent metadata. If all touches on the journey reach a terminal state, the journey itself transitions to `completed`.

---

### Step 6 — Return Detection

**Module:** `src/journey/return-detection.ts`
**CLI:** `npm run attendance:record -- --person=<id> --date=<YYYY-MM-DD>`
**Dashboard:** "Mark Attended" button on Touch Detail.

A `service_attendance` engagement signal AFTER the journey's `enrolled_at` marks the guest as returned. The journey transitions `active → returned`, recovery touches (6, 7, 8) that are still pending get cancelled (status `na`), and volunteer load counters decrement.

PCO Check-Ins integration (Step 3.2) will produce these signals automatically once wired. Until then, staff record attendance via the CLI or the dashboard button — both write the same signal.

---

## Prayer-Response Architecture (ADR-004)

When an engagement signal of kind `prayer_request` is classified `personal_or_sensitive`, the **Prayer Response Agent** (`src/agent/prayer-response/`) runs in parallel to the regular touch sequence:

1. **Capture** — write a `prayer_requests` row (RLS-restricted to pastoral_care role); append the id to `people.precious_cargo_refs`.
2. **Calibrated acknowledgment** — Claude drafts a narrow ack with explicit forbidden moves:
   - NEVER quote scripture
   - NEVER send resource links
   - NEVER characterize the request or the person
   - NEVER claim "we're praying for you" (the PCPOC does the actual pastoral work)
3. **Constraint scan** — deterministic regex pass for URLs, scripture references (chapter:verse + book names), "praying for you" promises, common platitudes. Failure holds the draft without sending.
4. **Voice check** — Haiku reviews tone the same way as standard drafts.
5. **Send** — via the same channel the guest used (Twilio for SMS; Resend for email).
6. **Stamp** — `acknowledged_at`, `acknowledgment_text`, status `in_followup`, `assigned_to = <PCPOC email>`.
7. **PCPOC alert** — routed to the staff_profile with `is_default_pcpoc = true` (Becky by default).
8. **Contextual reference touch** — insert `touch_number=9, is_contextual_reference=true` on the active journey. Day 11, grace through Day 12. Owner: assigned connections volunteer.
9. **48h escalation** — `npm run prayer:respond -- --escalation` (or future scheduled job) scans for `in_followup` rows acknowledged > 48h ago with no `pcpoc_responded_at`. Marks `escalated_at`, raises a `pastoral_flag` reason='prayer' so the Pastoral Override Monitor pauses further automation.

Suppression rules for the contextual reference touch: skip if pastoral_flag active OR prayer_request is `resolved_no_action`.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Person has no email or phone | Held; flagged for manual staff outreach. No automation on the affected channel. |
| Person has existing profile (returning guest) | Do not create a duplicate journey. Re-engagement workflow takes over once defined. |
| Prayer request is personal/sensitive | Calibrated acknowledgment sent within minutes; precious-cargo captured; real-time PCPOC alert; 24-hour human follow-up expected; 48-hour escalation to Becky. See ADR-004. |
| Connect card but no name | Touch 1 holds with `held_pending_data_at` (preferred_name missing). Staff supply manually or accept the hold. |
| Family with children — no kids' ministry context | Touches 1, 3, 4 fire normally; the kids reference is suppressed gracefully when `household_children` is empty. |
| Volunteer pool empty | `assigned_*_volunteer_id` is NULL. Touches still surface by role until pools populate. No second migration needed. |
| Pastoral flag raised mid-journey | Override monitor pauses agent processing. Contextual reference touch suppresses. Pending touches remain — staff decide whether to fire them manually. |

---

## Success Metrics

- % of first-time guests receiving Touch 1 within the same Sunday's grace window (target: 100%)
- % of journeys where Touches 1–3 all clear voice check on first attempt (target: 85%)
- Time from prayer-request capture to calibrated acknowledgment send (target: <5 minutes)
- % of prayer requests where PCPOC responds within 24h (target: 80% — escalation fires beyond 48h)
- Guest → Connected conversion (baseline TBD after first 90 days)
- % of journeys ending in `returned` (versus completing the recovery sequence; baseline TBD)

---

## Dependencies

- CMS adapter (today: PCO) reachable for people/forms; for sermon context, service plans (Phase C wiring pending — `getServicePlan()` returns null today and drafters gracefully degrade).
- Volunteer pool populated by Becky (until populated, role-based routing applies).
- `templates/voice-samples.md` loaded; canonical samples for T2/T4–T9 still to be authored by pastoral leadership.
- Pastoral override monitor active (live in Phase A — `pastoral_flags` table + override re-check at every gate).
- Twilio + Resend configured in dashboard env for actual send.

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Phase A foundations + return detection + volunteer continuity + touch enrichment + the new attendance signal source | Operational (2026-05-22) |
| **B** | Dashboard: B.1 (auth), B.2 (worklist), B.3 (touch detail + action panel), B.4 (journey timeline), B.5 (Becky's dashboard), B.6 (Pastor View) | Operational; B.3 deltas (Mark Attended / Hold / Pastoral Override / role-aware precious cargo) shipping in milestone 3 |
| **C** | Per-touch drafting with attentiveness standard + voice sample citation + hold-pending-data | Operational (2026-05-22) |
| **D** | Real SMS + email sending (Twilio + Resend) | Operational |
| **E** | Conversion metrics + analytics layer | Future |

---

## What This Proves

If this workflow ships at this fidelity and consistently sounds like Champion, the four jobs (SENSE/SPEAK/SUGGEST/SEE) are validated at the guest stage. Every subsequent lifecycle stage (Connected, Grouped, Serving, Leader) re-uses the same machinery: enrichment, per-touch drafting, voice check, hold-pending-data, attentiveness gates, PCPOC routing for sensitive content, dashboard review-and-send. Nothing new architecturally — just new workflows on the same surface.
