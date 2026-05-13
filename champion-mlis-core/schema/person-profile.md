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
    "override_reason": "death | crisis | prayer | conflict | sensitive | other",
    "override_date": "ISO date | null",
    "assigned_to": "staff_name | null",
    "notes": "string (restricted — pastoral eyes only)",
    "resolved": "boolean"
  }
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
