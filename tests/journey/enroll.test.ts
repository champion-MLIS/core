import { describe, it, expect, beforeEach } from 'vitest';

import { enrollGuest } from '../../src/journey/enroll.ts';
import { markJourneyReturned, processReturnSignals } from '../../src/journey/return-detection.ts';
import { TOUCH_TEMPLATE } from '../../src/journey/touch-template.ts';
import type { Db } from '../../src/db/index.ts';

// ---------------------------------------------------------------------------
// In-memory fake Supabase client — supports the chains used by the journey
// modules: select/eq/is/limit/maybeSingle/single, insert(.select.single),
// update(.eq), order, gt, and `await chain` returning all matching rows.
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
    return {
      id: nextUuid(),
      status: row['status'] ?? 'pending',
      is_recovery: row['is_recovery'] ?? false,
      ...row,
    };
  }
  return row;
}

function makeFakeDb(seed: Record<string, Row[]> = {}): {
  db: Db;
  tables: Record<string, Row[]>;
} {
  const tables: Record<string, Row[]> = {
    people: [],
    pastoral_flags: [],
    engagement_signals: [],
    guest_journeys: [],
    touches: [],
    ...seed,
  };

  function from(table: string): unknown {
    const filters: Array<(r: Row) => boolean> = [];
    let limitN: number | null = null;
    let orderCol: { col: string; asc: boolean } | null = null;
    type PendingOp =
      | { kind: 'select' }
      | { kind: 'update'; values: Row };
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
          if (typeof av === 'string' && typeof bv === 'string') {
            return asc ? av.localeCompare(bv) : bv.localeCompare(av);
          }
          if (typeof av === 'number' && typeof bv === 'number') {
            return asc ? av - bv : bv - av;
          }
          return 0;
        });
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      return rows;
    };

    const executeOp = (): { data: Row[]; error: null } => {
      if (pendingOp.kind === 'update') {
        const rows = applyFilters();
        const values = pendingOp.values;
        for (const r of rows) Object.assign(r, values);
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
        // Do NOT clobber a pending mutation. In Supabase, `.update().select()`
        // means "do the update, then return the updated rows." Only set kind
        // to 'select' on a fresh chain (default state).
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
      gt(col: string, val: unknown) {
        filters.push((r) => {
          const v = r[col];
          if (typeof v === 'string' && typeof val === 'string') return v > val;
          if (typeof v === 'number' && typeof val === 'number') return v > val;
          return false;
        });
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
      then(
        onFulfilled: (v: { data: Row[]; error: null }) => unknown,
        onRejected?: (err: unknown) => unknown,
      ) {
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
        const arr = (Array.isArray(values) ? values : [values]).map((r) =>
          applyDefaults(table, r),
        );
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17T18:00:00Z'); // pretend "now"

beforeEach(() => {
  uuidSeq = 0;
});

describe('enrollGuest', () => {
  it('creates a journey and schedules all 8 touches', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', first_name: 'Maria', current_stage: 'guest' }],
    });

    const result = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: 'sig-1',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    expect(result.outcome).toBe('enrolled');
    if (result.outcome !== 'enrolled') throw new Error('unreachable');
    expect(result.touchCount).toBe(8);

    const touches = fake.tables['touches']!;
    expect(touches).toHaveLength(8);

    // Verify each touch maps to the template
    for (const tmpl of TOUCH_TEMPLATE) {
      const row = touches.find((t) => (t['touch_number'] as number) === tmpl.touch_number);
      expect(row, `touch ${tmpl.touch_number}`).toBeDefined();
      expect(row!['kind']).toBe(tmpl.kind);
      expect(row!['owner_role']).toBe(tmpl.owner_role);
      expect(row!['is_recovery']).toBe(tmpl.is_recovery);
    }
  });

  it('schedules touches at the right day offsets from enrollment', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', current_stage: 'guest' }],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    const touches = fake.tables['touches']!;
    for (const tmpl of TOUCH_TEMPLATE) {
      const row = touches.find((t) => t['touch_number'] === tmpl.touch_number)!;
      const scheduled = new Date(row['scheduled_for'] as string);
      const expectedDay = new Date(ANCHOR);
      expectedDay.setUTCDate(expectedDay.getUTCDate() + tmpl.day_offset);
      expect(scheduled.toISOString().slice(0, 10)).toBe(expectedDay.toISOString().slice(0, 10));
    }
  });

  it('is idempotent on re-enroll while a journey is active', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', current_stage: 'guest' }],
    });
    const first = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: 'sig-1',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });
    const second = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: 'sig-2',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    expect(first.outcome).toBe('enrolled');
    expect(second.outcome).toBe('already_active');
    expect(fake.tables['guest_journeys']).toHaveLength(1);
    expect(fake.tables['touches']).toHaveLength(8); // not 16
  });

  it('blocks enrollment when an active pastoral_flag exists', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', current_stage: 'guest' }],
      pastoral_flags: [
        {
          id: 'pf-1',
          person_pco_id: '1001',
          reason: 'sensitive',
          resolved_at: null,
        },
      ],
    });
    const result = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: 'sig-1',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    expect(result.outcome).toBe('blocked_pastoral_flag');
    expect(fake.tables['guest_journeys']).toHaveLength(0);
    expect(fake.tables['touches']).toHaveLength(0);
  });

  it('refuses to enroll someone not yet in the mirror', async () => {
    const fake = makeFakeDb({ people: [] });
    const result = await enrollGuest(fake.db, {
      personPcoId: '9999',
      signalId: 'sig-1',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    expect(result.outcome).toBe('person_not_mirrored');
  });
});

describe('return detection', () => {
  it('markJourneyReturned cancels pending recovery touches but leaves standard touches alone', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', current_stage: 'guest' }],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: 'sig-1',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    const journey = fake.tables['guest_journeys']![0]!;
    const result = await markJourneyReturned(fake.db, {
      journeyId: journey['id'] as string,
      returnedAt: new Date('2026-05-22T18:00:00Z'),
    });

    expect(result.alreadyReturned).toBe(false);
    expect(result.cancelledTouchCount).toBe(3); // touches 6, 7, 8

    const touches = fake.tables['touches']!;
    const recoveryTouches = touches.filter((t) => t['is_recovery'] === true);
    expect(recoveryTouches).toHaveLength(3);
    for (const t of recoveryTouches) {
      expect(t['status']).toBe('na');
      expect(t['notes']).toMatch(/Marked NA due to guest return/);
    }
    const standardTouches = touches.filter((t) => t['is_recovery'] === false);
    for (const t of standardTouches) {
      expect(t['status']).toBe('pending'); // unchanged
    }

    // Journey itself
    const j = fake.tables['guest_journeys']![0]!;
    expect(j['status']).toBe('returned');
    expect(j['returned_at']).toBe('2026-05-22T18:00:00.000Z');
  });

  it('markJourneyReturned is idempotent (alreadyReturned signaled)', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', current_stage: 'guest' }],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: 'sig-1',
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });
    const journey = fake.tables['guest_journeys']![0]!;
    await markJourneyReturned(fake.db, {
      journeyId: journey['id'] as string,
      returnedAt: new Date('2026-05-22T18:00:00Z'),
    });
    const second = await markJourneyReturned(fake.db, {
      journeyId: journey['id'] as string,
      returnedAt: new Date('2026-05-23T18:00:00Z'),
    });
    expect(second.alreadyReturned).toBe(true);
  });

  it('processReturnSignals finds journeys with a service_attendance after enrollment', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', current_stage: 'guest' },
        { pco_id: '1002', current_stage: 'guest' },
      ],
      engagement_signals: [
        // Maria returned on May 22
        {
          id: 'sig-return-1',
          person_pco_id: '1001',
          kind: 'service_attendance',
          occurred_at: '2026-05-22T18:00:00Z',
        },
        // James has only the OLD signal (from enrollment, pre-anchor); no return
      ],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });
    await enrollGuest(fake.db, {
      personPcoId: '1002',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });

    const result = await processReturnSignals(fake.db);
    expect(result.journeysReturned).toBe(1);
    expect(result.touchesCancelled).toBe(3);

    const mariaJ = fake.tables['guest_journeys']!.find((j) => j['person_pco_id'] === '1001')!;
    const jamesJ = fake.tables['guest_journeys']!.find((j) => j['person_pco_id'] === '1002')!;
    expect(mariaJ['status']).toBe('returned');
    expect(jamesJ['status']).toBe('active');
  });
});

describe('end-to-end — Day-14 return cancels remaining recovery touches', () => {
  it('matches the Definition of Done case from the spec', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', current_stage: 'guest' }],
    });

    // Enroll on Day 1
    const enroll = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => ANCHOR,
    });
    expect(enroll.outcome).toBe('enrolled');

    // Pretend touches 1-5 (standard) and touch 6 (recovery) have all
    // completed by Day 14, and touches 7-8 (recovery) are still pending.
    for (const t of fake.tables['touches']!) {
      const num = t['touch_number'] as number;
      if (num <= 6) t['status'] = 'completed';
    }

    // Day 14: guest returns
    const journey = fake.tables['guest_journeys']![0]!;
    const result = await markJourneyReturned(fake.db, {
      journeyId: journey['id'] as string,
      returnedAt: new Date('2026-05-31T18:00:00Z'),
    });

    // Touches 7 and 8 should be 'na' now. Touch 6 was already completed and
    // should NOT be downgraded.
    expect(result.cancelledTouchCount).toBe(2);
    const touches = fake.tables['touches']!;
    const t6 = touches.find((t) => t['touch_number'] === 6)!;
    const t7 = touches.find((t) => t['touch_number'] === 7)!;
    const t8 = touches.find((t) => t['touch_number'] === 8)!;
    expect(t6['status']).toBe('completed'); // unchanged
    expect(t7['status']).toBe('na');
    expect(t8['status']).toBe('na');
  });
});
