/**
 * PCO write operations — creating people + phone numbers.
 *
 * This is the ONLY place MLIS writes to the church's live CRM. It exists for
 * the broadcast-keyword path (Phase F.2): someone texts "HOME" with no PCO
 * identity, and we mint a minimal record so they enter the lifecycle.
 *
 * Discipline:
 *   - Callers MUST dedup before creating (PCO has no upsert). See the
 *     broadcast processor, which checks the local mirror by phone first.
 *   - Names are optional. A broadcast responder is phone-only until a human
 *     enriches the record on the callback; PCO accepts a person with no name.
 *   - Every record created here is tagged in raw attributes / notes so it's
 *     obviously system-created and easy to find or merge later.
 */

import type { PcoClient } from './client.ts';

export interface CreatePersonInput {
  firstName?: string | null;
  lastName?: string | null;
  /** Free-text note stored on the PCO person (e.g. the inbound message). */
  note?: string | null;
}

export interface CreatedPerson {
  pcoId: string;
}

export interface CreatedPhone {
  pcoId: string;
}

interface PcoCreateResponse {
  data?: { id?: string };
}

/**
 * Create a Person in PCO. Returns the new PCO id.
 *
 * We deliberately send a `Friend` placeholder first name when none is known,
 * so the record is human-readable in PCO ("Friend" rather than blank) and the
 * volunteer replaces it on the callback. The real name backfills via the
 * normal intake mirror once edited in PCO.
 */
export async function createPerson(
  client: PcoClient,
  input: CreatePersonInput,
): Promise<CreatedPerson> {
  const attributes: Record<string, unknown> = {
    first_name: input.firstName?.trim() || 'Friend',
  };
  if (input.lastName?.trim()) attributes.last_name = input.lastName.trim();

  const res = await client.post<PcoCreateResponse>('/people/v2/people', {
    data: { type: 'Person', attributes },
  });

  const id = res?.data?.id;
  if (!id) throw new Error('PCO createPerson returned no id');
  return { pcoId: id };
}

/**
 * Attach a phone number to a PCO person and mark it primary + Mobile.
 * Best-effort: the person already exists, so a phone failure shouldn't lose
 * the record — callers decide whether to surface it.
 */
export async function addPhoneNumber(
  client: PcoClient,
  personPcoId: string,
  numberE164: string,
): Promise<CreatedPhone> {
  const res = await client.post<PcoCreateResponse>(
    `/people/v2/people/${personPcoId}/phone_numbers`,
    {
      data: {
        type: 'PhoneNumber',
        attributes: { number: numberE164, location: 'Mobile', primary: true },
      },
    },
  );
  const id = res?.data?.id;
  if (!id) throw new Error('PCO addPhoneNumber returned no id');
  return { pcoId: id };
}
