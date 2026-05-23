import { describe, it, expect, beforeEach } from 'vitest';
import {
  pickVolunteer,
  incrementVolunteerLoad,
  decrementVolunteerLoad,
} from '../../src/journey/volunteers.ts';
import { enrollGuest } from '../../src/journey/enroll.ts';
import { markJourneyReturned } from '../../src/journey/return-detection.ts';
import { makeFakeDb, resetUuids } from '../_fixtures/fake-db.ts';

const NOW = new Date('2026-05-17T18:00:00Z');

beforeEach(() => {
  resetUuids();
});

describe('pickVolunteer', () => {
  it('returns null when the pool is empty', async () => {
    const fake = makeFakeDb();
    const pick = await pickVolunteer(fake.db, 'connections');
    expect(pick).toBeNull();
  });

  it('picks the volunteer with the lowest current_load', async () => {
    const fake = makeFakeDb({
      volunteers: [
        { id: 'v1', full_name: 'A', role: 'connections', is_active: true, current_load: 3 },
        { id: 'v2', full_name: 'B', role: 'connections', is_active: true, current_load: 1 },
        { id: 'v3', full_name: 'C', role: 'connections', is_active: true, current_load: 2 },
      ],
    });
    const pick = await pickVolunteer(fake.db, 'connections');
    expect(pick?.id).toBe('v2');
  });

  it('skips inactive volunteers', async () => {
    const fake = makeFakeDb({
      volunteers: [
        { id: 'v1', full_name: 'A', role: 'connections', is_active: false, current_load: 0 },
        { id: 'v2', full_name: 'B', role: 'connections', is_active: true, current_load: 5 },
      ],
    });
    const pick = await pickVolunteer(fake.db, 'connections');
    expect(pick?.id).toBe('v2');
  });

  it('tiebreaks on created_at (oldest first)', async () => {
    const fake = makeFakeDb({
      volunteers: [
        { id: 'v1', full_name: 'A', role: 'connections', is_active: true, current_load: 0, created_at: '2026-05-10T00:00:00Z' },
        { id: 'v2', full_name: 'B', role: 'connections', is_active: true, current_load: 0, created_at: '2026-05-01T00:00:00Z' },
      ],
    });
    const pick = await pickVolunteer(fake.db, 'connections');
    expect(pick?.id).toBe('v2');
  });

  it('respects role boundaries', async () => {
    const fake = makeFakeDb({
      volunteers: [
        { id: 'v1', full_name: 'A', role: 'lay', is_active: true, current_load: 0 },
        { id: 'v2', full_name: 'B', role: 'connections', is_active: true, current_load: 5 },
      ],
    });
    const pick = await pickVolunteer(fake.db, 'connections');
    expect(pick?.id).toBe('v2');
  });
});

describe('load tracking', () => {
  it('incrementVolunteerLoad bumps current_load', async () => {
    const fake = makeFakeDb({
      volunteers: [{ id: 'v1', full_name: 'A', role: 'connections', is_active: true, current_load: 2 }],
    });
    await incrementVolunteerLoad(fake.db, 'v1');
    expect(fake.tables['volunteers']![0]!['current_load']).toBe(3);
  });

  it('decrementVolunteerLoad floors at 0', async () => {
    const fake = makeFakeDb({
      volunteers: [{ id: 'v1', full_name: 'A', role: 'connections', is_active: true, current_load: 0 }],
    });
    await decrementVolunteerLoad(fake.db, 'v1');
    expect(fake.tables['volunteers']![0]!['current_load']).toBe(0);
  });
});

describe('enrollGuest with volunteer pool', () => {
  it('assigns volunteers and increments load when pool is non-empty', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001', preferred_name: 'Maria' }],
      volunteers: [
        { id: 'v-conn', full_name: 'Connie', role: 'connections', is_active: true, current_load: 0 },
        { id: 'v-lay', full_name: 'Larry', role: 'lay', is_active: true, current_load: 0 },
      ],
    });
    const result = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => NOW,
    });
    expect(result.outcome).toBe('enrolled');
    if (result.outcome !== 'enrolled') throw new Error('unreachable');
    expect(result.connectionsVolunteer?.id).toBe('v-conn');
    expect(result.layVolunteer?.id).toBe('v-lay');

    const j = fake.tables['guest_journeys']![0]!;
    expect(j['assigned_connections_volunteer_id']).toBe('v-conn');
    expect(j['assigned_lay_volunteer_id']).toBe('v-lay');

    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-conn')!['current_load']).toBe(1);
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-lay')!['current_load']).toBe(1);
  });

  it('enrolls with NULL volunteer assignment when pool is empty', async () => {
    const fake = makeFakeDb({ people: [{ pco_id: '1001' }] });
    const result = await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => NOW,
    });
    expect(result.outcome).toBe('enrolled');
    if (result.outcome !== 'enrolled') throw new Error('unreachable');
    expect(result.connectionsVolunteer).toBeNull();
    expect(result.layVolunteer).toBeNull();
    const j = fake.tables['guest_journeys']![0]!;
    expect(j['assigned_connections_volunteer_id']).toBeNull();
    expect(j['assigned_lay_volunteer_id']).toBeNull();
  });

  it('routes owner_user_id to the volunteer user_id when set', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      volunteers: [
        {
          id: 'v-conn',
          full_name: 'Connie',
          role: 'connections',
          is_active: true,
          current_load: 0,
          user_id: 'auth-user-conn',
        },
      ],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => NOW,
    });
    const touches = fake.tables['touches']!;
    const t1 = touches.find((t) => t['touch_number'] === 1)!;
    const t5 = touches.find((t) => t['touch_number'] === 5)!;
    const t7 = touches.find((t) => t['touch_number'] === 7)!;
    const t3 = touches.find((t) => t['touch_number'] === 3)!;
    expect(t1['owner_user_id']).toBe('auth-user-conn');
    expect(t5['owner_user_id']).toBe('auth-user-conn');
    expect(t7['owner_user_id']).toBe('auth-user-conn');
    // Non-volunteer-role touches keep owner_user_id null
    expect(t3['owner_user_id']).toBeNull();
  });
});

describe('volunteer load on journey transitions', () => {
  it('decrements load when journey marked returned', async () => {
    const fake = makeFakeDb({
      people: [{ pco_id: '1001' }],
      volunteers: [
        { id: 'v-conn', full_name: 'C', role: 'connections', is_active: true, current_load: 0 },
        { id: 'v-lay', full_name: 'L', role: 'lay', is_active: true, current_load: 0 },
      ],
    });
    await enrollGuest(fake.db, {
      personPcoId: '1001',
      signalId: null,
      enrollmentKind: 'connect_card',
      now: () => NOW,
    });
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-conn')!['current_load']).toBe(1);

    const journeyId = fake.tables['guest_journeys']![0]!['id'] as string;
    await markJourneyReturned(fake.db, {
      journeyId,
      returnedAt: new Date('2026-05-22T18:00:00Z'),
    });
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-conn')!['current_load']).toBe(0);
    expect(fake.tables['volunteers']!.find((v) => v['id'] === 'v-lay')!['current_load']).toBe(0);
  });
});
