import { describe, expect, it } from 'bun:test';
import {
  ECE_RECORD_SIZE,
  decryptStream,
  encryptStream
} from '../../src/core/ece';
import { streamToArrayBuffer } from '../../src/core/streams';

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

async function collect(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await streamToArrayBuffer(stream));
}

/** Deterministic input so failures are reproducible. */
function sequence(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = (i * 31 + 7) & 0xff;
  }
  return out;
}

const KEY = new Uint8Array([
  0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6, 0xab, 0xf7, 0x15, 0x88, 0x09,
  0xcf, 0x4f, 0x3c
]);
const SALT = new Uint8Array([
  0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc,
  0xdd, 0xee, 0xff
]);

describe('ECE record size', () => {
  it('is 64 KiB', () => {
    expect(ECE_RECORD_SIZE).toBe(65536);
  });
});

describe('ECE header', () => {
  it('starts with the salt followed by record size and a zero keyid length', async () => {
    const cipher = await collect(
      encryptStream(streamOf(sequence(10)), KEY, ECE_RECORD_SIZE, SALT)
    );

    expect(cipher.subarray(0, 16)).toEqual(SALT);
    const view = new DataView(cipher.buffer, cipher.byteOffset);
    expect(view.getUint32(16, false)).toBe(ECE_RECORD_SIZE);
    expect(view.getUint8(20)).toBe(0);
  });

  it('is exactly 21 bytes, so ciphertext length matches encryptedSize()', async () => {
    for (const size of [1, 100, 65518, 65519, 131037]) {
      const cipher = await collect(
        encryptStream(streamOf(sequence(size)), KEY, ECE_RECORD_SIZE, SALT)
      );
      const records = Math.ceil(size / (ECE_RECORD_SIZE - 17));
      expect(cipher.length).toBe(21 + size + 17 * records);
    }
  });

  it('honours a custom record size', async () => {
    const rs = 4096;
    const cipher = await collect(
      encryptStream(streamOf(sequence(10)), KEY, rs, SALT)
    );
    const view = new DataView(cipher.buffer, cipher.byteOffset);
    expect(view.getUint32(16, false)).toBe(rs);
  });
});

describe('ECE round trip', () => {
  it('recovers the plaintext for sizes around the record boundary', async () => {
    // rs - 17 plaintext bytes fit in one record.
    const boundary = ECE_RECORD_SIZE - 17;
    for (const size of [
      1,
      2,
      1024,
      boundary - 1,
      boundary,
      boundary + 1,
      2 * boundary,
      2 * boundary + 1
    ]) {
      const plain = sequence(size);
      const cipher = encryptStream(streamOf(plain), KEY, ECE_RECORD_SIZE, SALT);
      const out = await collect(decryptStream(cipher, KEY));
      expect(out).toEqual(plain);
    }
  });

  it('is independent of how the input is chunked', async () => {
    const plain = sequence(200_000);
    const oneShot = await collect(
      encryptStream(streamOf(plain), KEY, ECE_RECORD_SIZE, SALT)
    );

    const chunked = await collect(
      encryptStream(
        streamOf(
          plain.subarray(0, 3),
          plain.subarray(3, 65_000),
          plain.subarray(65_000, 199_999),
          plain.subarray(199_999)
        ),
        KEY,
        ECE_RECORD_SIZE,
        SALT
      )
    );

    expect(chunked).toEqual(oneShot);
  });

  it('decrypts ciphertext delivered in arbitrary chunks', async () => {
    const plain = sequence(200_000);
    const cipher = await collect(
      encryptStream(streamOf(plain), KEY, ECE_RECORD_SIZE, SALT)
    );

    const pieces: Uint8Array[] = [];
    for (let i = 0; i < cipher.length; i += 7777) {
      pieces.push(cipher.subarray(i, Math.min(i + 7777, cipher.length)));
    }

    const out = await collect(decryptStream(streamOf(...pieces), KEY));
    expect(out).toEqual(plain);
  });

  it('handles the empty stream', async () => {
    const cipher = encryptStream(streamOf(), KEY, ECE_RECORD_SIZE, SALT);
    const out = await collect(decryptStream(cipher, KEY));
    expect(out.length).toBe(0);
  });
});

describe('ECE wire format snapshot', () => {
  // These vectors were produced independently by `http_ece@1.1.0` (the
  // reference RFC 8188 implementation this code was originally written
  // against) for the same key, salt and record size. They lock the derived
  // content key, the derived nonce base, the per-record nonce derivation and
  // the padding delimiters all at once: changing any HKDF info string, the
  // AES-GCM parameters or a delimiter breaks them.
  it('produces stable ciphertext for a fixed key and salt', async () => {
    const cipher = await collect(
      encryptStream(
        streamOf(new TextEncoder().encode('hello send')),
        KEY,
        ECE_RECORD_SIZE,
        SALT
      )
    );
    expect(Buffer.from(cipher).toString('hex')).toBe(
      '00112233445566778899aabbccddeeff0001000000' +
        '2ee069ab3562ad90bd0b445a58cfd835a0306b05f75594ada04612'
    );
  });

  it('produces stable ciphertext spanning two records', async () => {
    const rs = 64;
    const cipher = await collect(
      encryptStream(streamOf(sequence(100)), KEY, rs, SALT)
    );
    expect(Buffer.from(cipher).toString('hex')).toBe(
      '00112233445566778899aabbccddeeff0000004000' +
        '41a340a3d9e01f152c717ba6f5f8b55ea02264debb27834f2072268579236' +
        '4cada8a8ea1d460e5a49859c9f5e9543e396e3cc11323eec1a484d73087818' +
        'cbfcbf6e5ad2cbde83dd49f8cf99318d67d96bd4eb0d69e9c435bf9d732d99' +
        '25382c8716b75405cfc158e9b19089b8c998b2dd4a16d0895670fb5f79422d' +
        'ae1ad9853ee65a0c8e3b62913c3ddfeb30bba699f8b5469a59663e2'
    );
  });
});

describe('ECE padding delimiters', () => {
  it('rejects a truncated stream (final delimiter of 1)', async () => {
    const plain = sequence(2 * (ECE_RECORD_SIZE - 17));
    const cipher = await collect(
      encryptStream(streamOf(plain), KEY, ECE_RECORD_SIZE, SALT)
    );

    // Drop the final record; the previous one is now "last" but is padded
    // with delimiter 1.
    const truncated = cipher.subarray(0, 21 + ECE_RECORD_SIZE);
    await expect(
      collect(decryptStream(streamOf(truncated), KEY))
    ).rejects.toThrow('delimiter of final record is not 2');
  });

  it('rejects the wrong key', async () => {
    const cipher = await collect(
      encryptStream(streamOf(sequence(64)), KEY, ECE_RECORD_SIZE, SALT)
    );
    const wrong = new Uint8Array(16).fill(9);
    await expect(collect(decryptStream(streamOf(cipher), wrong))).rejects.toThrow();
  });

  it('rejects a header shorter than 21 bytes', async () => {
    await expect(
      collect(decryptStream(streamOf(new Uint8Array(20)), KEY))
    ).rejects.toThrow('chunk too small for reading header');
  });
});
