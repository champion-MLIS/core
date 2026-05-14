import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PcoClient, PcoError } from '../../src/pco/client.ts';
import { listPeople, primaryEmail, primaryPhone } from '../../src/pco/people.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'pco-people.sample.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

function mockFetch(response: { status?: number; body: unknown }): typeof fetch {
  return vi.fn(async () => {
    const status = response.status ?? 200;
    return new Response(JSON.stringify(response.body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('PcoClient', () => {
  it('sends HTTP Basic auth with App ID + Secret', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    ) as unknown as typeof fetch;

    const client = new PcoClient({
      appId: 'app-123',
      secret: 'secret-abc',
      fetchImpl: fetchSpy,
      maxRetries: 0,
    });

    await client.get('/people/v2/people');

    const call = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const init = call![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const expected = 'Basic ' + Buffer.from('app-123:secret-abc').toString('base64');
    expect(headers['Authorization']).toBe(expected);
  });

  it('builds query strings, joining array values with commas', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify(fixture), { status: 200 }),
    ) as unknown as typeof fetch;

    const client = new PcoClient({
      appId: 'x',
      secret: 'y',
      fetchImpl: fetchSpy,
      maxRetries: 0,
    });

    await client.get('/people/v2/people', {
      query: { per_page: 25, include: ['emails', 'phone_numbers'] },
    });

    const url = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain('per_page=25');
    expect(url).toContain('include=emails%2Cphone_numbers');
  });

  it('throws PcoError on non-2xx responses', async () => {
    const client = new PcoClient({
      appId: 'x',
      secret: 'y',
      fetchImpl: mockFetch({ status: 401, body: { errors: [{ title: 'Unauthorized' }] } }),
      maxRetries: 0,
    });

    await expect(client.get('/people/v2/people')).rejects.toBeInstanceOf(PcoError);
    await expect(client.get('/people/v2/people')).rejects.toMatchObject({ status: 401 });
  });
});

describe('listPeople', () => {
  it('parses a real PCO People envelope', async () => {
    const client = new PcoClient({
      appId: 'x',
      secret: 'y',
      fetchImpl: mockFetch({ body: fixture }),
      maxRetries: 0,
    });

    const result = await listPeople(client, {
      perPage: 25,
      include: ['emails', 'phone_numbers', 'households'],
    });

    expect(result.people).toHaveLength(3);
    expect(result.people[0]!.id).toBe('1001');
    expect(result.people[0]!.attributes.first_name).toBe('Maria');
    expect(result.included.length).toBeGreaterThan(0);
  });

  it('resolves primary email from included resources', async () => {
    const client = new PcoClient({
      appId: 'x',
      secret: 'y',
      fetchImpl: mockFetch({ body: fixture }),
      maxRetries: 0,
    });

    const { people, included } = await listPeople(client);
    const maria = people.find((p) => p.id === '1001')!;
    expect(primaryEmail(maria, included)).toBe('maria.lopez@example.com');
    expect(primaryPhone(maria, included)).toBe('+1-928-555-0142');
  });

  it('returns null for missing contact info instead of throwing', async () => {
    const client = new PcoClient({
      appId: 'x',
      secret: 'y',
      fetchImpl: mockFetch({ body: fixture }),
      maxRetries: 0,
    });

    const { people, included } = await listPeople(client);
    const lily = people.find((p) => p.id === '1003')!;
    expect(primaryEmail(lily, included)).toBeNull();
    expect(primaryPhone(lily, included)).toBeNull();
  });
});
