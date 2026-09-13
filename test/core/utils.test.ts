import { beforeAll, describe, expect, it } from 'bun:test';
import { ECE_RECORD_SIZE } from '../../src/core/ece';
import {
  encryptedSize,
  isFile,
  secondsToL10nId,
  setLocale,
  setTranslate,
  timeLeft
} from '../../src/core/utils';

describe('isFile', () => {
  it('accepts 10 to 16 hex characters', () => {
    expect(isFile('0123456789')).toBe(true);
    expect(isFile('0123456789abcdef')).toBe(true);
    expect(isFile('ABCDEF0123')).toBe(true);
  });

  it('rejects anything else, including other storage keys', () => {
    expect(isFile('012345678')).toBe(false);
    expect(isFile('0123456789abcdef0')).toBe(false);
    expect(isFile('device_id')).toBe(false);
    expect(isFile('totalUploads')).toBe(false);
    expect(isFile('0123456789g')).toBe(false);
  });
});

describe('encryptedSize', () => {
  it('matches the ciphertext length the ECE encoder actually produces', () => {
    // 21 byte header plus 17 bytes of overhead (16 tag + 1 delimiter) per
    // record of `rs - 17` plaintext bytes.
    for (const size of [1, 100, 65518, 65519, 131037, 1024 * 1024]) {
      const records = Math.ceil(size / (ECE_RECORD_SIZE - 17));
      expect(encryptedSize(size)).toBe(21 + size + 17 * records);
    }
  });

  it('honours a custom record size', () => {
    expect(encryptedSize(100, 64)).toBe(21 + 100 + 17 * Math.ceil(100 / 47));
  });
});

describe('secondsToL10nId', () => {
  it('picks minutes, hours or days', () => {
    expect(secondsToL10nId(300)).toEqual({ id: 'timespanMinutes', num: 5 });
    expect(secondsToL10nId(3600)).toEqual({ id: 'timespanHours', num: 1 });
    expect(secondsToL10nId(86400)).toEqual({ id: 'timespanDays', num: 1 });
    expect(secondsToL10nId(604800)).toEqual({ id: 'timespanDays', num: 7 });
  });
});

describe('timeLeft', () => {
  it('reports expiry for non-positive durations', () => {
    expect(timeLeft(0)).toEqual({ id: 'linkExpiredAlt' });
  });

  it('breaks down days, hours and minutes', () => {
    const ms = (2 * 24 * 60 + 3 * 60 + 4) * 60 * 1000;
    expect(timeLeft(ms)).toEqual({
      id: 'expiresDaysHoursMinutes',
      days: 2,
      hours: 3,
      minutes: 4
    });
  });

  it('drops the day component under 24 hours', () => {
    expect(timeLeft((3 * 60 + 4) * 60 * 1000)).toEqual({
      id: 'expiresHoursMinutes',
      hours: 3,
      minutes: 4
    });
  });

  it('uses "< 1" for sub-minute durations', () => {
    expect(timeLeft(30 * 1000)).toEqual({
      id: 'expiresMinutes',
      minutes: '< 1'
    });
  });
});

describe('bytes', () => {
  beforeAll(() => {
    setLocale('en-US');
    setTranslate((id, data) =>
      id === 'fileSize' ? `${data?.num} ${data?.units}` : id
    );
  });

  it('formats zero and sub-byte values', async () => {
    const { bytes } = await import('../../src/core/utils');
    expect(bytes(0)).toBe('0B');
    expect(bytes(0.4)).toBe('0B');
  });

  it('scales through the unit table', async () => {
    const { bytes } = await import('../../src/core/utils');
    expect(bytes(1)).toBe('1 bytes');
    expect(bytes(1024)).toBe('1 kb');
    expect(bytes(1536)).toBe('1.5 kb');
    expect(bytes(1024 * 1024)).toBe('1 mb');
    expect(bytes(1024 ** 3)).toBe('1 gb');
    // Caps at gb rather than running off the end of the table.
    expect(bytes(1024 ** 4)).toBe('1,024 gb');
  });
});
