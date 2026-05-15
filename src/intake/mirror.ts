/**
 * Guest Intake Agent — Step 2.
 *
 * Mirrors CMS people (Champion: PCO) into the MLIS database. This is the
 * foundation every other agent stands on: nothing can be followed up
 * with, transitioned, or reported on until it exists in Supabase.
 *
 * Vendor-neutral: takes a CmsAdapter (src/cms/adapter.ts), so this code
 * doesn't know or care whether the data came from PCO, Breeze, or CCB.
 *
 * Scope of this module:
 *   - Read the last successful poll watermark
 *   - Fetch a page of CMS people newer than the watermark
 *   - Upsert household → person → emails → phone_numbers
 *   - Skip work for anyone with an active pastoral_flag (override stop)
 *   - Advance the watermark
 *
 * Out of scope here (Phase C+):
 *   - Detecting trigger signals from forms / giving / check-ins
 *   - Inserting into engagement_signals or followup_queue
 *   - Stage transitions
 *
 * Idempotency: every write is an UPSERT keyed on the CMS id. Running this
 * function back-to-back with no new CMS data is a no-op.
 */

import type { CmsAdapter, CmsEmail, CmsHousehold, CmsPerson, CmsPhone } from '../cms/index.ts';
import type {
  Db,
  EmailInsert,
  HouseholdInsert,
  Json,
  PersonInsert,
  PhoneInsert,
} from '../db/index.ts';
import { getWatermark, setWatermark } from './watermarks.ts';

const WATERMARK_SOURCE = 'cms';
const WATERMARK_RESOURCE = 'people';

export interface MirrorResult {
  pollStartedAt: string;
  pollCompletedAt: string;
  recordsExamined: number;
  peopleUpserted: number;
  peopleSkippedFlagged: number;
  contactsUpserted: number;
  householdsUpserted: number;
  watermarkBefore: string | null;
  watermarkAfter: string | null;
}

export interface MirrorOptions {
  pageSize?: number;
  /** Cold-start cutoff. Default 90 days. */
  coldStartLookback?: { days: number };
  now?: () => Date;
}

export async function runIntakeMirror(
  db: Db,
  cms: CmsAdapter,
  opts: MirrorOptions = {},
): Promise<MirrorResult> {
  const now = opts.now ?? (() => new Date());
  const pollStartedAt = now().toISOString();

  const watermark = await getWatermark(db, {
    source: WATERMARK_SOURCE,
    resource: WATERMARK_RESOURCE,
  });
  const watermarkBefore = watermark?.last_seen_at ?? null;

  const { people, households, emails, phones } = await cms.listPeople({
    per_page: opts.pageSize ?? 50,
    order: '-created_at',
  });

  const cutoffMs = watermark
    ? Date.parse(watermark.last_seen_at)
    : now().getTime() - (opts.coldStartLookback?.days ?? 90) * 24 * 60 * 60 * 1000;

  // Filter and sort ascending so the watermark advances monotonically.
  const candidates = people
    .filter((p) => Date.parse(p.created_at) > cutoffMs)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  // Index related resources by person_cms_id for O(1) lookup.
  const householdsById = new Map<string, CmsHousehold>(
    households.map((h) => [h.cms_id, h]),
  );
  const emailsByPerson = groupBy(emails, (e) => e.person_cms_id);
  const phonesByPerson = groupBy(phones, (p) => p.person_cms_id);

  let peopleUpserted = 0;
  let peopleSkippedFlagged = 0;
  let contactsUpserted = 0;
  let householdsUpserted = 0;
  let latestSeenAt = watermark?.last_seen_at ?? null;
  let latestSeenId = watermark?.last_seen_id ?? null;
  const writtenHouseholdIds = new Set<string>();

  for (const person of candidates) {
    if (await hasActivePastoralFlag(db, person.cms_id)) {
      peopleSkippedFlagged++;
      continue;
    }

    // Upsert the household once per poll (if not already written).
    if (person.household_id && !writtenHouseholdIds.has(person.household_id)) {
      const hh = householdsById.get(person.household_id);
      const row: HouseholdInsert = hh
        ? cmsHouseholdToInsert(hh)
        : { pco_id: person.household_id };
      const { error } = await db.from('households').upsert(row, { onConflict: 'pco_id' });
      if (error) throw new Error(`households upsert failed: ${error.message}`);
      writtenHouseholdIds.add(person.household_id);
      householdsUpserted++;
    }

    // Upsert the person.
    {
      const { error } = await db
        .from('people')
        .upsert(cmsPersonToInsert(person), { onConflict: 'pco_id' });
      if (error) throw new Error(`people upsert failed: ${error.message}`);
      peopleUpserted++;
    }

    // Upsert emails for this person.
    const personEmails = emailsByPerson.get(person.cms_id) ?? [];
    if (personEmails.length > 0) {
      const rows: EmailInsert[] = personEmails.map(cmsEmailToInsert);
      const { error } = await db.from('emails').upsert(rows, { onConflict: 'pco_id' });
      if (error) throw new Error(`emails upsert failed: ${error.message}`);
      contactsUpserted += rows.length;
    }

    // Upsert phones for this person.
    const personPhones = phonesByPerson.get(person.cms_id) ?? [];
    if (personPhones.length > 0) {
      const rows: PhoneInsert[] = personPhones.map(cmsPhoneToInsert);
      const { error } = await db.from('phone_numbers').upsert(rows, { onConflict: 'pco_id' });
      if (error) throw new Error(`phone_numbers upsert failed: ${error.message}`);
      contactsUpserted += rows.length;
    }

    latestSeenAt = person.created_at;
    latestSeenId = person.cms_id;
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

function cmsPersonToInsert(p: CmsPerson): PersonInsert {
  // current_stage and stage_entered_at are intentionally omitted — they're
  // owned by the Stage Transition Agent. On INSERT, DB default ('guest')
  // applies. On UPDATE-via-upsert, Postgres only touches input columns, so
  // a person already past 'guest' is not demoted.
  return {
    pco_id: p.cms_id,
    first_name: p.first_name,
    last_name: p.last_name,
    preferred_name: p.preferred_name,
    household_pco_id: p.household_id,
    is_child: p.is_child,
    birthdate: p.birthdate,
    membership: p.membership,
    status: p.status,
    raw_attributes: p.raw as Json,
    pco_created_at: p.created_at,
    pco_updated_at: p.updated_at,
    synced_at: new Date().toISOString(),
  };
}

function cmsHouseholdToInsert(h: CmsHousehold): HouseholdInsert {
  return {
    pco_id: h.cms_id,
    name: h.name,
    member_count: h.member_count,
    primary_contact_pco_id: h.primary_contact_id,
    raw_attributes: h.raw as Json,
    synced_at: new Date().toISOString(),
  };
}

function cmsEmailToInsert(e: CmsEmail): EmailInsert {
  return {
    pco_id: e.cms_id,
    person_pco_id: e.person_cms_id,
    address: e.address,
    location: e.location,
    is_primary: e.is_primary,
    blocked: e.blocked,
  };
}

function cmsPhoneToInsert(p: CmsPhone): PhoneInsert {
  return {
    pco_id: p.cms_id,
    person_pco_id: p.person_cms_id,
    number: p.number,
    location: p.location,
    is_primary: p.is_primary,
    carrier: p.carrier,
  };
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
