import { describe, it, expect, beforeEach } from 'vitest';

import type { ClaudeClient, ClaudeRequest, ClaudeResponse } from '../../src/agent/claude.ts';
import { runFollowUpAgent } from '../../src/agent/follow-up.ts';
import { generateDraft } from '../../src/agent/draft.ts';
import { checkVoice } from '../../src/agent/voice-check.ts';
import { _setVoiceRulesForTesting } from '../../src/agent/voice-rules.ts';
import type { Db } from '../../src/db/index.ts';
import type { ChampionLinks } from '../../src/agent/links.ts';

// ---------------------------------------------------------------------------
// Fake Db — reuses the pattern from intake tests, extends with .update() and
// .order().
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeFakeDb(seed: Record<string, Row[]> = {}): {
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
    followup_queue: [],
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

    const applyFilters = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        const { col, asc } = orderCol;
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (typeof av === 'boolean' && typeof bv === 'boolean') {
            return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
          }
          if (typeof av === 'string' && typeof bv === 'string') {
            return asc ? av.localeCompare(bv) : bv.localeCompare(av);
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
      // select (default)
      return { data: applyFilters(), error: null };
    };

    const chain: Record<string, unknown> = {
      select(_cols?: string) {
        pendingOp = { kind: 'select' };
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
    };
    return chain;
  }

  return { db: { from } as unknown as Db, tables };
}

// ---------------------------------------------------------------------------
// Stub ClaudeClient — script the responses
// ---------------------------------------------------------------------------

interface ScriptedResponse {
  match: (req: ClaudeRequest) => boolean;
  response: Partial<ClaudeResponse> & { text: string };
}

function makeStubClaude(scripts: ScriptedResponse[]): {
  client: ClaudeClient;
  calls: ClaudeRequest[];
} {
  const calls: ClaudeRequest[] = [];
  return {
    client: {
      async generate(req: ClaudeRequest): Promise<ClaudeResponse> {
        calls.push(req);
        const match = scripts.find((s) => s.match(req));
        if (!match) {
          throw new Error(
            `No stub script matched request to model=${req.model}.\nUser msg starts with: ${req.userMessage.slice(0, 100)}`,
          );
        }
        return {
          text: match.response.text,
          inputTokens: match.response.inputTokens ?? 100,
          outputTokens: match.response.outputTokens ?? 50,
          stopReason: match.response.stopReason ?? 'end_turn',
        };
      },
    },
    calls,
  };
}

const FAKE_VOICE_RULES = '# Champion voice — abbreviated for tests';
const TEST_LINKS: ChampionLinks = {
  website: 'https://test.example/',
  kids: 'https://test.example/kids',
  groups: 'https://test.example/groups',
  growthTrack: 'https://test.example/growth-track',
};

beforeEach(() => {
  _setVoiceRulesForTesting(FAKE_VOICE_RULES);
});

// ---------------------------------------------------------------------------
// generateDraft — unit
// ---------------------------------------------------------------------------

describe('generateDraft', () => {
  it('parses a clean JSON response into a typed draft', async () => {
    const { client } = makeStubClaude([
      {
        match: () => true,
        response: {
          text: JSON.stringify({
            email: { subject: 'Great to meet you, Maria 👋', body: 'Maria, glad you came.' },
            sms: { body: 'Hey Maria! Glad you joined us.' },
            voice_notes: 'Used preferred name, no pressure.',
          }),
        },
      },
    ]);

    const result = await generateDraft(
      client,
      {
        name: 'Maria',
        fullName: 'Maria Lopez',
        hasEmail: true,
        hasSms: true,
        triggerKind: 'connect_card',
        triggerDate: '2026-05-12T15:00:00Z',
        householdHasChildren: false,
        isChild: false,
      },
      TEST_LINKS,
      FAKE_VOICE_RULES,
      'claude-sonnet-4-6',
    );

    expect(result.draft.email?.subject).toContain('Maria');
    expect(result.draft.sms?.body).toContain('Maria');
  });

  it('strips ```json fences if Claude returns them', async () => {
    const { client } = makeStubClaude([
      {
        match: () => true,
        response: {
          text: '```json\n{"email":{"subject":"hi","body":"hi"},"sms":null,"voice_notes":"ok"}\n```',
        },
      },
    ]);
    const result = await generateDraft(
      client,
      {
        name: 'X',
        fullName: 'X',
        hasEmail: true,
        hasSms: false,
        triggerKind: 'connect_card',
        triggerDate: '2026-05-12T15:00:00Z',
        householdHasChildren: false,
        isChild: false,
      },
      TEST_LINKS,
      FAKE_VOICE_RULES,
      'claude-sonnet-4-6',
    );
    expect(result.draft.email?.subject).toBe('hi');
  });

  it('throws when no channels are available', async () => {
    const { client } = makeStubClaude([]);
    await expect(
      generateDraft(
        client,
        {
          name: 'X',
          fullName: 'X',
          hasEmail: false,
          hasSms: false,
          triggerKind: 'connect_card',
          triggerDate: '2026-05-12T15:00:00Z',
          householdHasChildren: false,
          isChild: false,
        },
        TEST_LINKS,
        FAKE_VOICE_RULES,
        'claude-sonnet-4-6',
      ),
    ).rejects.toThrow(/at least one channel/i);
  });

  it('throws if Claude returns unparseable JSON', async () => {
    const { client } = makeStubClaude([
      { match: () => true, response: { text: 'not json' } },
    ]);
    await expect(
      generateDraft(
        client,
        {
          name: 'X',
          fullName: 'X',
          hasEmail: true,
          hasSms: false,
          triggerKind: 'connect_card',
          triggerDate: '2026-05-12T15:00:00Z',
          householdHasChildren: false,
          isChild: false,
        },
        TEST_LINKS,
        FAKE_VOICE_RULES,
        'claude-sonnet-4-6',
      ),
    ).rejects.toThrow(/not valid JSON/);
  });
});

// ---------------------------------------------------------------------------
// checkVoice — unit
// ---------------------------------------------------------------------------

describe('checkVoice', () => {
  it('parses a passing voice check', async () => {
    const { client } = makeStubClaude([
      {
        match: () => true,
        response: {
          text: JSON.stringify({
            warm_personal: { pass: true, note: 'felt human' },
            zero_pressure: { pass: true, note: 'no obligation' },
            sounds_like_champion: { pass: true, note: 'matches the standard' },
            overall: 'pass',
            concerns: [],
          }),
        },
      },
    ]);
    const result = await checkVoice(
      client,
      { email: { subject: 'hi', body: 'hello there' }, sms: null, voice_notes: 'x' },
      FAKE_VOICE_RULES,
      'claude-haiku-4-5-20251001',
    );
    expect(result.check.overall).toBe('pass');
    expect(result.check.concerns).toEqual([]);
  });

  it('parses a failing voice check with concerns', async () => {
    const { client } = makeStubClaude([
      {
        match: () => true,
        response: {
          text: JSON.stringify({
            warm_personal: { pass: true, note: 'fine' },
            zero_pressure: { pass: false, note: 'says "you should"' },
            sounds_like_champion: { pass: false, note: 'sounds corporate' },
            overall: 'fail',
            concerns: ['Drop the "you should" phrasing.', 'Soften the closing line.'],
          }),
        },
      },
    ]);
    const result = await checkVoice(
      client,
      { email: { subject: 'hi', body: 'you should come' }, sms: null, voice_notes: 'x' },
      FAKE_VOICE_RULES,
      'claude-haiku-4-5-20251001',
    );
    expect(result.check.overall).toBe('fail');
    expect(result.check.concerns).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// runFollowUpAgent — integration
// ---------------------------------------------------------------------------

function happyDraftResponse(name: string): string {
  return JSON.stringify({
    email: {
      subject: `Great to meet you, ${name} 👋`,
      body: `${name}, so glad you joined us. There's a place here for you.\n\nSee you soon,\nChampion Church`,
    },
    sms: { body: `Hey ${name}! Glad you joined us Sunday. 🙌` },
    voice_notes: 'Used preferred name, kept warm and pressure-free.',
  });
}

function passingVoiceCheck(): string {
  return JSON.stringify({
    warm_personal: { pass: true, note: 'feels human' },
    zero_pressure: { pass: true, note: 'no obligation language' },
    sounds_like_champion: { pass: true, note: 'on tone' },
    overall: 'pass',
    concerns: [],
  });
}

describe('runFollowUpAgent — orchestrator', () => {
  it('drafts a follow-up and marks the queue row awaiting_approval', async () => {
    const fake = makeFakeDb({
      people: [
        {
          pco_id: '1001',
          first_name: 'Maria',
          last_name: 'Lopez',
          preferred_name: null,
          household_pco_id: null,
          is_child: false,
          current_stage: 'guest',
        },
      ],
      emails: [
        {
          pco_id: 'e1',
          person_pco_id: '1001',
          address: 'maria@example.com',
          is_primary: true,
          blocked: false,
        },
      ],
      followup_queue: [
        {
          id: 'q1',
          person_pco_id: '1001',
          workflow: 'guest-follow-up',
          trigger_signal_id: null,
          status: 'pending',
          payload: {},
          created_at: '2026-05-12T15:00:00Z',
        },
      ],
    });

    const { client } = makeStubClaude([
      {
        match: (r) => r.model === 'claude-sonnet-4-6',
        response: { text: happyDraftResponse('Maria') },
      },
      {
        match: (r) => r.model === 'claude-haiku-4-5-20251001',
        response: { text: passingVoiceCheck() },
      },
    ]);

    const result = await runFollowUpAgent(fake.db, client, {
      draftModel: 'claude-sonnet-4-6',
      voiceCheckModel: 'claude-haiku-4-5-20251001',
      links: TEST_LINKS,
      batchSize: 10,
    });

    expect(result.itemsExamined).toBe(1);
    expect(result.drafted).toBe(1);
    expect(result.held).toBe(0);
    expect(result.skippedNoContact).toBe(0);

    const updated = fake.tables['followup_queue']![0]!;
    expect(updated['status']).toBe('awaiting_approval');
    const payload = updated['payload'] as Record<string, unknown>;
    expect(payload).toHaveProperty('draft');
    expect(payload).toHaveProperty('voice_check');
  });

  it('marks a row "held" when the voice check fails', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', first_name: 'Maria', current_stage: 'guest', household_pco_id: null, is_child: false },
      ],
      emails: [{ pco_id: 'e1', person_pco_id: '1001', address: 'm@x.com', is_primary: true, blocked: false }],
      followup_queue: [
        {
          id: 'q1',
          person_pco_id: '1001',
          workflow: 'guest-follow-up',
          status: 'pending',
          trigger_signal_id: null,
          payload: {},
          created_at: '2026-05-12T15:00:00Z',
        },
      ],
    });
    const { client } = makeStubClaude([
      { match: (r) => r.model === 'claude-sonnet-4-6', response: { text: happyDraftResponse('Maria') } },
      {
        match: (r) => r.model === 'claude-haiku-4-5-20251001',
        response: {
          text: JSON.stringify({
            warm_personal: { pass: true, note: '' },
            zero_pressure: { pass: false, note: 'uses pressure' },
            sounds_like_champion: { pass: true, note: '' },
            overall: 'fail',
            concerns: ['Remove "you should".'],
          }),
        },
      },
    ]);

    const result = await runFollowUpAgent(fake.db, client, {
      draftModel: 'claude-sonnet-4-6',
      voiceCheckModel: 'claude-haiku-4-5-20251001',
      links: TEST_LINKS,
    });

    expect(result.drafted).toBe(0);
    expect(result.held).toBe(1);
    expect(fake.tables['followup_queue']![0]!['status']).toBe('held');
  });

  it('overrides when the person has an active pastoral_flag', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', first_name: 'Maria', current_stage: 'guest', household_pco_id: null, is_child: false },
      ],
      pastoral_flags: [
        { id: 'pf-1', person_pco_id: '1001', resolved_at: null },
      ],
      followup_queue: [
        {
          id: 'q1',
          person_pco_id: '1001',
          workflow: 'guest-follow-up',
          status: 'pending',
          trigger_signal_id: null,
          payload: {},
          created_at: '2026-05-12T15:00:00Z',
        },
      ],
    });
    const { client, calls } = makeStubClaude([]); // no Claude calls expected

    const result = await runFollowUpAgent(fake.db, client, {
      draftModel: 'claude-sonnet-4-6',
      voiceCheckModel: 'claude-haiku-4-5-20251001',
      links: TEST_LINKS,
    });

    expect(result.overridden).toBe(1);
    expect(result.drafted).toBe(0);
    expect(calls).toHaveLength(0); // pastoral flag short-circuits before Claude
    expect(fake.tables['followup_queue']![0]!['status']).toBe('overridden');
  });

  it('skips with no_contact when person has no email and no phone', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', first_name: 'Maria', current_stage: 'guest', household_pco_id: null, is_child: false },
      ],
      // no emails, no phones
      followup_queue: [
        {
          id: 'q1',
          person_pco_id: '1001',
          workflow: 'guest-follow-up',
          status: 'pending',
          trigger_signal_id: null,
          payload: {},
          created_at: '2026-05-12T15:00:00Z',
        },
      ],
    });
    const { client, calls } = makeStubClaude([]);

    const result = await runFollowUpAgent(fake.db, client, {
      draftModel: 'claude-sonnet-4-6',
      voiceCheckModel: 'claude-haiku-4-5-20251001',
      links: TEST_LINKS,
    });

    expect(result.skippedNoContact).toBe(1);
    expect(calls).toHaveLength(0);
    expect(fake.tables['followup_queue']![0]!['status']).toBe('held');
    const payload = fake.tables['followup_queue']![0]!['payload'] as Record<string, unknown>;
    expect(payload['reason']).toBe('no_contact_info');
  });

  it('dry-run does not mutate the queue row', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', first_name: 'Maria', current_stage: 'guest', household_pco_id: null, is_child: false },
      ],
      emails: [{ pco_id: 'e1', person_pco_id: '1001', address: 'm@x.com', is_primary: true, blocked: false }],
      followup_queue: [
        {
          id: 'q1',
          person_pco_id: '1001',
          workflow: 'guest-follow-up',
          status: 'pending',
          trigger_signal_id: null,
          payload: {},
          created_at: '2026-05-12T15:00:00Z',
        },
      ],
    });
    const { client } = makeStubClaude([
      { match: (r) => r.model === 'claude-sonnet-4-6', response: { text: happyDraftResponse('Maria') } },
      { match: (r) => r.model === 'claude-haiku-4-5-20251001', response: { text: passingVoiceCheck() } },
    ]);

    const result = await runFollowUpAgent(fake.db, client, {
      draftModel: 'claude-sonnet-4-6',
      voiceCheckModel: 'claude-haiku-4-5-20251001',
      links: TEST_LINKS,
      dryRun: true,
    });

    expect(result.drafted).toBe(1);
    // Original queue row unchanged
    expect(fake.tables['followup_queue']![0]!['status']).toBe('pending');
  });
});
