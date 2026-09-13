import { arrayToB64, b64ToArray } from './base64';
import { decryptStream, encryptStream } from './ece';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Nonce used before the server has issued one. Part of the wire protocol.
const INITIAL_NONCE = 'yRCdyQ1EMSA3mo4rqSkuNQ==';

export interface EncryptableMetadata {
  name: string;
  size: number;
  type?: string;
  manifest?: ArchiveManifest;
}

export interface ArchiveManifest {
  files: { name: string; size: number; type?: string }[];
}

export interface DecryptedMetadata {
  name: string;
  size: number;
  type: string;
  manifest: ArchiveManifest;
}

export default class Keychain {
  readonly rawSecret: Uint8Array;
  private _nonce: string;
  private readonly secretKeyPromise: Promise<CryptoKey>;
  private readonly metaKeyPromise: Promise<CryptoKey>;
  private authKeyPromise: Promise<CryptoKey>;

  constructor(secretKeyB64?: string, nonce?: string | null) {
    this._nonce = nonce || INITIAL_NONCE;
    if (secretKeyB64) {
      this.rawSecret = b64ToArray(secretKeyB64);
    } else {
      this.rawSecret = crypto.getRandomValues(new Uint8Array(16));
    }
    this.secretKeyPromise = crypto.subtle.importKey(
      'raw',
      this.rawSecret as BufferSource,
      'HKDF',
      false,
      ['deriveKey']
    );
    this.metaKeyPromise = this.secretKeyPromise.then(secretKey =>
      crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          salt: new Uint8Array(),
          info: encoder.encode('metadata'),
          hash: 'SHA-256'
        },
        secretKey,
        {
          name: 'AES-GCM',
          length: 128
        },
        false,
        ['encrypt', 'decrypt']
      )
    );
    this.authKeyPromise = this.secretKeyPromise.then(secretKey =>
      crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          salt: new Uint8Array(),
          info: encoder.encode('authentication'),
          hash: 'SHA-256'
        },
        secretKey,
        {
          name: 'HMAC',
          hash: { name: 'SHA-256' }
        },
        true,
        ['sign']
      )
    );
  }

  get nonce(): string {
    return this._nonce;
  }

  set nonce(n: string | null | undefined) {
    if (n && n !== this._nonce) {
      this._nonce = n;
    }
  }

  setPassword(password: string, shareUrl: string) {
    this.authKeyPromise = crypto.subtle
      .importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, [
        'deriveKey'
      ])
      .then(passwordKey =>
        crypto.subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: encoder.encode(shareUrl),
            iterations: 100,
            hash: 'SHA-256'
          },
          passwordKey,
          {
            name: 'HMAC',
            hash: 'SHA-256'
          },
          true,
          ['sign']
        )
      );
  }

  setAuthKey(authKeyB64: string) {
    this.authKeyPromise = crypto.subtle.importKey(
      'raw',
      b64ToArray(authKeyB64) as BufferSource,
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      true,
      ['sign']
    );
  }

  async authKeyB64(): Promise<string> {
    const authKey = await this.authKeyPromise;
    const rawAuth = await crypto.subtle.exportKey('raw', authKey);
    return arrayToB64(new Uint8Array(rawAuth));
  }

  async authHeader(): Promise<string> {
    const authKey = await this.authKeyPromise;
    const sig = await crypto.subtle.sign(
      { name: 'HMAC' },
      authKey,
      b64ToArray(this.nonce) as BufferSource
    );
    return `send-v1 ${arrayToB64(new Uint8Array(sig))}`;
  }

  async encryptMetadata(metadata: EncryptableMetadata): Promise<ArrayBuffer> {
    const metaKey = await this.metaKeyPromise;
    return crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(12),
        tagLength: 128
      },
      metaKey,
      encoder.encode(
        JSON.stringify({
          name: metadata.name,
          size: metadata.size,
          type: metadata.type || 'application/octet-stream',
          manifest: metadata.manifest || {}
        })
      )
    );
  }

  encryptStream(plainStream: ReadableStream<Uint8Array>) {
    return encryptStream(plainStream, this.rawSecret);
  }

  decryptStream(cryptotext: ReadableStream<Uint8Array>) {
    return decryptStream(cryptotext, this.rawSecret);
  }

  async decryptMetadata(ciphertext: Uint8Array): Promise<DecryptedMetadata> {
    const metaKey = await this.metaKeyPromise;
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(12),
        tagLength: 128
      },
      metaKey,
      ciphertext as BufferSource
    );
    return JSON.parse(decoder.decode(plaintext));
  }
}
