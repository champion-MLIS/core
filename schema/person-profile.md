# Person Profile — Unified Data Model

Every agent in the MLIS works from this unified person profile. This is the single source of truth for who someone is, where they are in the lifecycle, and what the system knows about them.

---

## Core Identity

```json
{
  "person_id": "string (PCO ID — primary key)",
  "first_name": "string",
  "last_name": "string",
  "preferred_name": "string (used in all communications)",
  "email": "string",
  "phone": "string",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zip": "string"
  },
  "household_id": "string (PCO household link)",
  "household_members": ["person_id array"],
  "children": [
    {
      "name": "string",
      "age": "number",
      "grade": "string"
    }
  ]
}
```

---

## Lifecycle Stage

```json
{
  "current_stage": "guest | connected | grouped | serving | leader",
  "stage_entered_date": "ISO date",
  "stage_history": [
    {
      "stage": "string",
      "entered": "ISO date",
      "exited": "ISO date | null",
      "transition_trigger": "string (what caused the move)"
    }
  ],
  "stage_health": "active | at_risk | inactive",
  "last_seen_date": "ISO date",
  "attendance_count": "number"
}
```

---

## Engagement Signals

```json
{
  "first_visit_date": "ISO date",
  "connect_card_submitted": "boolean",
  "connect_card_date": "ISO date | null",
  "giving_on_record": "boolean",
  "child_checkin_on_record": "boolean",
  "prayer_request_submitted": "boolean",
  "prayer_request_date": "ISO date | null"
}
```

---

## Starting Point

```json
{
  "starting_point": {
    "offered": "boolean",
    "offered_date": "ISO date | null",
    "accepted": "boolean",
    "completed": "boolean",
    "completed_date": "ISO date | null",
    "intake": {
      "background": "string (free text, staff-entered)",
      "experience": "string",
      "needs": "string",
      "reason_at_champion": "string",
      "hoped_outcome": "string",
      "spiritual_stage": "string (self-described)",
      "interests": ["string array"],
      "notes": "string (pastoral notes — override-gated)"
    }
  }
}
```

---

## Group & Serving

```json
{
  "groups": [
    {
      "group_id": "string (PCO group ID)",
      "group_name": "string",
      "group_type": "table-talk | CR | recovery | other",
      "joined_date": "ISO date",
      "attendance_health": "active | at_risk | inactive"
    }
  ],
  "serving": [
    {
      "team_id": "string",
      "team_name": "string",
      "role": "string",
      "joined_date": "ISO date",
      "starting_point_completed_with_team": "boolean",
      "leader_name": "string"
    }
  ]
}
```

---

## Leadership

```json
{
  "leadership": {
    "is_leader": "boolean",
    "leadership_role": "string",
    "promoted_by": "person_id",
    "promotion_date": "ISO date",
    "leading": ["group_id or team_id array"]
  }
}
```

---

## Communication History

```json
{
  "communications": [
    {
      "date": "ISO date",
      "type": "email | sms | personal-contact",
      "template_used": "string",
      "sent_by": "system | staff_name",
      "approved_by": "string | null",
      "content_summary": "string",
      "response": "none | replied | clicked | unsubscribed"
    }
  ]
}
```

---

## Pastoral Flags

```json
{
  "pastoral_flags": {
    "override_active": "boolean",
    "override_date": "ISO date | null",
    "assigned_to": "staff_name | null",
    "notes": "string (restricted — pastoral eyes only)",
    "resolved": "boolean"
  }
}
```

---

## Precious Cargo (Prayer Requests — ADR-004)

When a guest submits a personal or sensitive prayer request, MLIS captures the full content into the `prayer_requests` table — separate from the person record itself for RLS scoping. The person record holds only **references** (id + date), never content.

```json
{
  "precious_cargo_refs": ["prayer_request_id_uuid array — convenience pointer; full data lives in prayer_requests"]
}
```

The authoritative `prayer_requests` row:

```json
{
  "id": "uuid",
  "person_pco_id": "string (FK)",
  "captured_at": "ISO timestamp",
  "source_signal_id": "uuid | null (FK to engagement_signals)",
  "content": "string (the actual request — pastoral-only access via RLS)",
  "channel": "email | sms | connect_card | other",
  "status": "open | in_followup | resolved_no_action | completed | sunset_historical",
  "assigned_to": "string (PCPOC email; defaults to the staff_profile with is_default_pcpoc=true)",
  "acknowledged_at": "ISO timestamp | null",
  "acknowledgment_text": "string | null (what the Prayer Response Agent sent)",
  "pcpoc_responded_at": "ISO timestamp | null (set by PCPOC when they reach the person)",
  "pcpoc_response_notes": "string | null (pastoral-only)",
  "escalated_at": "ISO timestamp | null (set by the 48h escalation pass)"
}
```

**RLS:** Pastoral Care role only (Becky, LaCinda, designated PCPOC, Stephen — see `staff_profiles`). Service-role bypass for system writes (the Prayer Response Agent inserts via service_role).

**Reference-only surfacing:** the dashboard and other agents see `precious_cargo_refs` count + dates only — never content. Content access requires the pastoral_care role (RLS-enforced via `is_pastoral_care()`).

**Sync to PCO:** mirror existence-and-summary to PCO as a person note (`prayer_request_received`, with date and one-line summary — not full content). Full content stays in Supabase until PCO's Pastoral Care permission group is configured (a future slice).

---

## Staff Profiles (Pastoral Care Role Registry)

Pastoral care roles are tracked separately from `people` because they are operators, not subjects of the workflow. The `staff_profiles` table is email-keyed so roles can be assigned before a user signs in to Supabase Auth for the first time — a trigger on `auth.users` backfills `user_id` on first sign-in.

```json
{
  "email": "string (primary key, lowercase)",
  "user_id": "uuid | null (FK to auth.users; backfills on first sign-in)",
  "full_name": "string",
  "pastoral_care": "boolean (grants read access to prayer_requests)",
  "pcpoc_alert_recipient": "boolean (receives real-time alerts on new prayer requests)",
  "is_default_pcpoc": "boolean (exactly one row may hold this true; partial-unique-index enforced)"
}
```

---

## System Metadata

```json
{
  "meta": {
    "source": "pco | subsplash | manual",
    "pco_id": "string",
    "subsplash_id": "string | null",
    "created_date": "ISO date",
    "last_updated": "ISO date",
    "updated_by": "system | staff_name"
  }
}
```

---

## Notes on This Model

- **preferred_name** is always used in communications — never "Dear Friend" or generic salutations.
- **pastoral_flags** are restricted. No agent reads or writes to this object without explicit pastoral authorization.
- **starting_point.intake** is the richest data in the system. It informs group placement, team assignment, and leadership development. It is never used for automated communication — only for human-informed decisions.
- **stage_health** is system-calculated: `active` = attended in last 30 days, `at_risk` = 31–60 days, `inactive` = 60+ days with no engagement signal.
