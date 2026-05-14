/**
 * Guest Intake Agent — Step 2.
 *
 * Mirrors PCO People into the MLIS database. This is the foundation every
 * other agent stands on: nothing can be followed up with, transitioned, or
 * reported on until it exists in Supabase.
 *
 * Scope of this module:
 *   - Read the last successful poll watermark.
 *   - Fetch a page of PCO People newer than the watermark.
 *   - For each person: upsert household → person → emails → phone_numbers.
 *   - Skip work for anyone with an active pastoral_flag (override stop).
 *   - Advance the watermark.
 *
 * Out of scope here (deferred to Step 3+):
 *   - Detecting trigger signals from forms / giving / check-ins.
 *   - Inserting into engagement_signals or followup_queue.
 *   - Stage transitions.
 *
 * Idempotency: every write is an UPSERT keyed on `pco_id`. Running this
 * function back-to-back with no new PCO data is a no-op.
 */

import type { PcoClient } from '../pco/client.ts';
import { listPeople, findIncluded } from '../pco/people.ts';
import type { PcoIncluded, PcoPerson } from '../pco/types.ts';
import type {
  Db,
  EmailInsert,
  HouseholdInsert,
  Json,
  PersonInsert,
  PhoneInsert,
} from '../db/index.ts';
import { getWatermark, setWatermark } from './watermarks.ts';

const WATERMARK_SOURCE = 'pco';
const WATERMARK_RESOURCE = 'people';

export interface MirrorResult {
  /** ISO timestamp of when this poll started. */
  pollStartedAt: string;
  /** ISO timestamp of when this poll completed. */
  pollCompletedAt: string;
  /** Number of PCO records examined this poll (page size, before dedupe). */
  recordsExamined: number;
  /** Number of person records upserted (new or updated). */
  peopleUpserted: number;
  /** Number of person records skipped because of an active pastoral_flag. */
  peopleSkippedFlagged: number;
  /** Number of contact records (emails + phones) upserted. */
  contactsUpserted: number;
  /** Number of households upserted. */
  householdsUpserted: number;
  /** Watermark before the poll (null on cold start). */
  watermarkBefore: string | null;
  /** Watermark after the poll. */
  watermarkAfter: string | null;
}

export interface MirrorOptions {
  /** Page size to pull from PCO. Defaults to 50; max 100. */
  pageSize?: number;
  /**
   * Cold-start cutoff: how far back to look on the very first poll.
   * Defaults to 90 days, which is enough to backfill anyone added recently
   * without sucking in years of legacy directory records on day one.
   */
  coldStartLookback?: { days: number };
  /** Caller-supplied current-time function — useful for tests. */
  now?: () => Date;
}

export async function runIntakeMirror(
  db: Db,
  pco: PcoClient,
  opts: MirrorOptions = {},
): Promise<MirrorResult> {
  const now = opts.now ?? (() => new Date());
  const pollStartedAt = now().toISOString();

  const watermark = await getWatermark(db, {
    source: WATERMARK_SOURCE,
    resource: WATERMARK_RESOURCE,
  });
  const watermarkBefore = watermark?.last_seen_at ?? null;

  // Pull the most recently created people from PCO. We ask for newest-first
  // so the page is bounded to "recent stuff" — Champion's PCO directory has
  // years of legacy records, and ordering ascending would return ancient
  // records that fall outside the cold-start lookback window.
  //
  // Within the page, we sort ascending below so the watermark advances
  // monotonically from oldest to newest as we process.
  const { people, included } = await listPeople(pco, {
    perPage: opts.pageSize ?? 50,
    order: '-created_at',
    include: ['emails', 'phone_numbers', 'households'],
  });

  // Filter to records newer than the watermark. On cold start we use the
  // lookback window so a freshly-provisioned system doesn't try to
  // backfill thousands of legacy records.
  const cutoffMs = watermark
    ? Date.parse(watermark.last_seen_at)
    : now().getTime() - (opts.coldStartLookback?.days ?? 90) * 24 * 60 * 60 * 1000;

  const candidates = people
    .filter((p) => Date.parse(p.attributes.created_at) > cutoffMs)
    // Defensive ascending sort — the watermark must advance monotonically,
    // so even if PCO ever returns records out of order we process the
    // oldest-first and end up parked at the newest.
    .sort(
      (a, b) =>
        Date.parse(a.attributes.created_at) - Date.parse(b.attributes.created_at),
    );

  let peopleUpserted = 0;
  let peopleSkippedFlagged = 0;
  let contactsUpserted = 0;
  let householdsUpserted = 0;
  let latestSeenAt = watermark?.last_seen_at ?? null;
  let latestSeenId = watermark?.last_seen_id ?? null;

  for (const person of candidates) {
    // Pastoral override gate: if the person already has an active flag,
    // refresh nothing. The override monitor owns this profile until cleared.
    const flagged = await hasActivePastoralFlag(db, person.id);
    if (flagged) {
      peopleSkippedFlagged++;
      continue;
    }

    const householdRow = upsertableHousehold(person, included);
    if (householdRow) {
      const { error } = await db
        .from('households')
        .upsert(householdRow, { onConflict: 'pco_id' });
      if (error) throw new Error(`households upsert failed: ${error.message}`);
      householdsUpserted++;
    }

    const personRow = buildPersonInsert(person);
    {
      const { error } = await db
        .from('people')
        .upsert(personRow, { onConflict: 'pco_id' });
      if (error) throw new Error(`people upsert failed: ${error.message}`);
      peopleUpserted++;
    }

    const emails = collectEmails(person, included);
    if (emails.length > 0) {
      const { error } = await db
        .from('emails')
        .upsert(emails, { onConflict: 'pco_id' });
      if (error) throw new Error(`emails upsert failed: ${error.message}`);
      contactsUpserted += emails.length;
    }

    const phones = collectPhones(person, included);
    if (phones.length > 0) {
      const { error } = await db
        .from('phone_numbers')
        .upsert(phones, { onConflict: 'pco_id' });
      if (error) throw new Error(`phone_numbers upsert failed: ${error.message}`);
      contactsUpserted += phones.length;
    }

    latestSeenAt = person.attributes.created_at;
    latestSeenId = person.id;
  }

  const pollCompletedAt = now().toISOString();

  if (latestSeenAt) {
    await setWatermark(db, {
      source: WATERMARK_SOURCE,
      resource: WATERMARK_RESOURCE,
      lastSeenAt: latestSeenAt,
      lastSeenId: latestSeenId,
      pollStartedAt,
      pollCompletedAt,
      recordsProcessed: peopleUpserted,
    });
  }

  return {
    pollStartedAt,
    pollCompletedAt,
    recordsExamined: people.length,
    peopleUpserted,
    peopleSkippedFlagged,
    contactsUpserted,
    householdsUpserted,
    watermarkBefore,
    watermarkAfter: latestSeenAt,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function hasActivePastoralFlag(db: Db, personPcoId: string): Promise<boolean> {
  const { data, error } = await db
    .from('pastoral_flags')
    .select('id')
    .eq('person_pco_id', personPcoId)
    .is('resolved_at', null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`pastoral_flags lookup failed: ${error.message}`);
  return data !== null;
}

function buildPersonInsert(person: PcoPerson): PersonInsert {
  const attrs = person.attributes;
  const householdRef = person.relationships?.['households']?.data;
  const householdId = Array.isArray(householdRef)
    ? (householdRef[0]?.id ?? null)
    : (householdRef?.id ?? null);

  // current_stage and stage_entered_at are intentionally omitted: they're
  // owned by the Stage Transition Agent, not the intake mirror. On INSERT,
  // the DB default ('guest') applies. On UPDATE-via-upsert, Postgres only
  // touches columns present in the input, so an existing person at
  // 'connected' or beyond is not demoted back to 'guest' on re-poll.
  return {
    pco_id: person.id,
    first_name: attrs.first_name ?? null,
    last_name: attrs.last_name ?? null,
    preferred_name: attrs.nickname ?? attrs.given_name ?? null,
    household_pco_id: householdId,
    is_child: attrs.child ?? null,
    birthdate: attrs.birthdate ?? null,
    membership: attrs.membership ?? null,
    status: attrs.status ?? null,
    raw_attributes: attrs as unknown as Json,
    pco_created_at: attrs.created_at,
    pco_updated_at: attrs.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}

function upsertableHousehold(
  person: PcoPerson,
  included: PcoIncluded[],
): HouseholdInsert | null {
  const ref = person.relationships?.['households']?.data;
  const id = Array.isArray(ref) ? ref[0]?.id : ref?.id;
  if (!id) return null;
  const resource = findIncluded(included, 'Household', id);
  if (!resource) {
    // Relationship referenced but resource not sideloaded — minimal stub so
    // the person FK can resolve.
    return { pco_id: id };
  }
  const attrs = resource.attributes;
  return {
    pco_id: id,
    name: typeof attrs['name'] === 'string' ? attrs['name'] : null,
    member_count: typeof attrs['member_count'] === 'number' ? attrs['member_count'] : null,
    primary_contact_pco_id:
      typeof attrs['primary_contact_id'] === 'string' ? attrs['primary_contact_id'] : null,
    raw_attributes: attrs as unknown as Json,
    synced_at: new Date().toISOString(),
  };
}

function collectEmails(person: PcoPerson, included: PcoIncluded[]): EmailInsert[] {
  const refs = person.relationships?.['emails']?.data;
  if (!refs) return [];
  const ids = Array.isArray(refs) ? refs.map((r) => r.id) : [refs.id];
  const results: EmailInsert[] = [];
  for (const id of ids) {
    const r = findIncluded(included, 'Email', id);
    if (!r) continue;
    const a = r.attributes;
    const address = a['address'];
    if (typeof address !== 'string') continue;
    results.push({
      pco_id: r.id,
      person_pco_id: person.id,
      address,
      location: typeof a['location'] === 'string' ? a['location'] : null,
      is_primary: a['primary'] === true,
      blocked: a['blocked'] === true,
    });
  }
  return results;
}

function collectPhones(person: PcoPerson, included: PcoIncluded[]): PhoneInsert[] {
  const refs = person.relationships?.['phone_numbers']?.data;
  if (!refs) return [];
  const ids = Array.isArray(refs) ? refs.map((r) => r.id) : [refs.id];
  const results: PhoneInsert[] = [];
  for (const id of ids) {
    const r = findIncluded(included, 'PhoneNumber', id);
    if (!r) continue;
    const a = r.attributes;
    const number = a['number'];
    if (typeof number !== 'string') continue;
    results.push({
      pco_id: r.id,
      person_pco_id: person.id,
      number,
      location: typeof a['location'] === 'string' ? a['location'] : null,
      is_primary: a['primary'] === true,
      carrier: typeof a['carrier'] === 'string' ? a['carrier'] : null,
    });
  }
  return results;
}
