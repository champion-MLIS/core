/**
 * PcoAdapter — Planning Center Online implementation of CmsAdapter.
 *
 * Wraps src/pco/client.ts plus the resource modules (people, forms) and
 * translates PCO's JSON:API shape into the CMS-neutral types declared in
 * src/cms/adapter.ts.
 *
 * The translation surface lives here so consumers (intake mirror, signal
 * poller, future agents) can stay vendor-neutral. When we add a Breeze or
 * CCB adapter next, the consumers don't change — only this directory grows.
 */

import { PcoClient, type PcoClientOptions } from '../../pco/client.ts';
import { listPeople, findIncluded } from '../../pco/people.ts';
import { listForms, listFormSubmissions, submissionPersonId } from '../../pco/forms.ts';
import type { PcoIncluded, PcoPerson } from '../../pco/types.ts';
import type {
  CmsAdapter,
  CmsCheckIn,
  CmsDonation,
  CmsEmail,
  CmsForm,
  CmsFormSubmission,
  CmsHousehold,
  CmsPerson,
  CmsPhone,
  CmsServicePlan,
  ListOptions,
} from '../adapter.ts';
import type { Json } from '../../db/index.ts';

export class PcoAdapter implements CmsAdapter {
  readonly vendor = 'pco' as const;
  private readonly client: PcoClient;

  constructor(client: PcoClient | PcoClientOptions) {
    this.client = client instanceof PcoClient ? client : new PcoClient(client);
  }

  // ---- People + relationships ------------------------------------------

  async listPeople(opts: ListOptions = {}): Promise<{
    people: CmsPerson[];
    households: CmsHousehold[];
    emails: CmsEmail[];
    phones: CmsPhone[];
  }> {
    const order = (opts.order ?? '-created_at') as
      | 'created_at'
      | '-created_at'
      | 'updated_at'
      | '-updated_at';
    const result = await listPeople(this.client, {
      perPage: opts.per_page ?? 50,
      order,
      include: ['emails', 'phone_numbers', 'households'],
    });

    const people = result.people.map((p) => personToCms(p));
    const households = collectHouseholds(result.people, result.included);
    const emails = collectEmails(result.people, result.included);
    const phones = collectPhones(result.people, result.included);

    return { people, households, emails, phones };
  }

  // ---- Forms ------------------------------------------------------------

  async listForms(): Promise<CmsForm[]> {
    const { forms } = await listForms(this.client, { activeOnly: true, perPage: 100 });
    return forms.map((f) => ({
      cms_id: f.id,
      name: typeof f.attributes.name === 'string' ? f.attributes.name : '(unnamed)',
      active: f.attributes.active !== false,
      archived: Boolean(f.attributes.archived || f.attributes.archived_at),
      submission_count:
        typeof f.attributes.submission_count === 'number' ? f.attributes.submission_count : null,
      public_url: typeof f.attributes.public_url === 'string' ? f.attributes.public_url : null,
    }));
  }

  async listFormSubmissions(
    formId: string,
    opts: ListOptions = {},
  ): Promise<CmsFormSubmission[]> {
    const result = await listFormSubmissions(this.client, formId, {
      perPage: opts.per_page ?? 50,
      order: (opts.order ?? '-created_at') as 'created_at' | '-created_at',
      include: ['person'],
      ...(opts.created_since ? { createdSince: opts.created_since } : {}),
    });
    return result.submissions.map((s) => ({
      cms_id: s.id,
      form_cms_id: formId,
      person_cms_id: submissionPersonId(s),
      created_at: s.attributes.created_at,
      field_values: {}, // not yet sideloaded — wire later when Phase C needs Connect Card fields
    }));
  }

  // ---- Giving (Step 3.1) ------------------------------------------------

  async listDonations(_opts: ListOptions = {}): Promise<CmsDonation[]> {
    // Step 3.1 not yet implemented. Champion's Subsplash → PCO Giving sync
    // is scheduled to go live the week of 2026-05-21; until then this
    // returns empty and the signal poller never tries to fire first_giving.
    return [];
  }

  // ---- Check-Ins (Step 3.2) --------------------------------------------

  async listCheckIns(_opts: ListOptions = {}): Promise<CmsCheckIn[]> {
    // Step 3.2 not yet implemented.
    return [];
  }

  // ---- Service plans (Phase C — sermon context) ------------------------

  async getServicePlan(_serviceDate: string): Promise<CmsServicePlan | null> {
    // Phase C not yet implemented.
    return null;
  }
}

// ---------------------------------------------------------------------------
// PCO → CMS-neutral translation helpers
// ---------------------------------------------------------------------------

function personToCms(p: PcoPerson): CmsPerson {
  const a = p.attributes;
  const householdRef = p.relationships?.['households']?.data;
  const household_id = Array.isArray(householdRef)
    ? (householdRef[0]?.id ?? null)
    : (householdRef?.id ?? null);

  return {
    cms_id: p.id,
    first_name: a.first_name ?? null,
    last_name: a.last_name ?? null,
    preferred_name: a.nickname ?? a.given_name ?? null,
    is_child: a.child ?? null,
    birthdate: a.birthdate ?? null,
    household_id,
    membership: a.membership ?? null,
    status: a.status ?? null,
    created_at: a.created_at,
    updated_at: a.updated_at ?? null,
    raw: a as unknown as Json,
  };
}

function collectHouseholds(people: PcoPerson[], included: PcoIncluded[]): CmsHousehold[] {
  const ids = new Set<string>();
  for (const p of people) {
    const ref = p.relationships?.['households']?.data;
    const id = Array.isArray(ref) ? ref[0]?.id : ref?.id;
    if (id) ids.add(id);
  }
  const out: CmsHousehold[] = [];
  for (const id of ids) {
    const r = findIncluded(included, 'Household', id);
    if (!r) {
      // Reference exists but resource wasn't sideloaded — emit a minimal stub
      // so foreign keys can still resolve.
      out.push({
        cms_id: id,
        name: null,
        member_count: null,
        primary_contact_id: null,
        raw: {},
      });
      continue;
    }
    const a = r.attributes;
    out.push({
      cms_id: id,
      name: typeof a['name'] === 'string' ? a['name'] : null,
      member_count: typeof a['member_count'] === 'number' ? a['member_count'] : null,
      primary_contact_id:
        typeof a['primary_contact_id'] === 'string' ? a['primary_contact_id'] : null,
      raw: a as Json,
    });
  }
  return out;
}

function collectEmails(people: PcoPerson[], included: PcoIncluded[]): CmsEmail[] {
  const out: CmsEmail[] = [];
  for (const p of people) {
    const refs = p.relationships?.['emails']?.data;
    if (!refs) continue;
    const ids = Array.isArray(refs) ? refs.map((r) => r.id) : [refs.id];
    for (const id of ids) {
      const r = findIncluded(included, 'Email', id);
      if (!r) continue;
      const a = r.attributes;
      const address = a['address'];
      if (typeof address !== 'string') continue;
      out.push({
        cms_id: r.id,
        person_cms_id: p.id,
        address,
        location: typeof a['location'] === 'string' ? a['location'] : null,
        is_primary: a['primary'] === true,
        blocked: a['blocked'] === true,
      });
    }
  }
  return out;
}

function collectPhones(people: PcoPerson[], included: PcoIncluded[]): CmsPhone[] {
  const out: CmsPhone[] = [];
  for (const p of people) {
    const refs = p.relationships?.['phone_numbers']?.data;
    if (!refs) continue;
    const ids = Array.isArray(refs) ? refs.map((r) => r.id) : [refs.id];
    for (const id of ids) {
      const r = findIncluded(included, 'PhoneNumber', id);
      if (!r) continue;
      const a = r.attributes;
      const number = a['number'];
      if (typeof number !== 'string') continue;
      out.push({
        cms_id: r.id,
        person_cms_id: p.id,
        number,
        location: typeof a['location'] === 'string' ? a['location'] : null,
        is_primary: a['primary'] === true,
        carrier: typeof a['carrier'] === 'string' ? a['carrier'] : null,
      });
    }
  }
  return out;
}
