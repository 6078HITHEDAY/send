import { ECE_RECORD_SIZE } from './ece';

const TAG_LENGTH = 16;

export type TranslateFn = (
  id: string,
  data?: Record<string, unknown>
) => string;

let translator: TranslateFn = () => {
  throw new Error('uninitialized translate function. call setTranslate first');
};

/**
 * Non-React code (notably `bytes()` below, called from the crypto core's
 * progress reporting) needs the Fluent translator without a hook.
 */
export function setTranslate(t: TranslateFn) {
  translator = t;
}

export const translate: TranslateFn = (id, data) => translator(id, data);

let currentLocale = 'en-US';

export function setLocale(l: string) {
  currentLocale = l;
}

export function locale(): string {
  return currentLocale;
}

export function isFile(id: string): boolean {
  return /^[0-9a-fA-F]{10,16}$/.test(id);
}

export function delay(ms = 100): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

const UNITS = ['bytes', 'kb', 'mb', 'gb'] as const;

export function bytes(num: number): string {
  if (num < 1) {
    return '0B';
  }
  const exponent = Math.min(Math.floor(Math.log10(num) / 3), UNITS.length - 1);
  const n = Number(num / 1024 ** exponent);
  const decimalDigits = Math.floor(n) === n ? 0 : 1;
  let nStr = n.toFixed(decimalDigits);
  try {
    nStr = n.toLocaleString(locale(), {
      minimumFractionDigits: decimalDigits,
      maximumFractionDigits: decimalDigits
    });
  } catch {
    // fall through to the unlocalized value
  }
  return translate('fileSize', {
    num: nStr,
    units: translate(UNITS[exponent] as string)
  });
}

export function percent(ratio: number): string {
  try {
    return ratio.toLocaleString(locale(), { style: 'percent' });
  } catch {
    return `${Math.floor(ratio * 100)}%`;
  }
}

export function number(n: number): string {
  try {
    return n.toLocaleString(locale());
  } catch {
    return n.toString();
  }
}

export function browserName(): string {
  try {
    // order of these matters
    const ua = navigator.userAgent;
    if (/firefox/i.test(ua)) return 'firefox';
    if (/edg/i.test(ua)) return 'edgium';
    if (/chrome/i.test(ua)) return 'chrome';
    if (/safari/i.test(ua)) return 'safari';
    if (/send android/i.test(ua)) return 'android-app';
    return 'other';
  } catch {
    return 'unknown';
  }
}

export interface L10nDuration {
  id: string;
  num?: number;
  days?: number;
  hours?: number;
  minutes?: number | string;
}

export function secondsToL10nId(seconds: number): L10nDuration {
  if (seconds < 3600) {
    return { id: 'timespanMinutes', num: Math.floor(seconds / 60) };
  }
  if (seconds < 86400) {
    return { id: 'timespanHours', num: Math.floor(seconds / 3600) };
  }
  return { id: 'timespanDays', num: Math.floor(seconds / 86400) };
}

export function timeLeft(milliseconds: number): L10nDuration {
  if (milliseconds < 1) {
    return { id: 'linkExpiredAlt' };
  }
  const minutes = Math.floor(milliseconds / 1000 / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return {
      id: 'expiresDaysHoursMinutes',
      days,
      hours: hours % 24,
      minutes: minutes % 60
    };
  }
  if (hours >= 1) {
    return {
      id: 'expiresHoursMinutes',
      hours,
      minutes: minutes % 60
    };
  }
  if (minutes === 0) {
    return { id: 'expiresMinutes', minutes: '< 1' };
  }
  return { id: 'expiresMinutes', minutes };
}

/**
 * Size of `size` plaintext bytes after ECE encryption. Mirrors the server's
 * own calculation, which is used to bound uploads.
 */
export function encryptedSize(
  size: number,
  rs: number = ECE_RECORD_SIZE,
  tagLength: number = TAG_LENGTH
): number {
  const chunkMeta = tagLength + 1; // Chunk metadata, tag and delimiter
  return 21 + size + chunkMeta * Math.ceil(size / (rs - chunkMeta));
}
