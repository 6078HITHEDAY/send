import { describe, expect, it } from 'bun:test';
import { arrayToB64, b64ToArray } from '../../src/core/base64';

describe('base64', () => {
  it('uses the url-safe alphabet without padding', () => {
    // 0xfb 0xff produces "+/" in standard base64.
    expect(arrayToB64(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
    expect(arrayToB64(new Uint8Array([1]))).toBe('AQ');
    expect(arrayToB64(new Uint8Array([1, 2]))).toBe('AQI');
  });

  it('decodes unpadded input of every length modulo 4', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = (i * 37 + 11) & 0xff;
      }
      expect(b64ToArray(arrayToB64(bytes))).toEqual(bytes);
    }
  });

  it('accepts the standard alphabet too', () => {
    expect(b64ToArray('-_-_')).toEqual(b64ToArray('+/+/'));
  });

  it('round trips the 16 byte protocol nonce', () => {
    const nonce = 'yRCdyQ1EMSA3mo4rqSkuNQ==';
    const bytes = b64ToArray(nonce);
    expect(bytes.length).toBe(16);
    // Re-encoding drops the padding, which is what the wire format uses.
    expect(arrayToB64(bytes)).toBe('yRCdyQ1EMSA3mo4rqSkuNQ');
  });

  it('handles the empty array', () => {
    expect(arrayToB64(new Uint8Array())).toBe('');
    expect(b64ToArray('')).toEqual(new Uint8Array());
  });

  it('round trips every byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      all[i] = i;
    }
    expect(b64ToArray(arrayToB64(all))).toEqual(all);
  });
});
