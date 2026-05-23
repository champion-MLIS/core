import { describe, it, expect, beforeEach } from 'vitest';
import { recordAttendance } from '../../src/journey/attendance.ts';
import { makeFakeDb, resetUuids } from '../_fixtures/fake-db.ts';

const SUNDAY = new Date('2026-05-24T00:00:00Z');

beforeEach(() => {
  resetUuids();
});

describe('recordAttendance', () => {
  it('writes a service_attendance signal for a known person', async () => {
    const fake = makeFakeDb({ people: [{ pco_id: '1001' }] });
    const result = await recordAttendance(fake.db, {
      personPcoId: '1001',
      serviceDate: SUNDAY,
      recordedBy: 'cli',
    });
    expect(result.outcome).toBe('recorded');
    expect(fake.tables['engagement_signals']).toHaveLength(1);
    const sig = fake.tables['engagement_signals']![0]!;
    expect(sig['kind']).toBe('service_attendance');
    expect(sig['person_pco_id']).toBe('1001');
    expect(sig['occurred_at']).toBe(SUNDAY.toISOString());
  });

  it('is idempotent — same person + same day = single signal', async () => {
    const fake = makeFakeDb({ people: [{ pco_id: '1001' }] });
    const first = await recordAttendance(fake.db, { personPcoId: '1001', serviceDate: SUNDAY });
    const second = await recordAttendance(fake.db, { personPcoId: '1001', serviceDate: SUNDAY });
    expect(first.outcome).toBe('recorded');
    expect(second.outcome).toBe('already_recorded');
    expect(fake.tables['engagement_signals']).toHaveLength(1);
  });

  it('refuses to record for a person not in the mirror', async () => {
    const fake = makeFakeDb({ people: [] });
    const result = await recordAttendance(fake.db, { personPcoId: '9999', serviceDate: SUNDAY });
    expect(result.outcome).toBe('person_not_mirrored');
    expect(fake.tables['engagement_signals']).toHaveLength(0);
  });

  it('different days produce separate signals', async () => {
    const fake = makeFakeDb({ people: [{ pco_id: '1001' }] });
    await recordAttendance(fake.db, { personPcoId: '1001', serviceDate: SUNDAY });
    await recordAttendance(fake.db, {
      personPcoId: '1001',
      serviceDate: new Date('2026-05-31T00:00:00Z'),
    });
    expect(fake.tables['engagement_signals']).toHaveLength(2);
  });
});
