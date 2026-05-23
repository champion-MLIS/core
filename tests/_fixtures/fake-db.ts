/**
 * Shared in-memory fake of the Supabase client for tests.
 *
 * Supports the chains we actually use across the codebase:
 *   .select(...).eq(...).is(...).in(...).gt/gte/lt/lte(...).order(...).limit(...).maybeSingle()/single()
 *   .insert(...).select(...).single()
 *   .update(...).eq(...).select(...) (returns updated rows)
 *   thenable bare chain (await on filter chain returns all rows)
 *
 * Each test file constructs its own fake with a seed map of {table: rows[]}.
 */

import type { Db } from '../../src/db/index.ts';

type Row = Record<string, unknown>;

let uuidSeq = 0;
export function nextUuid(): string {
  return `uuid-${++uuidSeq}`;
}

export function resetUuids(): void {
  uuidSeq = 0;
}

function applyDefaults(table: string, row: Row): Row {
  const r: Row = { ...row };
  if (!r['id'] && table !== 'people' && table !== 'households' && table !== 'staff_profiles') {
    r['id'] = nextUuid();
  }
  if (table === 'guest_journeys') {
    r['status'] = r['status'] ?? 'active';
    r['workflow_version'] = r['workflow_version'] ?? '21-day-v1';
    r['enrolled_at'] = r['enrolled_at'] ?? new Date().toISOString();
    r['returned_at'] = r['returned_at'] ?? null;
    r['completed_at'] = r['completed_at'] ?? null;
    r['cancelled_at'] = r['cancelled_at'] ?? null;
    r['cancel_reason'] = r['cancel_reason'] ?? null;
    r['notes'] = r['notes'] ?? null;
    r['assigned_connections_volunteer_id'] = r['assigned_connections_volunteer_id'] ?? null;
    r['assigned_lay_volunteer_id'] = r['assigned_lay_volunteer_id'] ?? null;
  }
  if (table === 'touches') {
    r['status'] = r['status'] ?? 'pending';
    r['is_recovery'] = r['is_recovery'] ?? false;
    r['is_contextual_reference'] = r['is_contextual_reference'] ?? false;
    r['held_pending_data_at'] = r['held_pending_data_at'] ?? null;
    r['held_pending_data_reason'] = r['held_pending_data_reason'] ?? null;
    r['payload'] = r['payload'] ?? {};
    r['owner_user_id'] = r['owner_user_id'] ?? null;
  }
  if (table === 'volunteers') {
    r['current_load'] = r['current_load'] ?? 0;
    r['is_active'] = r['is_active'] ?? true;
    r['created_at'] = r['created_at'] ?? new Date().toISOString();
    r['email'] = r['email'] ?? null;
    r['user_id'] = r['user_id'] ?? null;
    r['person_pco_id'] = r['person_pco_id'] ?? null;
  }
  if (table === 'prayer_requests') {
    r['status'] = r['status'] ?? 'open';
    r['captured_at'] = r['captured_at'] ?? new Date().toISOString();
    r['acknowledged_at'] = r['acknowledged_at'] ?? null;
    r['acknowledgment_text'] = r['acknowledgment_text'] ?? null;
    r['pcpoc_responded_at'] = r['pcpoc_responded_at'] ?? null;
    r['pcpoc_response_notes'] = r['pcpoc_response_notes'] ?? null;
    r['escalated_at'] = r['escalated_at'] ?? null;
    r['assigned_to'] = r['assigned_to'] ?? null;
    r['source_signal_id'] = r['source_signal_id'] ?? null;
  }
  if (table === 'engagement_signals') {
    r['payload'] = r['payload'] ?? {};
    r['observed_at'] = r['observed_at'] ?? r['occurred_at'] ?? new Date().toISOString();
  }
  if (table === 'pastoral_flags') {
    r['resolved_at'] = r['resolved_at'] ?? null;
    r['raised_at'] = r['raised_at'] ?? new Date().toISOString();
    r['assigned_to'] = r['assigned_to'] ?? null;
    r['resolved_by'] = r['resolved_by'] ?? null;
  }
  if (table === 'people') {
    r['precious_cargo_refs'] = r['precious_cargo_refs'] ?? [];
    r['preferred_name'] = r['preferred_name'] ?? null;
    r['first_name'] = r['first_name'] ?? null;
    r['last_name'] = r['last_name'] ?? null;
    r['household_pco_id'] = r['household_pco_id'] ?? null;
    r['is_child'] = r['is_child'] ?? null;
    r['birthdate'] = r['birthdate'] ?? null;
    r['first_visit_date'] = r['first_visit_date'] ?? null;
    r['current_stage'] = r['current_stage'] ?? 'guest';
  }
  return r;
}

export function makeFakeDb(seed: Record<string, Row[]> = {}): {
  db: Db;
  tables: Record<string, Row[]>;
} {
  const tables: Record<string, Row[]> = {
    people: [],
    households: [],
    emails: [],
    phone_numbers: [],
    pastoral_flags: [],
    engagement_signals: [],
    guest_journeys: [],
    touches: [],
    volunteers: [],
    staff_profiles: [],
    prayer_requests: [],
    followup_queue: [],
    communications: [],
    ...seed,
  };

  function from(table: string): unknown {
    const filters: Array<(r: Row) => boolean> = [];
    let limitN: number | null = null;
    const orderCols: Array<{ col: string; asc: boolean }> = [];
    type PendingOp =
      | { kind: 'select' }
      | { kind: 'update'; values: Row };
    let pendingOp: PendingOp = { kind: 'select' };
    let pendingInsertRows: Row[] | null = null;

    const applyFilters = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      for (const ord of orderCols) {
        const { col, asc } = ord;
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (av === null || av === undefined) return asc ? -1 : 1;
          if (bv === null || bv === undefined) return asc ? 1 : -1;
          if (typeof av === 'boolean' && typeof bv === 'boolean') {
            return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
          }
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
      in(col: string, vals: unknown[]) {
        const set = new Set(vals);
        filters.push((r) => set.has(r[col]));
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
      gte(col: string, val: unknown) {
        filters.push((r) => {
          const v = r[col];
          if (typeof v === 'string' && typeof val === 'string') return v >= val;
          if (typeof v === 'number' && typeof val === 'number') return v >= val;
          return false;
        });
        return chain;
      },
      lt(col: string, val: unknown) {
        filters.push((r) => {
          const v = r[col];
          if (typeof v === 'string' && typeof val === 'string') return v < val;
          if (typeof v === 'number' && typeof val === 'number') return v < val;
          return false;
        });
        return chain;
      },
      lte(col: string, val: unknown) {
        filters.push((r) => {
          const v = r[col];
          if (typeof v === 'string' && typeof val === 'string') return v <= val;
          if (typeof v === 'number' && typeof val === 'number') return v <= val;
          return false;
        });
        return chain;
      },
      not(col: string, op: string, val: unknown) {
        filters.push((r) => {
          if (op === 'in') {
            const parsed = parseInList(val);
            return !parsed.includes(r[col] as string);
          }
          return r[col] !== val;
        });
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return chain;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCols.push({ col, asc: opts?.ascending !== false });
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

function parseInList(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    // Supabase serializes "in" filters as "(a,b,c)" sometimes.
    return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
  }
  return [];
}
