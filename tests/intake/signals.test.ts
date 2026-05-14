import { describe, it, expect, beforeEach } from 'vitest';

import { PcoClient } from '../../src/pco/client.ts';
import { runSignalsPoll } from '../../src/intake/signals.ts';
import { classifyForm } from '../../src/intake/signal-classifier.ts';
import type { Db } from '../../src/db/index.ts';

// ---------------------------------------------------------------------------
// In-memory fake Supabase client — extended from the intake mirror test to
// support insert() and the additional chains the signal poller uses.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

let uuidCounter = 0;
function nextUuid(): string {
  return `uuid-${++uuidCounter}`;
}

function makeFakeDb(seed: Record<string, Row[]> = {}): {
  db: Db;
  tables: Record<string, Row[]>;
} {
  const tables: Record<string, Row[]> = {
    people: [],
    pastoral_flags: [],
    engagement_signals: [],
    followup_queue: [],
    poll_watermarks: [],
    ...seed,
  };

  function applyDefaults(table: string, row: Row): Row {
    if (table === 'engagement_signals' && !row['id']) {
      return { ...row, id: nextUuid(), observed_at: new Date().toISOString() };
    }
    if (table === 'followup_queue' && !row['id']) {
      return {
        ...row,
        id: nextUuid(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 86_400_000).toISOString(),
      };
    }
    return row;
  }

  function from(table: string): unknown {
    const filters: Array<(r: Row) => boolean> = [];
    let pendingInsertRows: Row[] = [];

    const terminal = {
      async maybeSingle() {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (rows.length === 0) return { data: null, error: { message: 'no rows' } };
        return { data: rows[0]!, error: null };
      },
    };

    const insertAfterChain = {
      select(_cols?: string) {
        // After insert().select(), we need a .single() that returns the inserted row.
        return {
          async single() {
            return { data: pendingInsertRows[0] ?? null, error: null };
          },
          async maybeSingle() {
            return { data: pendingInsertRows[0] ?? null, error: null };
          },
        };
      },
    };

    const chain: Record<string, unknown> = {
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
      maybeSingle: terminal.maybeSingle,
      single: terminal.single,
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
            existing.push(applyDefaults(table, row));
          }
        }
        tables[table] = existing;
        return { data: arr, error: null };
      },
      insert(values: Row | Row[]) {
        const arr = (Array.isArray(values) ? values : [values]).map((r) =>
          applyDefaults(table, r),
        );
        const existing = tables[table] ?? [];
        for (const r of arr) existing.push(r);
        tables[table] = existing;
        pendingInsertRows = arr;
        // Allow .select(...).single() to follow.
        return insertAfterChain;
      },
    };
    return chain;
  }

  return { db: { from } as unknown as Db, tables };
}

// ---------------------------------------------------------------------------
// PCO client stub for forms + submissions
// ---------------------------------------------------------------------------

interface FormFixture {
  id: string;
  name: string;
}

interface SubmissionFixture {
  id: string;
  formId: string;
  personId: string | null;
  createdAt: string;
}

function makePcoClient(forms: FormFixture[], submissions: SubmissionFixture[]): PcoClient {
  return new PcoClient({
    appId: 'x',
    secret: 'y',
    maxRetries: 0,
    fetchImpl: (async (url: string) => {
      const u = new URL(url);
      if (u.pathname === '/people/v2/forms') {
        return new Response(
          JSON.stringify({
            data: forms.map((f) => ({
              type: 'Form',
              id: f.id,
              attributes: {
                name: f.name,
                active: true,
                archived: false,
                archived_at: null,
                deleted_at: null,
                submission_count: submissions.filter((s) => s.formId === f.id).length,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      const m = u.pathname.match(/^\/people\/v2\/forms\/([^/]+)\/form_submissions$/);
      if (m) {
        const formId = m[1]!;
        const matching = submissions.filter((s) => s.formId === formId);
        return new Response(
          JSON.stringify({
            data: matching.map((s) => ({
              type: 'FormSubmission',
              id: s.id,
              attributes: {
                created_at: s.createdAt,
                updated_at: s.createdAt,
                verified: true,
              },
              relationships: {
                person: { data: s.personId ? { type: 'Person', id: s.personId } : null },
              },
            })),
            included: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classifyForm', () => {
  beforeEach(() => {
    delete process.env['PCO_CONNECT_CARD_FORM_IDS'];
    delete process.env['PCO_PRAYER_REQUEST_FORM_IDS'];
  });

  it('recognizes the Champion form "New Here" as a connect card', () => {
    expect(classifyForm('339647', 'New Here')).toBe('connect_card');
  });

  it('matches common connect-card naming variations', () => {
    expect(classifyForm('1', 'Connect Card')).toBe('connect_card');
    expect(classifyForm('2', 'Welcome Card')).toBe('connect_card');
    expect(classifyForm('3', 'I\'m New')).toBe('connect_card');
    expect(classifyForm('4', 'First-time Guest')).toBe('connect_card');
  });

  it('matches prayer-request variations', () => {
    expect(classifyForm('1', 'Prayer Request')).toBe('prayer_request');
    expect(classifyForm('2', 'Pray For Me')).toBe('prayer_request');
  });

  it('returns "none" for downstream-stage forms', () => {
    expect(classifyForm('1', 'Growth Track')).toBe('none');
    expect(classifyForm('2', 'Baptism')).toBe('none');
    expect(classifyForm('3', 'Join the Dream Team')).toBe('none');
    expect(classifyForm('4', 'Life Groups')).toBe('none');
    expect(classifyForm('5', 'Yes to Jesus')).toBe('none');
  });

  it('honors PCO_CONNECT_CARD_FORM_IDS override', () => {
    process.env['PCO_CONNECT_CARD_FORM_IDS'] = '999,1000';
    expect(classifyForm('999', 'Some Unrelated Name')).toBe('connect_card');
    expect(classifyForm('1234', 'Some Unrelated Name')).toBe('none');
  });
});

describe('runSignalsPoll — happy path', () => {
  beforeEach(() => {
    delete process.env['PCO_CONNECT_CARD_FORM_IDS'];
    delete process.env['PCO_PRAYER_REQUEST_FORM_IDS'];
    uuidCounter = 0;
  });

  it('records signals and enqueues followups for guests with new submissions', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', first_name: 'Maria', current_stage: 'guest' },
        { pco_id: '1002', first_name: 'James', current_stage: 'guest' },
      ],
    });
    const pco = makePcoClient(
      [
        { id: '339647', name: 'New Here' },
        { id: '616018', name: 'Life Groups' }, // not a trigger — should be ignored
      ],
      [
        { id: 'sub-1', formId: '339647', personId: '1001', createdAt: '2026-05-12T14:00:00Z' },
        { id: 'sub-2', formId: '339647', personId: '1002', createdAt: '2026-05-12T15:00:00Z' },
        { id: 'sub-3', formId: '616018', personId: '1001', createdAt: '2026-05-13T10:00:00Z' },
      ],
    );

    const r = await runSignalsPoll(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(r.formsExamined).toBe(2);
    expect(r.formsWithSignals).toBe(1); // only "New Here"
    expect(r.signalsRecorded).toBe(2);
    expect(r.followupsEnqueued).toBe(2);
    expect(fake.tables['engagement_signals']).toHaveLength(2);
    expect(fake.tables['followup_queue']).toHaveLength(2);
    expect(fake.tables['poll_watermarks']).toHaveLength(1);

    const watermark = fake.tables['poll_watermarks']![0] as { resource: string; last_seen_at: string };
    expect(watermark.resource).toBe('form:339647');
    expect(watermark.last_seen_at).toBe('2026-05-12T15:00:00Z');
  });

  it('skips submissions for people not yet in the mirror', async () => {
    const fake = makeFakeDb({ people: [] }); // empty mirror
    const pco = makePcoClient(
      [{ id: '339647', name: 'New Here' }],
      [
        { id: 'sub-1', formId: '339647', personId: '1001', createdAt: '2026-05-12T14:00:00Z' },
      ],
    );

    const r = await runSignalsPoll(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(r.signalsRecorded).toBe(0);
    expect(r.peopleSkippedNotMirrored).toBe(1);
    expect(fake.tables['engagement_signals']).toHaveLength(0);
    expect(fake.tables['poll_watermarks']).toHaveLength(0); // watermark NOT advanced
  });

  it('skips submissions for people with active pastoral flags', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', first_name: 'Maria', current_stage: 'guest' }],
      pastoral_flags: [
        {
          id: 'flag-1',
          person_pco_id: '1001',
          reason: 'sensitive',
          resolved_at: null,
        },
      ],
    });
    const pco = makePcoClient(
      [{ id: '339647', name: 'New Here' }],
      [{ id: 'sub-1', formId: '339647', personId: '1001', createdAt: '2026-05-12T14:00:00Z' }],
    );

    const r = await runSignalsPoll(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(r.peopleSkippedFlagged).toBe(1);
    expect(r.signalsRecorded).toBe(0);
    expect(r.followupsEnqueued).toBe(0);
  });

  it('records signal but skips followup if person is past the guest stage', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', first_name: 'Maria', current_stage: 'connected' }],
    });
    const pco = makePcoClient(
      [{ id: '339647', name: 'New Here' }],
      [{ id: 'sub-1', formId: '339647', personId: '1001', createdAt: '2026-05-12T14:00:00Z' }],
    );

    const r = await runSignalsPoll(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });

    expect(r.signalsRecorded).toBe(1); // signal still recorded for audit trail
    expect(r.followupsEnqueued).toBe(0); // but no followup
    expect(r.byForm[0]!.peopleSkippedNotGuest).toBe(1);
  });
});

describe('runSignalsPoll — idempotency', () => {
  beforeEach(() => {
    uuidCounter = 0;
  });

  it('produces zero new work on a re-run', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', first_name: 'Maria', current_stage: 'guest' }],
    });
    const pco = makePcoClient(
      [{ id: '339647', name: 'New Here' }],
      [{ id: 'sub-1', formId: '339647', personId: '1001', createdAt: '2026-05-12T14:00:00Z' }],
    );

    const first = await runSignalsPoll(fake.db, pco, {
      now: () => new Date('2026-05-13T18:00:00Z'),
    });
    expect(first.signalsRecorded).toBe(1);
    expect(first.followupsEnqueued).toBe(1);

    const second = await runSignalsPoll(fake.db, pco, {
      now: () => new Date('2026-05-13T18:05:00Z'),
    });
    // Watermark is now at sub-1's timestamp, so the submission is filtered out
    // before it even reaches the per-record logic.
    expect(second.signalsRecorded).toBe(0);
    expect(second.followupsEnqueued).toBe(0);
    expect(fake.tables['engagement_signals']).toHaveLength(1);
    expect(fake.tables['followup_queue']).toHaveLength(1);
  });
});
