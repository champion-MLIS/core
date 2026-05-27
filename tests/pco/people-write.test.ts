import { describe, it, expect } from 'vitest';

import { PcoClient } from '../../src/pco/client.ts';
import { createPerson, addPhoneNumber } from '../../src/pco/people-write.ts';

interface Captured {
  url: string;
  method: string;
  body: unknown;
}

function stubFetch(responder: (c: Captured) => { status?: number; json: unknown }) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const captured: Captured = {
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(captured);
    const { status = 201, json } = responder(captured);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      async json() {
        return json;
      },
      async text() {
        return JSON.stringify(json);
      },
    } as unknown as Response;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('PCO people-write', () => {
  it('createPerson POSTs a JSON:API person and returns the id', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({
      json: { data: { id: '99', type: 'Person' } },
    }));
    const client = new PcoClient({ appId: 'a', secret: 'b', fetchImpl });

    const result = await createPerson(client, { note: 'texted HOME' });

    expect(result.pcoId).toBe('99');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toContain('/people/v2/people');
    // No name known → "Friend" placeholder so the PCO record is readable.
    const body = calls[0]!.body as { data: { attributes: { first_name: string } } };
    expect(body.data.attributes.first_name).toBe('Friend');
  });

  it('createPerson sends a real first name when provided', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ json: { data: { id: '1' } } }));
    const client = new PcoClient({ appId: 'a', secret: 'b', fetchImpl });
    await createPerson(client, { firstName: 'Sam', lastName: 'Lee' });
    const body = calls[0]!.body as { data: { attributes: { first_name: string; last_name: string } } };
    expect(body.data.attributes.first_name).toBe('Sam');
    expect(body.data.attributes.last_name).toBe('Lee');
  });

  it('addPhoneNumber POSTs to the person phone_numbers endpoint as primary Mobile', async () => {
    const { fetchImpl, calls } = stubFetch(() => ({ json: { data: { id: 'ph-1' } } }));
    const client = new PcoClient({ appId: 'a', secret: 'b', fetchImpl });

    const result = await addPhoneNumber(client, '99', '+19285551234');

    expect(result.pcoId).toBe('ph-1');
    expect(calls[0]!.url).toContain('/people/v2/people/99/phone_numbers');
    const body = calls[0]!.body as {
      data: { attributes: { number: string; primary: boolean; location: string } };
    };
    expect(body.data.attributes.number).toBe('+19285551234');
    expect(body.data.attributes.primary).toBe(true);
    expect(body.data.attributes.location).toBe('Mobile');
  });

  it('throws when PCO returns no id', async () => {
    const { fetchImpl } = stubFetch(() => ({ json: { data: {} } }));
    const client = new PcoClient({ appId: 'a', secret: 'b', fetchImpl });
    await expect(createPerson(client, {})).rejects.toThrow(/no id/);
  });
});
