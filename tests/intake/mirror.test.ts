import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PcoClient } from '../../src/pco/client.ts';
import { runIntakeMirror } from '../../src/intake/mirror.ts';
import type { Db } from '../../src/db/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'pco-people.sample.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

// ---------------------------------------------------------------------------
// In-memory fake Supabase client
//
// Implements just enough of the @supabase/supabase-js builder surface to
// drive runIntakeMirror end-to-end: from().select().eq().is().limit().
// maybeSingle() and from().upsert(rows, { onConflict }). Bring-up cost is
// worth it — we get real behavioral assertions instead of mocking each call.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeFakeDb(seed: Record<string, Row[]> = {}): {
  db: Db;
  tables: Record<string, Row[]>;
} {
  const tables: Record<string, Row[]> = {
    pastoral_flags: [],
    households: [],
    people: [],
    emails: [],
    phone_numbers: [],
    poll_watermarks: [],
    ...seed,
  };

  function from(table: string): unknown {
    const filters: Array<(r: Row) => boolean> = [];

    const chain = {
      select(_cols?: string) {
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return chain;
      },
      is(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return chain;
      },
      limit(_n: number) {
        return chain;
      },
      async maybeSingle() {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] ?? null, error: null };
      },
      async upsert(values: Row | Row[], options?: { onConflict?: string }) {
        const arr = Array.isArray(values) ? values : [values];
        const conflictCols = options?.onConflict?.split(',') ?? ['id'];
        const existing = tables[table] ?? [];
        for (const row of arr) {
          const idx = existing.findIndex((r) =>
            conflictCols.every((c) => r[c] === row[c]),
          );
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], ...row };
          } else {
            existing.push({ ...row });
          }
        }
        tables[table] = existing;
        return { data: arr, error: null };
      },
    };
    return chain;
  }

  return { db: { from } as unknown as Db, tables };
}

function makePcoClient(): PcoClient {
  return new PcoClient({
    appId: 'x',
    secret: 'y',
    maxRetries: 0,
    fetchImpl: (async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runIntakeMirror — cold start', () => {
  let fake: ReturnType<typeof makeFakeDb>;
  let pco: PcoClient;

  beforeEach(() => {
    fake = makeFakeDb();
    pco = makePcoClient();
  });

  it('mirrors people, households, emails, and phones from PCO into Supabase', async () => {
    // Pin "now" so the 90-day cold-start window is deterministic.
    const result = await runIntakeMirror(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.recordsExamined).toBe(3);
    expect(result.peopleUpserted).toBe(3);
    expect(result.householdsUpserted).toBe(3);
    expect(result.contactsUpserted).toBe(3); // 2 emails + 1 phone in the fixture
    expect(result.peopleSkippedFlagged).toBe(0);
    expect(result.watermarkBefore).toBeNull();
    expect(result.watermarkAfter).toBe('2026-05-12T15:42:11Z');

    expect(fake.tables['people']).toHaveLength(3);
    expect(fake.tables['households']).toHaveLength(2); // Carter household appears twice but dedupes
    expect(fake.tables['emails']).toHaveLength(2);
    expect(fake.tables['phone_numbers']).toHaveLength(1);
    expect(fake.tables['poll_watermarks']).toHaveLength(1);
  });

  it('persists the correct person fields (names, household link, child flag)', async () => {
    await runIntakeMirror(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    const maria = fake.tables['people']!.find((p) => p.pco_id === '1001');
    expect(maria).toMatchObject({
      pco_id: '1001',
      first_name: 'Maria',
      last_name: 'Lopez',
      household_pco_id: '7001',
      is_child: false,
    });
    // current_stage and stage_entered_at are intentionally not in the payload —
    // they're owned by the Stage Transition Agent and the DB default applies on
    // INSERT. Asserting they're absent guards against accidental demotion.
    expect(maria).not.toHaveProperty('current_stage');
    expect(maria).not.toHaveProperty('stage_entered_at');

    const lily = fake.tables['people']!.find((p) => p.pco_id === '1003');
    expect(lily).toMatchObject({
      pco_id: '1003',
      first_name: 'Lily',
      is_child: true,
      household_pco_id: '7002',
    });
  });
});

describe('runIntakeMirror — warm start (watermark in place)', () => {
  it('only processes records newer than the watermark', async () => {
    // Watermark just before the most recent fixture record (Maria, 15:42:11).
    // James (14:10:00) and Lily (14:11:15) are older and should be skipped.
    const fake = makeFakeDb({
      poll_watermarks: [
        {
          source: 'pco',
          resource: 'people',
          last_seen_at: '2026-05-12T15:00:00Z',
          last_seen_id: 'prev',
          poll_started_at: '2026-05-12T15:00:00Z',
          poll_completed_at: '2026-05-12T15:00:00Z',
          records_processed: 0,
        },
      ],
    });
    const pco = makePcoClient();

    const result = await runIntakeMirror(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.peopleUpserted).toBe(1); // Just Maria
    expect(fake.tables['people']).toHaveLength(1);
    expect((fake.tables['people']![0] as { pco_id: string }).pco_id).toBe('1001');
  });

  it('does nothing when the watermark is newer than every record (idempotent re-run)', async () => {
    const fake = makeFakeDb({
      poll_watermarks: [
        {
          source: 'pco',
          resource: 'people',
          last_seen_at: '2026-05-13T00:00:00Z',
          last_seen_id: 'newer',
          poll_started_at: '2026-05-13T00:00:00Z',
          poll_completed_at: '2026-05-13T00:00:00Z',
          records_processed: 0,
        },
      ],
    });
    const pco = makePcoClient();

    const result = await runIntakeMirror(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.peopleUpserted).toBe(0);
    expect(result.householdsUpserted).toBe(0);
    expect(result.contactsUpserted).toBe(0);
    expect(fake.tables['people']).toHaveLength(0);
  });
});

describe('runIntakeMirror — pastoral override', () => {
  it('skips people with an active (unresolved) pastoral_flag', async () => {
    const fake = makeFakeDb({
      pastoral_flags: [
        {
          id: 'flag-1',
          person_pco_id: '1001', // Maria
          reason: 'sensitive',
          notes: null,
          assigned_to: null,
          raised_at: '2026-05-10T00:00:00Z',
          resolved_at: null,
          resolved_by: null,
        },
        {
          id: 'flag-2',
          person_pco_id: '1002', // James — but resolved, so should NOT be skipped
          reason: 'prayer',
          notes: null,
          assigned_to: null,
          raised_at: '2026-05-01T00:00:00Z',
          resolved_at: '2026-05-05T00:00:00Z',
          resolved_by: 'staff',
        },
      ],
    });
    const pco = makePcoClient();

    const result = await runIntakeMirror(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.peopleSkippedFlagged).toBe(1);
    expect(result.peopleUpserted).toBe(2); // James and Lily — Maria is skipped
    expect(fake.tables['people']!.find((p) => p.pco_id === '1001')).toBeUndefined();
    expect(fake.tables['people']!.find((p) => p.pco_id === '1002')).toBeDefined();
  });
});
