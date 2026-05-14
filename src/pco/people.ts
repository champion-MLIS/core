import type { PcoClient } from './client.ts';
import {
  PcoPeopleCollection,
  PcoIncludedItem,
  type PcoIncluded,
  type PcoPeopleResponse,
  type PcoPerson,
} from './types.ts';

export interface ListPeopleOptions {
  /** Page size. PCO max is 100. */
  perPage?: number;
  /** Sort order. Default: newest-first by created_at. */
  order?: 'created_at' | '-created_at' | 'updated_at' | '-updated_at';
  /** Resources to include alongside each person. */
  include?: Array<'emails' | 'phone_numbers' | 'households' | 'field_data'>;
  /** Caller-driven cancellation. */
  signal?: AbortSignal;
  /** Optional filter on attribute equality (e.g. { status: 'active' }). */
  where?: Record<string, string | number | boolean>;
}

export interface ListPeopleResult {
  people: PcoPerson[];
  included: PcoIncluded[];
  raw: PcoPeopleResponse;
}

/**
 * List people from PCO. Returns one page — the caller decides whether to paginate.
 *
 * For the Guest Intake polling loop we will eventually want a `streamPeople`
 * that walks `links.next` until exhausted, but Step 1 only needs a single page.
 */
export async function listPeople(
  client: PcoClient,
  opts: ListPeopleOptions = {},
): Promise<ListPeopleResult> {
  const query: Record<string, string | number | string[]> = {
    per_page: opts.perPage ?? 25,
    order: opts.order ?? '-created_at',
  };

  if (opts.include && opts.include.length > 0) {
    query['include'] = opts.include;
  }

  if (opts.where) {
    for (const [k, v] of Object.entries(opts.where)) {
      query[`where[${k}]`] = String(v);
    }
  }

  const raw = await client.get<unknown>('/people/v2/people', {
    query,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const parsed = PcoPeopleCollection.parse(raw);
  const included = (parsed.included ?? [])
    .map((item) => PcoIncludedItem.safeParse(item))
    .filter((r): r is { success: true; data: PcoIncluded } => r.success)
    .map((r) => r.data);

  return {
    people: parsed.data,
    included,
    raw: parsed,
  };
}

/**
 * Resolve a relationship reference to its included resource.
 * Returns null if not found (which is normal — `include` is opt-in).
 */
export function findIncluded(
  included: PcoIncluded[],
  type: string,
  id: string,
): PcoIncluded | null {
  return included.find((r) => r.type === type && r.id === id) ?? null;
}

/**
 * Pull the primary email for a person from the included array.
 * PCO marks one email as `primary: true`; if none are marked, we return the first.
 */
export function primaryEmail(person: PcoPerson, included: PcoIncluded[]): string | null {
  const refs = person.relationships?.['emails']?.data;
  if (!refs) return null;
  const ids = Array.isArray(refs) ? refs.map((r) => r.id) : [refs.id];
  const emails = ids
    .map((id) => findIncluded(included, 'Email', id))
    .filter((e): e is PcoIncluded => e !== null);
  if (emails.length === 0) return null;
  const primary = emails.find((e) => e.attributes['primary'] === true) ?? emails[0]!;
  const address = primary.attributes['address'];
  return typeof address === 'string' ? address : null;
}

/**
 * Pull the primary phone number for a person from the included array.
 */
export function primaryPhone(person: PcoPerson, included: PcoIncluded[]): string | null {
  const refs = person.relationships?.['phone_numbers']?.data;
  if (!refs) return null;
  const ids = Array.isArray(refs) ? refs.map((r) => r.id) : [refs.id];
  const phones = ids
    .map((id) => findIncluded(included, 'PhoneNumber', id))
    .filter((p): p is PcoIncluded => p !== null);
  if (phones.length === 0) return null;
  const primary = phones.find((p) => p.attributes['primary'] === true) ?? phones[0]!;
  const number = primary.attributes['number'];
  return typeof number === 'string' ? number : null;
}
