# Workflow: Guest Follow-Up
**Status:** First build · End-to-end

---

## Purpose

Every first-time guest receives a personal, named follow-up within 24 hours — every time, without staff scrambling. This is the highest-leverage, lowest-risk workflow to prove the MLIS.

---

## Trigger

A new person record appears in Planning Center (PCO) with one or more of the following signals:
- Connect card submitted
- First-time giving recorded
- Child check-in with no existing profile
- Written prayer request received

---

## Workflow Steps

### Step 1 — Guest Intake Agent: Detect & Build Profile

**Input:** PCO webhook or scheduled poll (every 15 minutes during/after services)

**Actions:**
1. Identify new person records created since last poll
2. Check for existing profile in MLIS (prevent duplicate)
3. Build person profile from PCO data:
   - Name, contact info, household, children (if applicable)
   - First visit date, service time
   - Sermon title and topic (pulled from PCO service plan)
   - Kids' church activity (if children checked in)
   - Trigger signal (connect card / giving / check-in / prayer request)
4. Check pastoral_flags — if any flag exists, STOP and alert Pastoral Override Monitor
5. Set `current_stage = guest`
6. Flag profile for Guest Follow-Up Agent

**Output:** Complete guest profile, flagged for follow-up

---

### Step 2 — Guest Follow-Up Agent: Draft Communication

**Input:** Flagged guest profile

**Actions:**
1. Select communication type based on available contact info:
   - Email available → draft email (primary)
   - Mobile available → draft SMS (secondary or paired)
   - Neither → flag for manual staff outreach
2. Personalize draft:
   - Use `preferred_name` (or `first_name` if not set)
   - Reference sermon topic if available
   - Include kids' ministry link if children are on record
   - Select 1–2 relevant ministry links (do not overwhelm)
3. Run voice check against voice-samples.md:
   - Warm and personal? ✓
   - Zero pressure language? ✓
   - Sounds like Champion wrote it? ✓
4. Package draft for staff approval:
   - Draft content
   - Person profile summary (name, visit date, trigger signal)
   - Recommended send time (within 24 hours of visit)
5. Send approval package to designated staff member

**Output:** Draft communication + approval request to staff

---

### Step 3 — Staff Approval Gate

**Input:** Draft communication package

**Staff actions (one-touch):**
- ✅ **Approve** → communication sends as drafted
- ✏️ **Edit + Approve** → staff edits, then approves, communication sends
- ⏸️ **Hold** → communication held, staff notified to follow up manually
- 🚩 **Flag** → pastoral override triggered, all automation paused for this person

**Timeout rule:** If no response within 20 hours of visit, system sends a reminder to staff. If no response within 23 hours, escalates to Senior Pastor or designated backup.

**Output:** Approved communication ready to send

---

### Step 4 — Send & Log

**Input:** Approved communication

**Actions:**
1. Send via configured channel (email / SMS)
2. Log to person profile:
   - Date sent
   - Channel
   - Template used
   - Approved by (staff name)
   - Content summary
3. Set follow-up tracking:
   - Did they open? (email tracking)
   - Did they reply?
   - Did they click any links?
4. Schedule Stage Transition Agent check: if engagement signal received within 30 days → evaluate Guest → Connected transition

**Output:** Communication sent, profile updated, follow-up tracking active

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Person has no email or phone | Flag for manual staff outreach, no automation |
| Person has existing profile (returning guest) | Do not create duplicate. Route to re-engagement workflow |
| Prayer request is personal/sensitive | Immediate pastoral override. No automation. |
| Connect card but no name | Hold for staff to manually gather info |
| Family with children — no kids' ministry context | Omit kids' link, flag for staff to follow up personally |
| Staff approval timeout (23 hours) | Escalate to Senior Pastor or backup approver |

---

## Success Metrics

- % of first-time guests receiving follow-up within 24 hours (target: 100%)
- Staff approval time (target: under 4 hours average)
- Guest reply/engagement rate (baseline TBD after first 30 days)
- Guest → Connected conversion rate (baseline TBD)

---

## Dependencies

- PCO API connected and polling
- Staff approval channel configured (email notification to designated staff)
- Voice samples approved and loaded
- Pastoral override monitor stub active

---

## What This Proves

If this workflow ships and the follow-up actually sounds like Champion Church, we have proven:
1. The PCO integration works
2. The voice spec is real and executable
3. The staff approval gate is workable
4. The person profile model is accurate

Everything else in the MLIS is built on this foundation.
