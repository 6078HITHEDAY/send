import { describe, expect, test } from 'bun:test';
import { negotiateLanguage } from '../../src/server/language.ts';

describe('negotiateLanguage', () => {
  test('defaults to en-US when no header is present', () => {
    expect(negotiateLanguage(null)).toBe('en-US');
  });

  test('falls back to en-US when Accept-Language is longer than 255 chars', () => {
    expect(negotiateLanguage('a'.repeat(256))).toBe('en-US');
  });

  test('picks the highest-q available locale', () => {
    // fr is in availableLanguages; a made-up tag should not win just because
    // it is listed first.
    expect(negotiateLanguage('xx-XX,fr;q=0.9,en-US;q=0.8')).toBe('fr');
  });

  test('resolves a bare language to a region via likely subtags', () => {
    // @fluent/langneg's built-in likely-subtags table maps `zh` → a Chinese
    // locale that we ship (zh-CN or zh-TW depending on the table).
    const result = negotiateLanguage('zh');
    expect(result.startsWith('zh')).toBe(true);
  });
});
