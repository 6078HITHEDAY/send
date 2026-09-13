import { describe, expect, it } from 'bun:test';
import { arrayToB64, b64ToArray } from '../../src/core/base64';
import Keychain from '../../src/core/keychain';
import { streamToArrayBuffer } from '../../src/core/streams';

const SECRET_B64 = 'SPIfAlwbnncIFw3hEHYihw';

function streamOf(chunk: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    }
  });
}

describe('Keychain', () => {
  it('generates a 16 byte secret when none is supplied', () => {
    expect(new Keychain().rawSecret.length).toBe(16);
  });

  it('round trips the secret through base64', () => {
    const keychain = new Keychain(SECRET_B64);
    expect(arrayToB64(keychain.rawSecret)).toBe(SECRET_B64);
  });

  it('defaults to the protocol initial nonce', () => {
    // The client must send this exact nonce on the first authenticated
    // request; the server seeds metadata with it.
    expect(new Keychain().nonce).toBe('yRCdyQ1EMSA3mo4rqSkuNQ==');
  });

  it('ignores empty nonce updates but accepts new ones', () => {
    const keychain = new Keychain(SECRET_B64);
    keychain.nonce = null;
    expect(keychain.nonce).toBe('yRCdyQ1EMSA3mo4rqSkuNQ==');
    keychain.nonce = 'AAAAAAAAAAAAAAAAAAAAAA==';
    expect(keychain.nonce).toBe('AAAAAAAAAAAAAAAAAAAAAA==');
  });

  it('derives a stable auth key from the secret via HKDF info "authentication"', async () => {
    const keychain = new Keychain(SECRET_B64);
    expect(await keychain.authKeyB64()).toBe(
      'TQOGtmQ8-ZfnWu6Iq-U1IAVBVREFuI17xqsW1shiC8eMCa-a5qeYTvoX3-5kCoCha8R59ycnPDnTz75clLBmbQ'
    );
  });

  it('signs the nonce with the derived auth key as a send-v1 header', async () => {
    // Cross-checked against node:crypto hkdfSync + createHmac.
    const keychain = new Keychain(SECRET_B64);
    const header = await keychain.authHeader();
    expect(header).toBe(
      'send-v1 ivTSaRianqzGAnoyWPCiO0GgkMfPE9TkovDrR6YeF4E'
    );
  });

  it('rotates the signature when the nonce changes', async () => {
    const keychain = new Keychain(SECRET_B64);
    const first = await keychain.authHeader();
    keychain.nonce = 'AAAAAAAAAAAAAAAAAAAAAA==';
    expect(await keychain.authHeader()).not.toBe(first);
  });

  it('replaces the auth key when a password is set', async () => {
    const keychain = new Keychain(SECRET_B64);
    const derived = await keychain.authKeyB64();
    keychain.setPassword('hunter2', 'https://send.example/download/abcdef0123#k');
    expect(await keychain.authKeyB64()).not.toBe(derived);
  });

  it('derives the same password auth key for the same password and url', async () => {
    const url = 'https://send.example/download/abcdef0123#k';
    const a = new Keychain(SECRET_B64);
    const b = new Keychain(SECRET_B64);
    a.setPassword('hunter2', url);
    b.setPassword('hunter2', url);
    expect(await a.authKeyB64()).toBe(await b.authKeyB64());
  });

  it('binds the password auth key to the share url', async () => {
    const a = new Keychain(SECRET_B64);
    const b = new Keychain(SECRET_B64);
    a.setPassword('hunter2', 'https://send.example/download/aaaaaaaaaa#k');
    b.setPassword('hunter2', 'https://send.example/download/bbbbbbbbbb#k');
    expect(await a.authKeyB64()).not.toBe(await b.authKeyB64());
  });

  it('accepts an imported auth key', async () => {
    const keychain = new Keychain(SECRET_B64);
    const raw = arrayToB64(new Uint8Array(32).fill(7));
    keychain.setAuthKey(raw);
    expect(await keychain.authKeyB64()).toBe(raw);
  });

  it('round trips metadata and fills in defaults', async () => {
    const keychain = new Keychain(SECRET_B64);
    const cipher = await keychain.encryptMetadata({
      name: 'a file.txt',
      size: 1234
    });
    const meta = await keychain.decryptMetadata(new Uint8Array(cipher));
    expect(meta).toEqual({
      name: 'a file.txt',
      size: 1234,
      type: 'application/octet-stream',
      manifest: {}
    });
  });

  it('encrypts metadata deterministically with a zero IV', async () => {
    // A fixed IV is safe here only because the metadata key is used once per
    // file. It also means the ciphertext is a stable vector.
    const keychain = new Keychain(SECRET_B64);
    const cipher = await keychain.encryptMetadata({
      name: 'a file.txt',
      size: 1234
    });
    // Cross-checked against node:crypto hkdfSync + aes-128-gcm.
    expect(arrayToB64(new Uint8Array(cipher))).toBe(
      '4rDp1kDwxahroTtKTgM3k95o5m0yoamyYtGmFMPVlpssmdeMhuj86yDkbE81XLK-' +
        'rmVtOEJOZ5khhGUzpCRgVUN2Ibsk5nQtV-18w8UuM8jCJcZEJixkxKQSZ_rf_xH60A'
    );
  });

  it('cannot decrypt metadata encrypted under a different secret', async () => {
    const a = new Keychain(SECRET_B64);
    const b = new Keychain(arrayToB64(new Uint8Array(16).fill(3)));
    const cipher = await a.encryptMetadata({ name: 'x', size: 1 });
    await expect(b.decryptMetadata(new Uint8Array(cipher))).rejects.toThrow();
  });

  it('round trips a file through encryptStream/decryptStream', async () => {
    const keychain = new Keychain(SECRET_B64);
    const plain = new Uint8Array(100_000);
    for (let i = 0; i < plain.length; i++) {
      plain[i] = i & 0xff;
    }
    const cipher = keychain.encryptStream(streamOf(plain));
    const out = new Uint8Array(
      await streamToArrayBuffer(keychain.decryptStream(cipher))
    );
    expect(out).toEqual(plain);
  });

  it('produces a different secret per instance', () => {
    expect(arrayToB64(new Keychain().rawSecret)).not.toBe(
      arrayToB64(new Keychain().rawSecret)
    );
  });
});

describe('WebCrypto primitives', () => {
  // Ported verbatim from the original browser test suite. These pin the
  // platform behaviour the keychain depends on, independently of our code.
  const encoder = new TextEncoder();
  const secret = b64ToArray(SECRET_B64);

  it('matches the known PBKDF2 + AES-GCM vector', async () => {
    const base = await crypto.subtle.importKey(
      'raw',
      secret,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('metadata'),
        iterations: 100,
        hash: 'SHA-256'
      },
      base,
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt']
    );
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), tagLength: 128 },
      key,
      encoder.encode('hello world!')
    );
    expect(arrayToB64(new Uint8Array(cipher))).toBe(
      'UXQQ4yVf55TRk9AZtz5QCwFofRvh-HdWJyxSCQ'
    );
  });

  it('matches the known PBKDF2 + HMAC vectors', async () => {
    const base = await crypto.subtle.importKey(
      'raw',
      secret,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('authentication'),
        iterations: 100,
        hash: 'SHA-256'
      },
      base,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      true,
      ['sign']
    );
    expect(arrayToB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)))).toBe(
      'wxXDmHgmMgrcDVD8zbDLRl2yNa8jSAQgsaeIBZ4vueygpxzaTK6ZE_6X-XHvllBly6pSuFNbSxcve0ZHhVdcEA'
    );
    const sig = await crypto.subtle.sign(
      { name: 'HMAC' },
      key,
      encoder.encode('test')
    );
    expect(arrayToB64(new Uint8Array(sig))).toBe(
      'AOi4HcoCJxQ4nUYxlmHB1rlcxQBn-zVjrSHz-VW7S-I'
    );
  });

  it('matches the known HKDF vectors', async () => {
    const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
      'deriveKey'
    ]);
    const enc = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: new Uint8Array(),
        info: encoder.encode('encryption'),
        hash: 'SHA-256'
      },
      base,
      { name: 'AES-GCM', length: 128 },
      true,
      ['encrypt', 'decrypt']
    );
    expect(arrayToB64(new Uint8Array(await crypto.subtle.exportKey('raw', enc)))).toBe(
      'g7okjWWO9yueDz16-owShQ'
    );

    const auth = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: new Uint8Array(),
        info: encoder.encode('authentication'),
        hash: 'SHA-256'
      },
      base,
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      true,
      ['sign']
    );
    expect(arrayToB64(new Uint8Array(await crypto.subtle.exportKey('raw', auth)))).toBe(
      'TQOGtmQ8-ZfnWu6Iq-U1IAVBVREFuI17xqsW1shiC8eMCa-a5qeYTvoX3-5kCoCha8R59ycnPDnTz75clLBmbQ'
    );
  });
});
