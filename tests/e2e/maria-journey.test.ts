/**
 * E2E — Maria's full guest journey.
 *
 * Validates the build prompt's Definition of Done:
 *
 *   "A fictional guest 'Maria' with kids enrolls Sunday → Touches 1-5
 *    fire with enriched payloads → she submits a prayer request via
 *    Touch 3 reply → Prayer Response Agent captures + acknowledges +
 *    alerts PCPOC → contextual reference touch schedules for Day 11 →
 *    Maria attends Sunday 2 (staff records via CLI) → Touches 6, 7, 8
 *    cancel → journey marks returned."
 *
 * Uses the shared in-memory fake DB. Substitutes a stub Claude client
 * (no network). Uses a stub Sender to verify the ack would have been
 * sent without actually hitting the wire.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeFakeDb, resetUuids } from '../_fixtures/fake-db.ts';
import { enrollGuest } from '../../src/journey/enroll.ts';
import { recordAttendance } from '../../src/journey/attendance.ts';
import { processReturnSignals } from '../../src/journey/return-detection.ts';
import { enrichTouch } from '../../src/journey/enrich-touch.ts';
import { processPrayerSignal } from '../../src/agent/prayer-response/orchestrator.ts';
import { _setVoiceRulesForTesting } from '../../src/agent/voice-rules.ts';
import type { ClaudeClient, ClaudeRequest, ClaudeResponse } from '../../src/agent/claude.ts';
import type { Sender } from '../../src/agent/prayer-response/sender.ts';
import type { EngagementSignalRow } from '../../src/db/index.ts';
import type { CmsAdapter, CmsServicePlan } from '../../src/cms/adapter.ts';

const SUNDAY_1 = new Date('2026-05-17T15:00:00Z');
const TUESDAY = new Date('2026-05-19T19:00:00Z');
const SUNDAY_2 = new Date('2026-05-24T00:00:00Z');

beforeEach(() => {
  resetUuids();
  _setVoiceRulesForTesting('# voice rules (test stub)');
});

function stubClaude(): ClaudeClient {
  return {
    async generate(req: ClaudeRequest): Promise<ClaudeResponse> {
      const system = req.system;
      // Calibrated acknowledgment drafter — respect the channel from the user message
      if (/calibrated acknowledgment/i.test(system)) {
        const wantsSms = /Channel they used: sms/i.test(req.userMessage);
        const body = wantsSms
          ? {
              email: null as { subject: string; body: string } | null,
              sms: {
                body:
                  'Hi Maria — we received what you shared. Becky will reach out personally within 24 hours.',
              },
            }
          : {
              email: {
                subject: 'We received what you shared',
                body:
                  'Maria, we received what you shared. Becky from our pastoral team will reach out personally within 24 hours. — Champion Church',
              },
              sms: null as { body: string } | null,
            };
        return {
          text: JSON.stringify({
            ...body,
            voice_notes: 'Calibrated ack: no scripture, no resources, no characterization.',
          }),
          inputTokens: 80,
          outputTokens: 40,
          stopReason: 'end_turn',
        };
      }
      // Voice check
      if (/voice quality assurance/i.test(system)) {
        return {
          text: JSON.stringify({
            warm_personal: { pass: true, note: 'feels human' },
            zero_pressure: { pass: true, note: 'no pressure' },
            sounds_like_champion: { pass: true, note: 'on tone' },
            overall: 'pass',
            concerns: [],
          }),
          inputTokens: 60,
          outputTokens: 30,
          stopReason: 'end_turn',
        };
      }
      // Any per-touch drafter
      return {
        text: JSON.stringify({
          email: null,
          sms: { body: 'Hey Maria — drafted touch body.' },
          brief: null,
          voice_notes: 'stub draft',
        }),
        inputTokens: 50,
        outputTokens: 30,
        stopReason: 'end_turn',
      };
    },
  };
}

function stubSender(): Sender & { calls: Array<{ kind: 'sms' | 'email'; recipient: string }> } {
  const calls: Array<{ kind: 'sms' | 'email'; recipient: string }> = [];
  return {
    calls,
    async sendEmail(args) {
      calls.push({ kind: 'email', recipient: args.to });
      return { channel: 'email', recipient: args.to, vendor: 'stub', vendor_id: 'stub-1' };
    },
    async sendSms(args) {
      calls.push({ kind: 'sms', recipient: args.to });
      return { channel: 'sms', recipient: args.to, vendor: 'stub', vendor_id: 'stub-1' };
    },
  };
}

function stubCms(): CmsAdapter {
  return {
    vendor: 'pco' as const,
    async listPeople() {
      return { people: [], households: [], emails: [], phones: [] };
    },
    async listForms() {
      return [];
    },
    async listFormSubmissions() {
      return [];
    },
    async listDonations() {
      return [];
    },
    async listCheckIns() {
      return [];
    },
    async getServicePlan(serviceDate: string): Promise<CmsServicePlan | null> {
      return {
        cms_id: 'sp-1',
        service_date: serviceDate,
        service_title: 'Sunday Morning',
        sermon_title: 'Hope That Holds',
        sermon_series: 'Anchored',
        scripture_reference: null,
      };
    },
  };
}

describe('E2E — Maria journey end-to-end', () => {
  it('runs the full Definition of Done scenario', async () => {
    // ---- Setup ----
    const fake = makeFakeDb({
      // Maria + her two children
      people: [
        {
          pco_id: 'maria-1001',
          first_name: 'Maria',
          last_name: 'Lopez',
          preferred_name: 'Maria',
          household_pco_id: 'h-1',
          is_child: false,
          first_visit_date: '2026-05-17',
        },
        { pco_id: 'kid-1', first_name: 'Sofia', last_name: 'Lopez', household_pco_id: 'h-1', is_child: true, birthdate: '2019-03-12' },
        { pco_id: 'kid-2', first_name: 'Diego', last_name: 'Lopez', household_pco_id: 'h-1', is_child: true, birthdate: '2022-08-04' },
      ],
      households: [{ pco_id: 'h-1', name: 'Lopez Household', member_count: 3 }],
      emails: [
        {
          pco_id: 'e1',
          person_pco_id: 'maria-1001',
          address: 'maria@example.com',
          is_primary: true,
          blocked: false,
        },
      ],
      phone_numbers: [
        { pco_id: 'p1', person_pco_id: 'maria-1001', number: '+19285551001', is_primary: true },
      ],
      // Connect card from Maria with free-text content
      engagement_signals: [
        {
          id: 'sig-cc-1',
          person_pco_id: 'maria-1001',
          kind: 'connect_card',
          occurred_at: SUNDAY_1.toISOString(),
          payload: {
            channel: 'connect_card',
            content: 'We just moved here from Tucson and are looking for a kids ministry.',
          },
        },
      ],
      // Volunteer pool (one connections, one lay)
      volunteers: [
        { id: 'v-conn', full_name: 'Sarah Reyes', role: 'connections', is_active: true, current_load: 0, user_id: 'auth-sarah', email: 'sarah@championchurch.org' },
        { id: 'v-lay', full_name: 'Tom Walker', role: 'lay', is_active: true, current_load: 0 },
      ],
      // PCPOC routing — Becky
      staff_profiles: [
        {
          email: 'becky@championchurch.org',
          full_name: 'Becky Cota',
          pastoral_care: true,
          pcpoc_alert_recipient: true,
          is_default_pcpoc: true,
        },
        {
          email: 'lacinda@championchurch.org',
          full_name: 'LaCinda Bloomfield',
          pastoral_care: true,
          pcpoc_alert_recipient: true,
          is_default_pcpoc: false,
        },
      ],
    });

    const cms = stubCms();
    const claude = stubClaude();
    const sender = stubSender();

    // ---- Step 1: Sunday morning — Maria fills out a Connect Card; she's enrolled ----
    const enroll = await enrollGuest(fake.db, {
      personPcoId: 'maria-1001',
      signalId: 'sig-cc-1',
      enrollmentKind: 'connect_card',
      now: () => SUNDAY_1,
    });
    expect(enroll.outcome).toBe('enrolled');
    if (enroll.outcome !== 'enrolled') throw new Error('unreachable');
    expect(enroll.touchCount).toBe(8);
    expect(enroll.connectionsVolunteer?.id).toBe('v-conn');
    expect(enroll.layVolunteer?.id).toBe('v-lay');

    const journey = fake.tables['guest_journeys']!.find((j) => j['person_pco_id'] === 'maria-1001')!;
    const journeyId = journey['id'] as string;

    // Volunteer load ticked up
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-conn')!['current_load']).toBe(1);

    // ---- Step 2: Touch 1 enrichment populates context (connect-card text, kids, sermon) ----
    const touches = fake.tables['touches']!.filter((t) => t['journey_id'] === journeyId);
    const t1 = touches.find((t) => t['touch_number'] === 1)!;
    const enrichResult = await enrichTouch(fake.db, cms, t1['id'] as string, { now: () => SUNDAY_1 });
    expect(enrichResult.outcome).toBe('enriched');
    if (enrichResult.outcome !== 'enriched') throw new Error('unreachable');
    expect(enrichResult.context.person.preferred_name).toBe('Maria');
    expect(enrichResult.context.kids?.household_children).toHaveLength(2);
    expect(enrichResult.context.connect_card?.content).toContain('Tucson');
    expect(enrichResult.context.sermon?.sermon_title).toBe('Hope That Holds');
    expect(enrichResult.context.assigned_volunteer?.full_name).toBe('Sarah Reyes');

    // ---- Step 3: Touches 2-5 enrich too (idempotent; same kind of context) ----
    for (const tn of [2, 3, 4, 5]) {
      const tr = touches.find((t) => t['touch_number'] === tn)!;
      const r = await enrichTouch(fake.db, cms, tr['id'] as string, { now: () => SUNDAY_1 });
      expect(r.outcome).toBe('enriched');
    }

    // ---- Step 4: Tuesday — Maria replies to Touch 3 with a prayer request ----
    // The signal gets written by the inbound webhook in the real system; we
    // simulate it directly here. Classification = personal_or_sensitive is the
    // upstream poller's job; in this test we just write the signal and feed it
    // to the agent.
    const prayerSignal: EngagementSignalRow = {
      id: 'sig-prayer-1',
      person_pco_id: 'maria-1001',
      kind: 'prayer_request',
      occurred_at: TUESDAY.toISOString(),
      observed_at: TUESDAY.toISOString(),
      source_pco_id: null,
      payload: {
        channel: 'email',
        content:
          "My dad in Tucson just got diagnosed with cancer. Hard week. Don't really know what to ask for — just praying he holds on.",
      },
    };
    fake.tables['engagement_signals']!.push(prayerSignal as unknown as Record<string, unknown>);

    const prayerResult = await processPrayerSignal(
      fake.db,
      claude,
      sender,
      prayerSignal,
      {
        draftModel: 'claude-sonnet-4-6',
        voiceCheckModel: 'claude-haiku-4-5-20251001',
        now: () => TUESDAY,
      },
    );
    expect(prayerResult.outcome).toBe('acknowledged');
    expect(prayerResult.acknowledgmentSent).toBe(true);
    expect(prayerResult.pcpocAssignedTo).toBe('becky@championchurch.org');
    expect(prayerResult.contextualReferenceTouchId).toBeTruthy();

    // Acknowledgment went out via email (the channel Maria used)
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]!.kind).toBe('email');
    expect(sender.calls[0]!.recipient).toBe('maria@example.com');

    // prayer_request row created and assigned
    const pr = fake.tables['prayer_requests']![0]!;
    expect(pr['acknowledged_at']).toBeTruthy();
    expect(pr['status']).toBe('in_followup');
    expect(pr['assigned_to']).toBe('becky@championchurch.org');

    // Maria's people record now carries the precious-cargo ref
    const mariaRow = fake.tables['people']!.find((p) => p['pco_id'] === 'maria-1001')!;
    const refs = mariaRow['precious_cargo_refs'] as string[];
    expect(refs).toContain(pr['id']);

    // Day-11 contextual reference touch is on the journey
    const ctxRefTouch = fake.tables['touches']!.find(
      (t) => t['journey_id'] === journeyId && t['is_contextual_reference'] === true,
    );
    expect(ctxRefTouch).toBeDefined();
    expect(ctxRefTouch!['touch_number']).toBe(9);
    expect(ctxRefTouch!['kind']).toBe('sms');
    expect(ctxRefTouch!['owner_role']).toBe('connections_volunteer');

    // ---- Step 5: Sunday 2 — Becky marks Maria attended ----
    const attend = await recordAttendance(fake.db, {
      personPcoId: 'maria-1001',
      serviceDate: SUNDAY_2,
      recordedBy: 'becky@championchurch.org',
    });
    expect(attend.outcome).toBe('recorded');

    // Return detection runs as part of the same call cycle
    const returnRes = await processReturnSignals(fake.db);
    expect(returnRes.journeysReturned).toBe(1);
    expect(returnRes.touchesCancelled).toBe(3); // Touches 6, 7, 8

    // ---- Step 6: Journey state + recovery cancellation ----
    const j = fake.tables['guest_journeys']!.find((row) => row['id'] === journeyId)!;
    expect(j['status']).toBe('returned');
    expect(j['returned_at']).toBeTruthy();

    const t6 = fake.tables['touches']!.find(
      (t) => t['journey_id'] === journeyId && t['touch_number'] === 6,
    )!;
    const t7 = fake.tables['touches']!.find(
      (t) => t['journey_id'] === journeyId && t['touch_number'] === 7,
    )!;
    const t8 = fake.tables['touches']!.find(
      (t) => t['journey_id'] === journeyId && t['touch_number'] === 8,
    )!;
    expect(t6['status']).toBe('na');
    expect(t7['status']).toBe('na');
    expect(t8['status']).toBe('na');

    // Volunteer load decremented back to zero
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-conn')!['current_load']).toBe(0);
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-lay')!['current_load']).toBe(0);

    // ---- Step 7: Dashboard would now show this state ----
    // The dashboard reads (a) the journey row's status and (b) the touch rows.
    // We've verified both. The dashboard's role-aware precious-cargo rendering
    // is exercised separately in touch-detail tests; here we just confirm the
    // underlying state is correct.
  });
});
