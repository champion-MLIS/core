import { describe, it, expect, beforeEach } from 'vitest';

import {
  processInboundResponses,
  type PcoPersonWriter,
} from '../../src/inbound/process-responses.ts';
import type { Db } from '../../src/db/index.ts';

// ---------------------------------------------------------------------------
// In-memory fake Supabase client (adapted from tests/journey/enroll.test.ts,
// extended so the processor + enrollGuest both run against it).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

let uuidSeq = 0;
function nextUuid(): string {
  return `uuid-${++uuidSeq}`;
}

function applyDefaults(table: string, row: Row): Row {
  if (table === 'guest_journeys' && !row['id']) {
    return {
      id: nextUuid(),
      status: row['status'] ?? 'active',
      workflow_version: row['workflow_version'] ?? '21-day-v1',
      enrolled_at: row['enrolled_at'] ?? new Date().toISOString(),
      returned_at: null,
      completed_at: null,
      cancelled_at: null,
      cancel_reason: null,
      notes: null,
      ...row,
    };
  }
  if (table === 'touches' && !row['id']) {
    return { id: nextUuid(), status: row['status'] ?? 'pending', is_recovery: row['is_recovery'] ?? false, ...row };
  }
  if (table === 'engagement_signals' && !row['id']) {
    return { id: nextUuid(), ...row };
  }
  if (table === 'pastoral_flags' && !row['id']) {
    return { id: nextUuid(), resolved_at: null, ...row };
  }
  return row;
}

function makeFakeDb(seed: Record<string, Row[]> = {}): { db: Db; tables: Record<string, Row[]> } {
  const tables: Record<string, Row[]> = {
    people: [],
    pastoral_flags: [],
    engagement_signals: [],
    guest_journeys: [],
    touches: [],
    volunteers: [],
    phone_numbers: [],
    inbound_responses: [],
    ...seed,
  };

  function from(table: string): unknown {
    const filters: Array<(r: Row) => boolean> = [];
    let limitN: number | null = null;
    let orderCol: { col: string; asc: boolean } | null = null;
    type PendingOp = { kind: 'select' } | { kind: 'update'; values: Row };
    let pendingOp: PendingOp = { kind: 'select' };
    let pendingInsertRows: Row[] | null = null;

    const applyFilters = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        const { col, asc } = orderCol;
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (typeof av === 'string' && typeof bv === 'string') return asc ? av.localeCompare(bv) : bv.localeCompare(av);
          if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
          return 0;
        });
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      return rows;
    };

    const executeOp = (): { data: Row[]; error: null } => {
      if (pendingOp.kind === 'update') {
        const rows = applyFilters();
        for (const r of rows) Object.assign(r, pendingOp.values);
        return { data: rows, error: null };
      }
      return { data: applyFilters(), error: null };
    };

    const insertAfterChain = {
      select(_cols?: string) {
        return {
          async single() {
            return { data: pendingInsertRows?.[0] ?? null, error: null };
          },
          async maybeSingle() {
            return { data: pendingInsertRows?.[0] ?? null, error: null };
          },
        };
      },
      then(onFulfilled: (v: { data: Row[]; error: null }) => unknown) {
        onFulfilled({ data: pendingInsertRows ?? [], error: null });
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
      limit(n: number) {
        limitN = n;
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = { col, asc: opts?.ascending !== false };
        return chain;
      },
      async maybeSingle() {
        const { data: rows } = executeOp();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const { data: rows } = executeOp();
        if (rows.length === 0) return { data: null, error: { message: 'no rows' } };
        return { data: rows[0]!, error: null };
      },
      then(onFulfilled: (v: { data: Row[]; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
        try {
          onFulfilled(executeOp());
        } catch (err) {
          if (onRejected) onRejected(err);
          else throw err;
        }
      },
      update(values: Row) {
        pendingOp = { kind: 'update', values };
        return chain;
      },
      insert(values: Row | Row[]) {
        const arr = (Array.isArray(values) ? values : [values]).map((r) => applyDefaults(table, r));
        const existing = tables[table] ?? [];
        for (const r of arr) existing.push(r);
        tables[table] = existing;
        pendingInsertRows = arr;
        return insertAfterChain;
      },
    };
    return chain;
  }

  return { db: { from } as unknown as Db, tables };
}

function makeWriter(): { writer: PcoPersonWriter; calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    writer: {
      async createPersonWithPhone() {
        state.calls++;
        return { pcoId: 'pco-new', phonePcoId: 'ph-new' };
      },
    },
  } as { writer: PcoPersonWriter; calls: number };
}

const NOW = new Date('2026-05-26T18:00:00Z');

function seedResponse(overrides: Partial<Row> = {}): Row {
  return {
    id: 'resp-1',
    from_phone: '+19285551234',
    to_phone: '+19282488200',
    keyword: 'HOME',
    intent: 'home',
    body_raw: 'HOME',
    message_sid: 'SM1',
    status: 'needs_callback',
    received_at: NOW.toISOString(),
    person_pco_id: null,
    processing_started_at: null,
    meta: {},
    ...overrides,
  };
}

beforeEach(() => {
  uuidSeq = 0;
});

describe('processInboundResponses', () => {
  it('is a safe no-op when PCO write is disabled', async () => {
    const fake = makeFakeDb({ inbound_responses: [seedResponse()] });
    const r = await processInboundResponses(fake.db, { pcoWriteEnabled: false, writer: null });

    expect(r.skippedDisabled).toBe(1);
    expect(r.processed).toBe(0);
    expect(fake.tables['people']).toHaveLength(0);
    expect(fake.tables['inbound_responses']![0]!['person_pco_id']).toBeNull();
  });

  it('creates a PCO person, mirrors, signals, and enrolls (Touch 1 skipped)', async () => {
    const fake = makeFakeDb({ inbound_responses: [seedResponse()] });
    const w = makeWriter();

    const r = await processInboundResponses(fake.db, {
      pcoWriteEnabled: true,
      writer: w.writer,
      now: () => NOW,
    });

    expect(w.calls).toBe(1);
    expect(r.pcoCreated).toBe(1);
    expect(r.enrolled).toBe(1);
    expect(r.processed).toBe(1);

    expect(fake.tables['people']!.find((p) => p['pco_id'] === 'pco-new')).toBeDefined();
    expect(fake.tables['phone_numbers']!).toHaveLength(1);
    expect(fake.tables['engagement_signals']!.some((s) => s['kind'] === 'broadcast_response')).toBe(true);
    // Touch 1 skipped → 7 touches.
    expect(fake.tables['touches']!).toHaveLength(7);
    expect(fake.tables['touches']!.find((t) => t['touch_number'] === 1)).toBeUndefined();

    const row = fake.tables['inbound_responses']![0]!;
    expect(row['person_pco_id']).toBe('pco-new');
    expect((row['meta'] as Record<string, unknown>)['processed_at']).toBeTruthy();
  });

  it('links to an existing person by phone without creating in PCO', async () => {
    const fake = makeFakeDb({
      inbound_responses: [seedResponse()],
      people: [{ pco_id: '2001', current_stage: 'guest' }],
      phone_numbers: [{ pco_id: 'p1', person_pco_id: '2001', number: '(928) 555-1234', is_primary: true }],
    });
    const w = makeWriter();

    const r = await processInboundResponses(fake.db, {
      pcoWriteEnabled: true,
      writer: w.writer,
      now: () => NOW,
    });

    expect(w.calls).toBe(0); // dedup hit — no PCO write
    expect(r.linkedExisting).toBe(1);
    expect(r.enrolled).toBe(1);
    expect(fake.tables['inbound_responses']![0]!['person_pco_id']).toBe('2001');
  });

  it('still enrolls when no pastoral_flag is present', async () => {
    // Regression guard: the inbound processor does NOT auto-raise any flag.
    // An ordinary HOME text enrolls normally; only a human-raised
    // pastoral_flag (tested in enroll.test.ts) blocks enrollment.
    const fake = makeFakeDb({
      inbound_responses: [seedResponse({ body_raw: 'HOME just moved to the area' })],
    });
    const w = makeWriter();

    const r = await processInboundResponses(fake.db, {
      pcoWriteEnabled: true,
      writer: w.writer,
      now: () => NOW,
    });

    expect(fake.tables['pastoral_flags']!).toHaveLength(0);
    expect(r.enrolled).toBe(1);
  });

  it('opens the prayer path in parallel when prayer language is present', async () => {
    const fake = makeFakeDb({
      inbound_responses: [seedResponse({ body_raw: 'HOME please pray for my marriage' })],
    });
    const w = makeWriter();

    const r = await processInboundResponses(fake.db, {
      pcoWriteEnabled: true,
      writer: w.writer,
      now: () => NOW,
    });

    expect(r.prayerSignals).toBe(1);
    expect(fake.tables['engagement_signals']!.some((s) => s['kind'] === 'prayer_request')).toBe(true);
    expect(r.enrolled).toBe(1); // prayer doesn't block the journey
  });

  it('skips rows already claimed by another runner (atomic claim)', async () => {
    const fake = makeFakeDb({
      // Simulate another runner having claimed this row already.
      inbound_responses: [seedResponse({ processing_started_at: '2026-05-26T17:59:00Z' })],
    });
    const w = makeWriter();

    const r = await processInboundResponses(fake.db, {
      pcoWriteEnabled: true,
      writer: w.writer,
      now: () => NOW,
    });

    expect(w.calls).toBe(0); // never reached PCO
    expect(r.pcoCreated).toBe(0);
    expect(r.processed).toBe(0);
  });

  it('skips rows already processed (idempotent)', async () => {
    const fake = makeFakeDb({
      inbound_responses: [seedResponse({ person_pco_id: 'pco-x', meta: { processed_at: NOW.toISOString() } })],
    });
    const w = makeWriter();

    const r = await processInboundResponses(fake.db, {
      pcoWriteEnabled: true,
      writer: w.writer,
      now: () => NOW,
    });

    expect(r.examined).toBe(0);
    expect(w.calls).toBe(0);
  });
});
