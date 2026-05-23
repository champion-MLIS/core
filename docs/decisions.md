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

---

## ADR-004 — Prayer Request Response Architecture

**Date:** 2026-05-22
**Status:** Accepted — operating decision

### Context

The original `workflows/guest-follow-up/spec.md` had one edge-case rule for personal or sensitive prayer requests: *"Immediate pastoral override. No automation."* That preserved the right intent — AI must not perform pastoral work — but produced a real failure mode in practice: a guest who shares vulnerability and receives complete silence often experiences that silence as the church not caring. The 24+ hours between the moment of sharing and the moment a human reaches them is precisely when reassurance matters most.

The override-only rule treated "no automation" as identical to "no acknowledgment." Those are different things.

### Decision

When a guest submits a personal or sensitive prayer request, MLIS sends **one warm, calibrated acknowledgment** via the same channel the guest used to share (typically email or SMS). The acknowledgment is sent within minutes of capture. MLIS does not send any further communication on that channel until either (a) the PCPOC has completed their human follow-up, or (b) 48 hours have passed without PCPOC contact, at which point the system escalates to Becky and pauses further automation on that person until manually cleared.

The AI acknowledgment never quotes scripture, never sends resource links, never characterizes the request or the person, and never attempts pastoral work. Its only purpose is to communicate that the request was received and a real human is coming.

### What this supersedes

The earlier rule in `workflows/guest-follow-up/spec.md` that classified all personal/sensitive prayer requests as "Immediate pastoral override. No automation." The new rule preserves the override gate's intent — no pastoral work by AI — while adding a calibrated acknowledgment that protects the guest from feeling unheard during the window before a human reaches them.

The edge-case row in the workflow spec is updated to reference this ADR.

### Storage strategy

Prayer-request content lives in MLIS Supabase (`prayer_requests` table) with RLS-restricted access (Pastoral Care role only). Stephen has read access but does not receive alerts; Becky and LaCinda receive alerts and have read access; the PCPOC seat (configurable, defaults to Becky) has full access.

PCO receives a sync-summary as a person note (existence + date + one-line summary, not full content). Full content migrates to PCO as the canonical store once the Pastoral Care permission group is configured and tested in PCO — that migration is a future slice. Until then, Supabase is the operational store for pastoral content.

### PCPOC routing

The PCPOC (Pastoral Care Point of Contact) is a configurable assignment in MLIS. The `staff_profiles` table marks exactly one row as `is_default_pcpoc = true` (enforced by partial unique index). Defaults to Becky. The Prayer Response Agent reads this on every capture and assigns the new `prayer_requests` row accordingly.

`pcpoc_alert_recipient` is a separate flag — multiple staff can receive alerts (e.g., Becky and LaCinda), even though only one holds the default-PCPOC role. Stephen has `pastoral_care = true` (read access) but `pcpoc_alert_recipient = false` (no paging).

### Contextual reference touch (§3.5)

When a precious-cargo record exists for a guest, the system schedules an additional contextual reference touch on **Day 10–12** (concretely: `day_offset: 10, grace_hours: 48` — scheduled Day 11, grace window through Day 12). This touch is **inserted** into the journey, not a replacement for any standard touch.

- **Touch identity:** `touch_number = 9`, `is_contextual_reference = true`, `kind = 'sms'` (channel). No new enum value — `is_contextual_reference` is a boolean flag on `touches`. This sidesteps the permanence of Postgres enum additions.
- **Owner:** the assigned connections volunteer (same person as Touches 1, 5, 7 — continuity is a person, not a role).
- **Content constraint:** human warmth, not pastoral content. References by topic only ("How's [name]?" / "How are you doing?") — never quotes the original prayer back at the guest. The volunteer's first name appears in the sign-off; the church-generic signature does not.

**Suppression rules:** the touch does not insert (or is cancelled before fire) when —
- the PCPOC has explicitly marked the prayer_request as `resolved_no_action`, or
- an active `pastoral_flag` has been raised for the person since the prayer was captured.

### Why

A guest who shares vulnerability and receives complete silence often experiences that silence as the church not caring. A warm acknowledgment that explicitly promises a human follow-up bridges the gap between the moment of sharing and the moment of pastoral response, without letting AI do pastoral work.

Equally important: the inviolable rules (no scripture, no resource links, no characterization) are enforced by **two walls** — the prompt instructs them, and a deterministic regex scan (`scanForConstraintViolations`) catches model slips. A draft that fails the scan is held without sending; the PCPOC reviews from the dashboard.

### Schema additions

- `prayer_requests` table — captures content, channel, status, acknowledgment text + timestamp, PCPOC response, escalation timestamp.
- `staff_profiles` table — email-keyed pastoral role registry (`pastoral_care`, `pcpoc_alert_recipient`, `is_default_pcpoc`). User_id backfills via trigger on first sign-in.
- `people.precious_cargo_refs uuid[]` — convenience pointer; full content lives in `prayer_requests` behind RLS.
- `touches.is_contextual_reference boolean` — flag for the Day-11 touch.
- `touches.held_pending_data_at timestamptz` — presence-of-timestamp signals the held state (no enum lock-in).

### What this means for builders

- New prayer-request handling goes through `src/agent/prayer-response/`. The orchestrator (`processPrayerSignal`) captures, drafts, voice-checks, scans for constraint violations, sends, alerts the PCPOC, and inserts the contextual reference touch.
- Sending is abstracted behind a `Sender` interface. The dashboard provides the production Twilio + Resend implementation; tests use a stub.
- The CLI `npm run prayer:respond` runs the agent for ad-hoc processing and the escalation sweep, but cannot reach the wire (deps live in the dashboard); use `--dry-run` semantics for verification.
- Pastoral override remains supreme. The Pastoral Override Monitor can pause this agent the same way it pauses every other.

