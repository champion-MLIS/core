import { describe, it, expect } from 'vitest';

import { matchKeyword } from '../../src/inbound/keywords.ts';

describe('matchKeyword', () => {
  it('matches the bare keyword', () => {
    expect(matchKeyword('HOME')?.intent).toBe('home');
  });

  it('is case-insensitive', () => {
    expect(matchKeyword('home')?.intent).toBe('home');
    expect(matchKeyword('Home')?.intent).toBe('home');
  });

  it('strips surrounding punctuation', () => {
    expect(matchKeyword('Home!')?.intent).toBe('home');
    expect(matchKeyword('"HOME"')?.intent).toBe('home');
  });

  it('matches when the keyword is the first real word', () => {
    expect(matchKeyword('home please')?.intent).toBe('home');
    expect(matchKeyword('HOME — I want this')?.intent).toBe('home');
  });

  it('skips a leading emoji/punctuation token', () => {
    expect(matchKeyword('🙏 HOME')?.intent).toBe('home');
    expect(matchKeyword('... home')?.intent).toBe('home');
  });

  it('does not match when the keyword is not the first real word', () => {
    expect(matchKeyword('please HOME')).toBeNull();
  });

  it('returns null for unrelated text', () => {
    expect(matchKeyword('what time is service?')).toBeNull();
    expect(matchKeyword('WELCOME')).toBeNull();
    expect(matchKeyword('homerun')).toBeNull();
  });

  it('never matches reserved carrier words', () => {
    expect(matchKeyword('STOP')).toBeNull();
    expect(matchKeyword('stop')).toBeNull();
    expect(matchKeyword('HELP')).toBeNull();
    expect(matchKeyword('UNSUBSCRIBE')).toBeNull();
  });

  it('returns null for empty/whitespace', () => {
    expect(matchKeyword('')).toBeNull();
    expect(matchKeyword('   ')).toBeNull();
  });
});
