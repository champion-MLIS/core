/**
 * PCO Giving — placeholder for Step 3.1.
 *
 * First-time giving is one of the four trigger signals defined in
 * workflows/guest-follow-up/spec.md. Implementing it requires:
 *
 *   1. Verify the PCO Personal Access Token has Giving product access.
 *      Champion's current PAT was generated with default scopes — check.
 *   2. Use /giving/v2/donations with filters to find donations where the
 *      donor's first_donation_date == this_donation.created_at (i.e.,
 *      first-ever donation for that person).
 *   3. Map donation.person to a signal of kind 'first_giving'.
 *   4. Watermark per donation (source='pco', resource='donations').
 *
 * Structure mirrors src/pco/forms.ts and the signal poller in
 * src/intake/signals.ts will need a parallel branch for non-form sources.
 *
 * No code yet — implementation lands in a follow-up commit when we've
 * verified scope access and Champion has live giving data to test against.
 */

export const PCO_GIVING_TODO = 'See workflows/guest-follow-up/spec.md trigger #2.';
