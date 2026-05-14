/**
 * PCO Check-Ins — placeholder for Step 3.2.
 *
 * Child check-in (with no existing profile for the parent) is one of the
 * four trigger signals defined in workflows/guest-follow-up/spec.md.
 *
 * Implementation will:
 *   1. Verify the PCO PAT has Check-Ins product access.
 *   2. Poll /check-ins/v2/check_ins for recent records, sideload person.
 *   3. For each check-in that's for a child, find the parent/guardian
 *      person record. If the parent isn't in our mirror yet, that's the
 *      signal (their first appearance in Champion's orbit).
 *   4. Map to engagement_signal of kind 'child_checkin' on the parent record.
 *   5. Watermark per check-in (source='pco', resource='check_ins').
 *
 * Note: the spec phrases this as "child check-in with no existing profile"
 * — meaning the parent has no prior record, not the child. The signal is
 * about the family appearing for the first time.
 *
 * No code yet — see giving.ts for the same rationale.
 */

export const PCO_CHECK_INS_TODO = 'See workflows/guest-follow-up/spec.md trigger #3.';
