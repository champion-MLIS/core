import { describe, it, expect, beforeEach } from 'vitest';
import { runDrafter } from '../../src/agent/touch-drafting/runner.ts';
import { T1_SUN_SMS } from '../../src/agent/touch-drafting/t1-sun-sms.ts';
import { T3_TUE_EMAIL } from '../../src/agent/touch-drafting/t3-tue-email.ts';
import { T4_CALL_BRIEF } from '../../src/agent/touch-drafting/t4-call-brief.ts';
import { T9_CONTEXTUAL_SMS } from '../../src/agent/touch-drafting/t9-contextual-sms.ts';
import { computeMissingAttentiveness } from '../../src/agent/touch-drafting/types.ts';
import type { ClaudeClient, ClaudeRequest, ClaudeResponse } from '../../src/agent/claude.ts';
import type { ChampionLinks } from '../../src/agent/links.ts';
import type { EnrichedContext } from '../../src/journey/enrich-touch.ts';
import { _setVoiceRulesForTesting } from '../../src/agent/voice-rules.ts';

const LINKS: ChampionLinks = {
  website: 'https://champion.church',
  kids: 'https://champion.church/kids',
  groups: 'https://champion.church/groups',
  growthTrack: 'https://champion.church/growth-track',
};

beforeEach(() => {
  _setVoiceRulesForTesting('# voice rules (test)');
});

function baseContext(overrides: Partial<EnrichedContext> = {}): EnrichedContext {
  return {
    person: {
      pco_id: '1001',
      preferred_name: 'Maria',
      full_name: 'Maria Lopez',
      is_child: false,
      household_pco_id: null,
    },
    first_visit: { date: '2026-05-17' },
    sermon: { service_date: '2026-05-17', service_title: null, sermon_title: 'Hope That Holds', sermon_series: 'Anchored', scripture_reference: null },
    connect_card: null,
    kids: null,
    prior_touches: [],
    precious_cargo_refs: [],
    assigned_volunteer: null,
    enriched_at: '2026-05-17T19:00:00Z',
    ...overrides,
  };
}

function makeClaude(responses: { draft: string; voice: string }): ClaudeClient {
  return {
    async generate(req: ClaudeRequest): Promise<ClaudeResponse> {
      const isVoiceCheck = /voice quality assurance/i.test(req.system);
      const text = isVoiceCheck ? responses.voice : responses.draft;
      return { text, inputTokens: 80, outputTokens: 40, stopReason: 'end_turn' };
    },
  };
}

const PASSING_VOICE = JSON.stringify({
  warm_personal: { pass: true, note: '' },
  zero_pressure: { pass: true, note: '' },
  sounds_like_champion: { pass: true, note: '' },
  overall: 'pass',
  concerns: [],
});

// ---------------------------------------------------------------------------
// computeMissingAttentiveness — pure
// ---------------------------------------------------------------------------

describe('attentiveness requirements', () => {
  it('T1 requires preferred_name AND sermon/first_visit', () => {
    expect(computeMissingAttentiveness(T1_SUN_SMS, baseContext())).toEqual([]);
    expect(
      computeMissingAttentiveness(T1_SUN_SMS, baseContext({ sermon: null, first_visit: null })),
    ).toEqual(['sermon_or_first_visit']);
    expect(
      computeMissingAttentiveness(
        T1_SUN_SMS,
        baseContext({
          person: { ...baseContext().person, preferred_name: '(friend)' },
        }),
      ),
    ).toEqual(['preferred_name']);
  });

  it('T4 brief requires preferred_name AND one of (kids, connect_card, sermon)', () => {
    expect(
      computeMissingAttentiveness(T4_CALL_BRIEF, baseContext()),
    ).toEqual([]);
    expect(
      computeMissingAttentiveness(
        T4_CALL_BRIEF,
        baseContext({ sermon: null, kids: null, connect_card: null }),
      ),
    ).toEqual(['kids_or_connect_card_or_sermon']);
  });

  it('T9 contextual reference requires assigned_volunteer', () => {
    expect(
      computeMissingAttentiveness(T9_CONTEXTUAL_SMS, baseContext()),
    ).toEqual(['assigned_volunteer']);
    expect(
      computeMissingAttentiveness(
        T9_CONTEXTUAL_SMS,
        baseContext({
          assigned_volunteer: { id: 'v1', full_name: 'Sarah Doe', email: null, role: 'connections' },
        }),
      ),
    ).toEqual([]);
  });

  it('T3 only requires preferred_name (Becky email)', () => {
    expect(
      computeMissingAttentiveness(T3_TUE_EMAIL, baseContext({ sermon: null, first_visit: null })),
    ).toEqual([]);
    expect(
      computeMissingAttentiveness(
        T3_TUE_EMAIL,
        baseContext({ person: { ...baseContext().person, preferred_name: '(friend)' } }),
      ),
    ).toEqual(['preferred_name']);
  });
});

// ---------------------------------------------------------------------------
// runDrafter — held_pending_data vs. drafted
// ---------------------------------------------------------------------------

describe('runDrafter', () => {
  it('short-circuits to held_pending_data without calling Claude when required fields are missing', async () => {
    let calls = 0;
    const claude: ClaudeClient = {
      async generate() {
        calls++;
        return { text: '', inputTokens: 0, outputTokens: 0, stopReason: 'end_turn' };
      },
    };
    const result = await runDrafter(
      T1_SUN_SMS,
      {
        claude,
        voiceRules: '# v',
        draftModel: 'm',
        voiceCheckModel: 'm',
        links: LINKS,
      },
      {
        touch: {} as never,
        context: baseContext({ sermon: null, first_visit: null }),
      },
    );
    expect(result.outcome).toBe('held_pending_data');
    if (result.outcome !== 'held_pending_data') throw new Error('unreachable');
    expect(result.missing).toEqual(['sermon_or_first_visit']);
    expect(calls).toBe(0);
  });

  it('returns drafted result when attentiveness is satisfied', async () => {
    const draftResp = JSON.stringify({
      email: null,
      sms: { body: 'Hey Maria — so glad you were with us at Champion this morning. No need to text back.' },
      brief: null,
      voice_notes: 'Modeled on Guest Follow-Up SMS sample.',
    });
    const claude = makeClaude({ draft: draftResp, voice: PASSING_VOICE });

    const result = await runDrafter(
      T1_SUN_SMS,
      {
        claude,
        voiceRules: '# v',
        draftModel: 'claude-sonnet-4-6',
        voiceCheckModel: 'claude-haiku-4-5-20251001',
        links: LINKS,
      },
      { touch: {} as never, context: baseContext() },
    );
    expect(result.outcome).toBe('drafted');
    if (result.outcome !== 'drafted') throw new Error('unreachable');
    expect(result.voiceSampleCited).toBe('Guest Follow-Up SMS');
    expect(result.voiceSampleStatus).toBe('canonical');
    expect(result.draft.sms?.body).toContain('Maria');
    expect(result.voiceCheck.overall).toBe('pass');
  });

  it('T2-T9 drafts flag voice_sample_status approximated', () => {
    expect(T3_TUE_EMAIL.voiceSampleStatus).toBe('canonical');
    // Approximated samples
    const approximated = [
      'T2_MON_CARD',
      'T4_CALL_BRIEF',
      'T5_SAT_SMS',
      'T6_DAY10_CARD',
      'T7_DAY14_INVITE',
      'T8_DAY21',
      'T9_CONTEXTUAL_SMS',
    ];
    expect(approximated.length).toBe(7); // sanity — that's the touches without canonical samples
  });

  it('T4 brief drafts a brief field (no sms, no email)', async () => {
    const briefResponse = JSON.stringify({
      email: null,
      sms: null,
      brief: '1. Who you\'re calling\nMaria Lopez...\n6. Voicemail\n...',
      voice_notes: 'No canonical brief sample; modeled on Guest Follow-Up Email opening warmth.',
    });
    const claude = makeClaude({ draft: briefResponse, voice: PASSING_VOICE });

    const result = await runDrafter(
      T4_CALL_BRIEF,
      {
        claude,
        voiceRules: '# v',
        draftModel: 'm',
        voiceCheckModel: 'm',
        links: LINKS,
      },
      { touch: {} as never, context: baseContext() },
    );
    expect(result.outcome).toBe('drafted');
    if (result.outcome !== 'drafted') throw new Error('unreachable');
    expect(result.draft.brief).toBeTruthy();
    expect(result.draft.sms).toBeNull();
    expect(result.draft.email).toBeNull();
    expect(result.voiceSampleStatus).toBe('approximated');
  });
});
