import { describe, it, expect } from 'vitest';

import { scanFreeText } from '../../src/inbound/free-text-scan.ts';

describe('scanFreeText', () => {
  it('flags nothing for a bare keyword', () => {
    const r = scanFreeText('HOME');
    expect(r.salvation).toBe(false);
    expect(r.prayer).toBe(false);
    expect(r.crisis).toBe(false);
  });

  it('detects salvation language', () => {
    expect(scanFreeText('HOME I gave my life to Christ today').salvation).toBe(true);
    expect(scanFreeText('I just got saved!').salvation).toBe(true);
    expect(scanFreeText('first time ever doing this').salvation).toBe(true);
  });

  it('detects prayer-request language', () => {
    expect(scanFreeText('please pray for my marriage').prayer).toBe(true);
    expect(scanFreeText('HOME my mom was just diagnosed').prayer).toBe(true);
  });

  it('detects crisis language', () => {
    expect(scanFreeText('I want to end my life').crisis).toBe(true);
    expect(scanFreeText('thinking about suicide').crisis).toBe(true);
    expect(scanFreeText("I can't go on").crisis).toBe(true);
  });

  it('can flag multiple categories at once', () => {
    const r = scanFreeText('HOME I want to give my life to Jesus but I am struggling badly');
    expect(r.salvation).toBe(true);
    expect(r.prayer).toBe(true);
  });

  it('returns the matched phrases for transparency', () => {
    const r = scanFreeText('please pray, I got saved');
    expect(r.matched.salvation.length).toBeGreaterThan(0);
    expect(r.matched.prayer.length).toBeGreaterThan(0);
  });
});
