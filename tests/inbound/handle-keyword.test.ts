import { describe, it, expect } from 'vitest';

import { handleInboundKeyword, type InboundMessage } from '../../src/inbound/handle-keyword.ts';
import type { Db } from '../../src/db/index.ts';

// ---------------------------------------------------------------------------
// Minimal in-memory fake Db covering exactly the chains the handler uses:
//   .from('inbound_responses').select('id').eq('message_sid', sid).maybeSingle()
//   .from('inbound_responses').insert(row).select('id').single()
// ---------------------------------------------------------------------------

interface FakeInsertError {
  code?: string;
  message: string;
}

function makeFakeDb() {
  const rows: Array<Record<string, unknown>> = [];
  let insertError: FakeInsertError | null = null;

  const db = {
    from(_table: string) {
      return {
        select(_cols?: string) {
          let sid: string | null = null;
          const api = {
            eq(col: string, val: string) {
              if (col === 'message_sid') sid = val;
              return api;
            },
            async maybeSingle() {
              const found = rows.find((r) => r['message_sid'] === sid) ?? null;
              return { data: found ? { id: found['id'] } : null, error: null };
            },
          };
          return api;
        },
        insert(row: Record<string, unknown>) {
          return {
            select(_cols?: string) {
              return {
                async single() {
                  if (insertError) return { data: null, error: insertError };
                  const id = `resp-${rows.length + 1}`;
                  rows.push({ id, ...row });
                  return { data: { id }, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Db;

  return {
    db,
    rows,
    setInsertError(e: FakeInsertError | null) {
      insertError = e;
    },
  };
}

const NEXT = 'https://champion.church/next';

function msg(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    fromPhone: '+19285551234',
    toPhone: '+19282488200',
    body: 'HOME',
    messageSid: 'SM-test-1',
    ...overrides,
  };
}

describe('handleInboundKeyword', () => {
  it('recognizes HOME, queues a callback, and returns the reply', async () => {
    const { db, rows } = makeFakeDb();
    const now = new Date('2026-05-26T18:00:00Z');

    const result = await handleInboundKeyword(db, msg(), { nextStepsUrl: NEXT, now: () => now });

    expect(result.outcome).toBe('recognized');
    if (result.outcome !== 'recognized') throw new Error('expected recognized');
    expect(result.intent).toBe('home');
    expect(result.keyword).toBe('HOME');
    expect(result.reply).toContain('Welcome home');
    expect(result.reply).toContain(NEXT);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row['status']).toBe('needs_callback');
    expect(row['auto_reply_sent']).toBe(true);
    expect(row['keyword']).toBe('HOME');
    expect(row['from_phone']).toBe('+19285551234');
  });

  it('sets callback_due_at to 24 hours after received', async () => {
    const { db, rows } = makeFakeDb();
    const now = new Date('2026-05-26T18:00:00Z');

    await handleInboundKeyword(db, msg(), { nextStepsUrl: NEXT, now: () => now });

    const row = rows[0]!;
    const received = new Date(row['received_at'] as string).getTime();
    const due = new Date(row['callback_due_at'] as string).getTime();
    expect(due - received).toBe(24 * 60 * 60 * 1000);
  });

  it('does not reply or queue for unrecognized text', async () => {
    const { db, rows } = makeFakeDb();
    const result = await handleInboundKeyword(db, msg({ body: 'what time is church?' }), {
      nextStepsUrl: NEXT,
    });
    expect(result.outcome).toBe('unrecognized');
    expect(result.reply).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('treats STOP as unrecognized (Twilio owns it)', async () => {
    const { db, rows } = makeFakeDb();
    const result = await handleInboundKeyword(db, msg({ body: 'STOP' }), { nextStepsUrl: NEXT });
    expect(result.outcome).toBe('unrecognized');
    expect(rows).toHaveLength(0);
  });

  it('is idempotent on a repeated message_sid (Twilio retry)', async () => {
    const { db, rows } = makeFakeDb();

    const first = await handleInboundKeyword(db, msg(), { nextStepsUrl: NEXT });
    const second = await handleInboundKeyword(db, msg(), { nextStepsUrl: NEXT });

    expect(first.outcome).toBe('recognized');
    expect(second.outcome).toBe('recognized_duplicate');
    expect(second.reply).toContain('Welcome home'); // still replies, idempotently
    expect(rows).toHaveLength(1); // only ONE callback queued
  });

  it('treats a unique-violation race as a duplicate, still replying', async () => {
    const { db, setInsertError } = makeFakeDb();
    setInsertError({ code: '23505', message: 'duplicate key value violates unique constraint' });

    const result = await handleInboundKeyword(db, msg(), { nextStepsUrl: NEXT });
    expect(result.outcome).toBe('recognized_duplicate');
    if (result.outcome !== 'recognized_duplicate') throw new Error('expected duplicate');
    expect(result.responseId).toBeNull();
    expect(result.reply).toContain('Welcome home');
  });

  it('throws on a non-unique insert error', async () => {
    const { db, setInsertError } = makeFakeDb();
    setInsertError({ code: '42501', message: 'permission denied' });
    await expect(
      handleInboundKeyword(db, msg(), { nextStepsUrl: NEXT }),
    ).rejects.toThrow(/insert failed/);
  });
});
