import { describe, it, expect, beforeEach } from 'vitest';
import {
  scanForConstraintViolations,
  insertContextualReferenceTouch,
  runEscalationCheck,
  type Sender,
  type AckDraft,
} from '../../src/agent/prayer-response/index.ts';
import type { EngagementSignalRow } from '../../src/db/index.ts';
import { processPrayerSignal } from '../../src/agent/prayer-response/orchestrator.ts';
import type { ClaudeClient, ClaudeRequest, ClaudeResponse } from '../../src/agent/claude.ts';
import { _setVoiceRulesForTesting } from '../../src/agent/voice-rules.ts';
import { makeFakeDb, resetUuids } from '../_fixtures/fake-db.ts';
import { enrollGuest } from '../../src/journey/enroll.ts';

const FAKE_VOICE_RULES = '# voice rules (test)';
const NOW = new Date('2026-05-22T15:00:00Z');

beforeEach(() => {
  resetUuids();
  _setVoiceRulesForTesting(FAKE_VOICE_RULES);
});

// ---------------------------------------------------------------------------
// scanForConstraintViolations — pure
// ---------------------------------------------------------------------------

function ackDraft(partial: Partial<AckDraft>): AckDraft {
  return {
    email: null,
    sms: null,
    voice_notes: '',
    ...partial,
  };
}

describe('scanForConstraintViolations', () => {
  it('returns empty for a clean acknowledgment', () => {
    const concerns = scanForConstraintViolations(
      ackDraft({
        sms: {
          body: 'Hi Maria — we received what you shared. Becky will be in touch personally within 24 hours. —Champion Church',
        },
      }),
    );
    expect(concerns).toHaveLength(0);
  });

  it('flags URLs', () => {
    const concerns = scanForConstraintViolations(
      ackDraft({
        sms: { body: 'Thanks. Becky will reach out. https://champion.church/help' },
      }),
    );
    expect(concerns.some((c) => c.includes('URL'))).toBe(true);
  });

  it('flags scripture references (chapter:verse)', () => {
    const concerns = scanForConstraintViolations(
      ackDraft({
        email: {
          subject: 'We received your request',
          body: 'Thanks. Psalm 23:4 has been a comfort to many.',
        },
      }),
    );
    expect(concerns.some((c) => c.toLowerCase().includes('scripture'))).toBe(true);
  });

  it('flags "praying for you" pastoral promises', () => {
    const concerns = scanForConstraintViolations(
      ackDraft({ sms: { body: "Hi Maria — we're praying for you. Becky will follow up." } }),
    );
    expect(concerns.some((c) => c.includes('praying for you'))).toBe(true);
  });

  it('flags pastoral platitudes (god has a plan etc.)', () => {
    const concerns = scanForConstraintViolations(
      ackDraft({ sms: { body: "Hi — you're not alone. Becky will be in touch soon." } }),
    );
    expect(concerns.some((c) => c.includes('platitude'))).toBe(true);
  });

  it('does NOT flag the word "request" or neutral "received"', () => {
    const concerns = scanForConstraintViolations(
      ackDraft({
        sms: {
          body: 'Hi Maria — we received your request. Becky will reach out personally within a day.',
        },
      }),
    );
    expect(concerns).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// insertContextualReferenceTouch — suppression + idempotency
// ---------------------------------------------------------------------------

describe('insertContextualReferenceTouch', () => {
  it('inserts a touch_number=9, is_contextual_reference=true touch on the active journey', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      prayer_requests: [{ id: 'pr-1', person_pco_id: '1001', status: 'in_followup' }],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => new Date('2026-05-15T12:00:00Z'),
    });
    const result = await insertContextualReferenceTouch(fake.db, {
      personPcoId: '1001',
      prayerRequestId: 'pr-1',
      now: () => NOW,
    });
    expect(result.outcome).toBe('inserted');
    const touches = fake.tables['touches']!;
    const ctxRef = touches.find((t) => t['is_contextual_reference'] === true)!;
    expect(ctxRef).toBeDefined();
    expect(ctxRef['touch_number']).toBe(9);
    expect(ctxRef['kind']).toBe('sms');
    expect(ctxRef['owner_role']).toBe('connections_volunteer');
  });

  it('is idempotent — second call returns already_inserted', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      prayer_requests: [{ id: 'pr-1', person_pco_id: '1001', status: 'in_followup' }],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => new Date('2026-05-15T12:00:00Z'),
    });
    await insertContextualReferenceTouch(fake.db, {
      personPcoId: '1001',
      prayerRequestId: 'pr-1',
    });
    const second = await insertContextualReferenceTouch(fake.db, {
      personPcoId: '1001',
      prayerRequestId: 'pr-1',
    });
    expect(second.outcome).toBe('already_inserted');
    const ctxRefs = fake.tables['touches']!.filter((t) => t['is_contextual_reference'] === true);
    expect(ctxRefs).toHaveLength(1);
  });

  it('suppresses when prayer_request is resolved_no_action', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      prayer_requests: [{ id: 'pr-1', person_pco_id: '1001', status: 'resolved_no_action' }],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => new Date('2026-05-15T12:00:00Z'),
    });
    const result = await insertContextualReferenceTouch(fake.db, {
      personPcoId: '1001',
      prayerRequestId: 'pr-1',
    });
    expect(result.outcome).toBe('suppressed_prayer_resolved_no_action');
    expect(fake.tables['touches']!.filter((t) => t['is_contextual_reference'] === true)).toHaveLength(0);
  });

  it('suppresses when an active pastoral_flag exists', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      pastoral_flags: [{ id: 'pf-1', person_pco_id: '1001', reason: 'prayer', resolved_at: null }],
      prayer_requests: [{ id: 'pr-1', person_pco_id: '1001', status: 'in_followup' }],
    });
    const result = await insertContextualReferenceTouch(fake.db, {
      personPcoId: '1001',
      prayerRequestId: 'pr-1',
    });
    expect(result.outcome).toBe('suppressed_pastoral_flag');
  });

  it('suppresses when no active journey exists', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      prayer_requests: [{ id: 'pr-1', person_pco_id: '1001', status: 'in_followup' }],
    });
    const result = await insertContextualReferenceTouch(fake.db, {
      personPcoId: '1001',
      prayerRequestId: 'pr-1',
    });
    expect(result.outcome).toBe('suppressed_no_active_journey');
  });
});

// ---------------------------------------------------------------------------
// processPrayerSignal — orchestrator
// ---------------------------------------------------------------------------

const CAPTURING_SENDER: Sender & {
  calls: Array<{ kind: 'email' | 'sms'; recipient: string; body: string }>;
} = {
  calls: [],
  async sendEmail(args) {
    this.calls.push({ kind: 'email', recipient: args.to, body: args.body });
    return { channel: 'email', recipient: args.to, vendor: 'stub', vendor_id: 'stub-1' };
  },
  async sendSms(args) {
    this.calls.push({ kind: 'sms', recipient: args.to, body: args.body });
    return { channel: 'sms', recipient: args.to, vendor: 'stub', vendor_id: 'stub-1' };
  },
};

function cleanAckResponse(): string {
  return JSON.stringify({
    email: null,
    sms: {
      body: 'Hi Maria — we received what you shared. Becky will reach out personally within 24 hours.',
    },
    voice_notes: 'Calibrated ack: no scripture, no resources, no characterization.',
  });
}

function passingVoiceCheck(): string {
  return JSON.stringify({
    warm_personal: { pass: true, note: 'human' },
    zero_pressure: { pass: true, note: 'no pressure' },
    sounds_like_champion: { pass: true, note: 'on tone' },
    overall: 'pass',
    concerns: [],
  });
}

function makeClaude(scripts: Array<(req: ClaudeRequest) => string | null>): ClaudeClient {
  return {
    async generate(req): Promise<ClaudeResponse> {
      for (const s of scripts) {
        const out = s(req);
        if (out !== null) {
          return { text: out, inputTokens: 50, outputTokens: 30, stopReason: 'end_turn' };
        }
      }
      throw new Error(`No script matched. system: ${req.system.slice(0, 80)}`);
    },
  };
}

function makeSignal(overrides: Partial<EngagementSignalRow> = {}): EngagementSignalRow {
  return {
    id: 'sig-1',
    person_pco_id: '1001',
    kind: 'prayer_request',
    occurred_at: '2026-05-20T15:00:00Z',
    observed_at: '2026-05-20T15:00:00Z',
    source_pco_id: null,
    payload: { channel: 'sms', content: 'My mom is in the hospital' },
    ...overrides,
  };
}

describe('processPrayerSignal — orchestrator', () => {
  it('captures, drafts, sends, and inserts contextual reference', async () => {
    const fake = makeFakeDb({
      people: [
        { pco_id: '1001', preferred_name: 'Maria', first_name: 'Maria' },
      ],
      phone_numbers: [{ pco_id: 'ph1', person_pco_id: '1001', number: '+19285550000', is_primary: true }],
      staff_profiles: [
        {
          email: 'becky@championchurch.org',
          full_name: 'Becky Cota',
          pastoral_care: true,
          pcpoc_alert_recipient: true,
          is_default_pcpoc: true,
        },
      ],
    });
    // Active journey so contextual reference can attach
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => new Date('2026-05-15T12:00:00Z'),
    });

    CAPTURING_SENDER.calls.length = 0;
    const claude = makeClaude([
      (req) => (/calibrated acknowledgment/i.test(req.system) ? cleanAckResponse() : null),
      (req) => (/voice quality assurance/i.test(req.system) ? passingVoiceCheck() : null),
    ]);

    const signal = makeSignal();
    fake.tables['engagement_signals']!.push(signal as unknown as Record<string, unknown>);

    const result = await processPrayerSignal(fake.db, claude, CAPTURING_SENDER, signal, {
      draftModel: 'claude-sonnet-4-6',
      voiceCheckModel: 'claude-haiku-4-5-20251001',
      now: () => NOW,
    });

    expect(result.outcome).toBe('acknowledged');
    expect(result.prayerRequestId).toBeTruthy();
    expect(result.acknowledgmentSent).toBe(true);
    expect(result.contextualReferenceTouchId).toBeTruthy();
    expect(result.pcpocAssignedTo).toBe('becky@championchurch.org');

    expect(CAPTURING_SENDER.calls).toHaveLength(1);
    expect(CAPTURING_SENDER.calls[0]!.kind).toBe('sms');

    // prayer_requests row
    const pr = fake.tables['prayer_requests']![0]!;
    expect(pr['acknowledged_at']).toBeTruthy();
    expect(pr['status']).toBe('in_followup');
    expect(pr['assigned_to']).toBe('becky@championchurch.org');

    // precious_cargo_refs updated
    const person = fake.tables['people']![0]!;
    const refs = person['precious_cargo_refs'] as string[];
    expect(refs).toContain(pr['id']);

    // contextual reference touch present
    const ctxRef = fake.tables['touches']!.find((t) => t['is_contextual_reference'] === true);
    expect(ctxRef).toBeDefined();
  });

  it('blocks when an active pastoral_flag exists', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      pastoral_flags: [{ id: 'pf-1', person_pco_id: '1001', reason: 'crisis', resolved_at: null }],
    });
    const claude = makeClaude([]); // no Claude calls expected
    const signal = makeSignal();

    const result = await processPrayerSignal(fake.db, claude, CAPTURING_SENDER, signal, {
      draftModel: 'm',
      voiceCheckModel: 'm',
    });

    expect(result.outcome).toBe('blocked_pastoral_flag');
    expect(result.acknowledgmentSent).toBe(false);
    expect(fake.tables['prayer_requests']).toHaveLength(0);
  });

  it('holds when the draft violates a constraint (scripture, link, platitude)', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', preferred_name: 'Maria' }],
      staff_profiles: [
        {
          email: 'becky@championchurch.org',
          full_name: 'Becky Cota',
          pastoral_care: true,
          pcpoc_alert_recipient: true,
          is_default_pcpoc: true,
        },
      ],
    });
    const violatingResponse = JSON.stringify({
      email: null,
      sms: { body: "Hi Maria — we're praying for you. https://help.example. Psalm 23:4 — God has a plan." },
      voice_notes: '',
    });
    const claude = makeClaude([
      (req) => (/calibrated acknowledgment/i.test(req.system) ? violatingResponse : null),
    ]);

    const signal = makeSignal();
    const result = await processPrayerSignal(fake.db, claude, CAPTURING_SENDER, signal, {
      draftModel: 'm',
      voiceCheckModel: 'm',
    });

    expect(result.outcome).toBe('held_constraint_violation');
    expect(result.acknowledgmentSent).toBe(false);
    expect(result.concerns.length).toBeGreaterThan(0);
  });

  it('is idempotent on the source signal — second run reports already_captured', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', preferred_name: 'Maria' }],
      phone_numbers: [{ pco_id: 'ph1', person_pco_id: '1001', number: '+19285550000', is_primary: true }],
      staff_profiles: [
        {
          email: 'becky@championchurch.org',
          full_name: 'Becky Cota',
          pastoral_care: true,
          pcpoc_alert_recipient: true,
          is_default_pcpoc: true,
        },
      ],
    });
    const claude = makeClaude([
      (req) => (/calibrated acknowledgment/i.test(req.system) ? cleanAckResponse() : null),
      (req) => (/voice quality assurance/i.test(req.system) ? passingVoiceCheck() : null),
    ]);
    const signal = makeSignal();

    await processPrayerSignal(fake.db, claude, CAPTURING_SENDER, signal, {
      draftModel: 'm',
      voiceCheckModel: 'm',
    });
    const second = await processPrayerSignal(fake.db, claude, CAPTURING_SENDER, signal, {
      draftModel: 'm',
      voiceCheckModel: 'm',
    });
    expect(second.outcome).toBe('already_captured');
    expect(fake.tables['prayer_requests']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runEscalationCheck — 48h window
// ---------------------------------------------------------------------------

describe('runEscalationCheck', () => {
  it('escalates prayer_requests acknowledged > 48h ago without PCPOC response', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      prayer_requests: [
        {
          id: 'pr-1',
          person_pco_id: '1001',
          content: 'x',
          channel: 'sms',
          status: 'in_followup',
          acknowledged_at: '2026-05-19T00:00:00Z', // 72h before NOW
          pcpoc_responded_at: null,
          escalated_at: null,
        },
      ],
    });
    const result = await runEscalationCheck(fake.db, { now: () => NOW });
    expect(result.escalated).toBe(1);
    const pr = fake.tables['prayer_requests']![0]!;
    expect(pr['escalated_at']).toBeTruthy();
    // Pastoral flag raised
    expect(fake.tables['pastoral_flags']).toHaveLength(1);
    expect(fake.tables['pastoral_flags']![0]!['reason']).toBe('prayer');
  });

  it('skips prayer_requests acknowledged < 48h ago', async () => {
    const fake = makeFakeDb({
      prayer_requests: [
        {
          id: 'pr-1',
          person_pco_id: '1001',
          content: 'x',
          channel: 'sms',
          status: 'in_followup',
          acknowledged_at: '2026-05-21T15:00:00Z', // 24h before NOW
          pcpoc_responded_at: null,
          escalated_at: null,
        },
      ],
    });
    const result = await runEscalationCheck(fake.db, { now: () => NOW });
    expect(result.escalated).toBe(0);
    expect(fake.tables['pastoral_flags']).toHaveLength(0);
  });

  it('skips prayer_requests with pcpoc_responded_at set', async () => {
    const fake = makeFakeDb({
      prayer_requests: [
        {
          id: 'pr-1',
          person_pco_id: '1001',
          content: 'x',
          channel: 'sms',
          status: 'in_followup',
          acknowledged_at: '2026-05-19T00:00:00Z',
          pcpoc_responded_at: '2026-05-19T18:00:00Z',
          escalated_at: null,
        },
      ],
    });
    const result = await runEscalationCheck(fake.db, { now: () => NOW });
    expect(result.escalated).toBe(0);
  });
});
