import { describe, it, expect, beforeEach } from 'vitest';

import { runIntakeMirror } from '../../src/intake/mirror.ts';
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
} from '../../src/cms/index.ts';
import type { Db } from '../../src/db/index.ts';

// ---------------------------------------------------------------------------
// Mock CmsAdapter — returns fixture-shaped data in the CMS-neutral format
// ---------------------------------------------------------------------------

class MockCmsAdapter implements CmsAdapter {
  readonly vendor = 'pco' as const;
  constructor(
    private readonly data: {
      people: CmsPerson[];
      households: CmsHousehold[];
      emails: CmsEmail[];
      phones: CmsPhone[];
    },
  ) {}

  async listPeople(): Promise<{
    people: CmsPerson[];
    households: CmsHousehold[];
    emails: CmsEmail[];
    phones: CmsPhone[];
  }> {
    return this.data;
  }
  async listForms(): Promise<CmsForm[]> { return []; }
  async listFormSubmissions(): Promise<CmsFormSubmission[]> { return []; }
  async listDonations(): Promise<CmsDonation[]> { return []; }
  async listCheckIns(): Promise<CmsCheckIn[]> { return []; }
  async getServicePlan(): Promise<CmsServicePlan | null> { return null; }
}

// Fixture people — three records matching the prior fixture shape, now in
// CMS-neutral form. Carter household appears twice (James + Lily Carter),
// Lopez household once (Maria Lopez).
const FIXTURE_PEOPLE: CmsPerson[] = [
  {
    cms_id: '1001',
    first_name: 'Maria',
    last_name: 'Lopez',
    preferred_name: null,
    is_child: false,
    birthdate: '1989-04-12',
    household_id: '7001',
    membership: null,
    status: 'active',
    created_at: '2026-05-12T15:42:11Z',
    updated_at: '2026-05-12T15:42:11Z',
    raw: { name: 'Maria Lopez' },
  },
  {
    cms_id: '1002',
    first_name: 'James',
    last_name: 'Carter',
    preferred_name: 'Jim',
    is_child: false,
    birthdate: '1975-09-03',
    household_id: '7002',
    membership: 'guest',
    status: 'active',
    created_at: '2026-05-12T14:10:00Z',
    updated_at: '2026-05-12T14:10:00Z',
    raw: { name: 'James Carter' },
  },
  {
    cms_id: '1003',
    first_name: 'Lily',
    last_name: 'Carter',
    preferred_name: null,
    is_child: true,
    birthdate: '2017-02-20',
    household_id: '7002',
    membership: null,
    status: 'active',
    created_at: '2026-05-12T14:11:15Z',
    updated_at: '2026-05-12T14:11:15Z',
    raw: { name: 'Lily Carter' },
  },
];

const FIXTURE_HOUSEHOLDS: CmsHousehold[] = [
  {
    cms_id: '7001',
    name: 'Lopez',
    member_count: 1,
    primary_contact_id: '1001',
    raw: {},
  },
  {
    cms_id: '7002',
    name: 'Carter',
    member_count: 2,
    primary_contact_id: '1002',
    raw: {},
  },
];

const FIXTURE_EMAILS: CmsEmail[] = [
  {
    cms_id: '9001',
    person_cms_id: '1001',
    address: 'maria.lopez@example.com',
    location: 'Home',
    is_primary: true,
    blocked: false,
  },
  {
    cms_id: '9002',
    person_cms_id: '1002',
    address: 'jim.carter@example.com',
    location: 'Home',
    is_primary: true,
    blocked: false,
  },
];

const FIXTURE_PHONES: CmsPhone[] = [
  {
    cms_id: '8001',
    person_cms_id: '1001',
    number: '+1-928-555-0142',
    location: 'Mobile',
    is_primary: true,
    carrier: null,
  },
];

function makeFixtureCms(): MockCmsAdapter {
  return new MockCmsAdapter({
    people: FIXTURE_PEOPLE,
    households: FIXTURE_HOUSEHOLDS,
    emails: FIXTURE_EMAILS,
    phones: FIXTURE_PHONES,
  });
}

// ---------------------------------------------------------------------------
// In-memory fake Supabase client (same as before)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runIntakeMirror — cold start', () => {
  let fake: ReturnType<typeof makeFakeDb>;
  let cms: MockCmsAdapter;

  beforeEach(() => {
    fake = makeFakeDb();
    cms = makeFixtureCms();
  });

  it('mirrors people, households, emails, and phones from the CMS into Supabase', async () => {
    const result = await runIntakeMirror(fake.db, cms, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.recordsExamined).toBe(3);
    expect(result.peopleUpserted).toBe(3);
    // Carter household appears twice in people, but only upserted ONCE per poll.
    expect(result.householdsUpserted).toBe(2);
    expect(result.contactsUpserted).toBe(3); // 2 emails + 1 phone
    expect(result.peopleSkippedFlagged).toBe(0);
    expect(result.watermarkBefore).toBeNull();
    expect(result.watermarkAfter).toBe('2026-05-12T15:42:11Z');

    expect(fake.tables['people']).toHaveLength(3);
    expect(fake.tables['households']).toHaveLength(2);
    expect(fake.tables['emails']).toHaveLength(2);
    expect(fake.tables['phone_numbers']).toHaveLength(1);
    expect(fake.tables['poll_watermarks']).toHaveLength(1);
  });

  it('persists the correct person fields (names, household link, child flag)', async () => {
    await runIntakeMirror(fake.db, cms, {
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
    const fake = makeFakeDb({
      poll_watermarks: [
        {
          source: 'cms',
          resource: 'people',
          last_seen_at: '2026-05-12T15:00:00Z',
          last_seen_id: 'prev',
          poll_started_at: '2026-05-12T15:00:00Z',
          poll_completed_at: '2026-05-12T15:00:00Z',
          records_processed: 0,
        },
      ],
    });
    const cms = makeFixtureCms();

    const result = await runIntakeMirror(fake.db, cms, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.peopleUpserted).toBe(1); // Just Maria (15:42)
    expect(fake.tables['people']).toHaveLength(1);
    expect((fake.tables['people']![0] as { pco_id: string }).pco_id).toBe('1001');
  });

  it('does nothing when the watermark is newer than every record', async () => {
    const fake = makeFakeDb({
      poll_watermarks: [
        {
          source: 'cms',
          resource: 'people',
          last_seen_at: '2026-05-13T00:00:00Z',
          last_seen_id: 'newer',
          poll_started_at: '2026-05-13T00:00:00Z',
          poll_completed_at: '2026-05-13T00:00:00Z',
          records_processed: 0,
        },
      ],
    });
    const cms = makeFixtureCms();

    const result = await runIntakeMirror(fake.db, cms, {
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
          notes: null,
          assigned_to: null,
          raised_at: '2026-05-10T00:00:00Z',
          resolved_at: null,
          resolved_by: null,
        },
        {
          id: 'flag-2',
          person_pco_id: '1002', // James — resolved, should NOT be skipped
          notes: null,
          assigned_to: null,
          raised_at: '2026-05-01T00:00:00Z',
          resolved_at: '2026-05-05T00:00:00Z',
          resolved_by: 'staff',
        },
      ],
    });
    const cms = makeFixtureCms();

    const result = await runIntakeMirror(fake.db, cms, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(result.peopleSkippedFlagged).toBe(1);
    expect(result.peopleUpserted).toBe(2); // James and Lily; Maria skipped
    expect(fake.tables['people']!.find((p) => p.pco_id === '1001')).toBeUndefined();
    expect(fake.tables['people']!.find((p) => p.pco_id === '1002')).toBeDefined();
  });
});
