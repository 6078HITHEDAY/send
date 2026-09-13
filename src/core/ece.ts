import { transformStream } from './streams';

// RFC 8188 "aes128gcm" content encoding. Every constant below is part of the
// on-the-wire format of files already stored by deployed Send instances:
// changing any of them makes existing links undecryptable.
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 16;
const MODE_ENCRYPT = 'encrypt';
const MODE_DECRYPT = 'decrypt';
export const ECE_RECORD_SIZE = 1024 * 64;

type Mode = typeof MODE_ENCRYPT | typeof MODE_DECRYPT;

const encoder = new TextEncoder();

function generateSalt(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function viewOf(array: Uint8Array): DataView {
  return new DataView(array.buffer, array.byteOffset, array.byteLength);
}

class ECETransformer {
  private prevChunk: Uint8Array | undefined;
  private seq = 0;
  private firstchunk = true;
  private key!: CryptoKey;
  private nonceBase!: Uint8Array;

  constructor(
    private readonly mode: Mode,
    private readonly ikm: Uint8Array,
    private rs: number,
    private salt: Uint8Array
  ) {}

  private async generateKey(): Promise<CryptoKey> {
    const inputKey = await crypto.subtle.importKey(
      'raw',
      this.ikm as BufferSource,
      'HKDF',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: this.salt as BufferSource,
        info: encoder.encode('Content-Encoding: aes128gcm\0'),
        hash: 'SHA-256'
      },
      inputKey,
      {
        name: 'AES-GCM',
        length: 128
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async generateNonceBase(): Promise<Uint8Array> {
    const inputKey = await crypto.subtle.importKey(
      'raw',
      this.ikm as BufferSource,
      'HKDF',
      false,
      ['deriveKey']
    );

    const base = await crypto.subtle.exportKey(
      'raw',
      await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          salt: this.salt as BufferSource,
          info: encoder.encode('Content-Encoding: nonce\0'),
          hash: 'SHA-256'
        },
        inputKey,
        {
          name: 'AES-GCM',
          length: 128
        },
        true,
        ['encrypt', 'decrypt']
      )
    );

    return new Uint8Array(base, 0, NONCE_LENGTH);
  }

  private generateNonce(seq: number): Uint8Array {
    if (seq > 0xffffffff) {
      throw new Error('record sequence number exceeds limit');
    }
    const nonce = new Uint8Array(this.nonceBase);
    const view = viewOf(nonce);
    const m = view.getUint32(nonce.length - 4, false);
    const xor = (m ^ seq) >>> 0; // forces unsigned int xor
    view.setUint32(nonce.length - 4, xor, false);

    return nonce;
  }

  private pad(data: Uint8Array, isLast: boolean): Uint8Array {
    const len = data.length;
    if (len + TAG_LENGTH >= this.rs) {
      throw new Error('data too large for record size');
    }

    if (isLast) {
      const padding = new Uint8Array(1);
      padding[0] = 2;
      return concat(data, padding);
    }
    const padding = new Uint8Array(this.rs - len - TAG_LENGTH);
    padding[0] = 1;
    return concat(data, padding);
  }

  private unpad(data: Uint8Array, isLast: boolean): Uint8Array {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i]) {
        if (isLast) {
          if (data[i] !== 2) {
            throw new Error('delimiter of final record is not 2');
          }
        } else {
          if (data[i] !== 1) {
            throw new Error('delimiter of not final record is not 1');
          }
        }
        return data.slice(0, i);
      }
    }
    throw new Error('no delimiter found');
  }

  private createHeader(): Uint8Array {
    const nums = new Uint8Array(5);
    const view = viewOf(nums);
    view.setUint32(0, this.rs, false);
    view.setUint8(4, 0);
    return concat(this.salt, nums);
  }

  private readHeader(buffer: Uint8Array): { salt: Uint8Array; rs: number } {
    if (buffer.length < 21) {
      throw new Error('chunk too small for reading header');
    }
    const view = viewOf(buffer);
    return {
      salt: buffer.slice(0, KEY_LENGTH),
      rs: view.getUint32(KEY_LENGTH, false)
    };
  }

  private async encryptRecord(
    buffer: Uint8Array,
    seq: number,
    isLast: boolean
  ): Promise<Uint8Array> {
    const nonce = this.generateNonce(seq);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      this.key,
      this.pad(buffer, isLast) as BufferSource
    );
    return new Uint8Array(encrypted);
  }

  private async decryptRecord(
    buffer: Uint8Array,
    seq: number,
    isLast: boolean
  ): Promise<Uint8Array> {
    const nonce = this.generateNonce(seq);
    const data = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce as BufferSource,
        tagLength: 128
      },
      this.key,
      buffer as BufferSource
    );

    return this.unpad(new Uint8Array(data), isLast);
  }

  async start(controller: TransformStreamDefaultController<Uint8Array>) {
    if (this.mode === MODE_ENCRYPT) {
      this.key = await this.generateKey();
      this.nonceBase = await this.generateNonceBase();
      controller.enqueue(this.createHeader());
    } else if (this.mode !== MODE_DECRYPT) {
      throw new Error('mode must be either encrypt or decrypt');
    }
  }

  private async transformPrevChunk(
    isLast: boolean,
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    const prevChunk = this.prevChunk as Uint8Array;
    if (this.mode === MODE_ENCRYPT) {
      controller.enqueue(await this.encryptRecord(prevChunk, this.seq, isLast));
      this.seq++;
    } else {
      if (this.seq === 0) {
        // the first chunk during decryption contains only the header
        const header = this.readHeader(prevChunk);
        this.salt = header.salt;
        this.rs = header.rs;
        this.key = await this.generateKey();
        this.nonceBase = await this.generateNonceBase();
      } else {
        controller.enqueue(
          await this.decryptRecord(prevChunk, this.seq - 1, isLast)
        );
      }
      this.seq++;
    }
  }

  async transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    if (!this.firstchunk) {
      await this.transformPrevChunk(false, controller);
    }
    this.firstchunk = false;
    this.prevChunk = chunk;
  }

  async flush(controller: TransformStreamDefaultController<Uint8Array>) {
    if (this.prevChunk) {
      await this.transformPrevChunk(true, controller);
    }
  }
}

/**
 * Reslices an arbitrarily-chunked stream into record-sized pieces. When
 * encrypting, records hold `rs - 17` plaintext bytes (16 byte tag + 1 byte
 * delimiter). When decrypting, the first slice is the 21 byte header and every
 * subsequent slice is a full `rs` byte record.
 */
class StreamSlicer {
  private chunkSize: number;
  private partialChunk: Uint8Array;
  private offset = 0;

  constructor(
    private readonly rs: number,
    private readonly mode: Mode
  ) {
    this.chunkSize = mode === MODE_ENCRYPT ? rs - 17 : 21;
    this.partialChunk = new Uint8Array(this.chunkSize);
  }

  private send(
    buf: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    controller.enqueue(buf);
    if (this.chunkSize === 21 && this.mode === MODE_DECRYPT) {
      this.chunkSize = this.rs;
    }
    this.partialChunk = new Uint8Array(this.chunkSize);
    this.offset = 0;
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<Uint8Array>
  ) {
    let i = 0;

    if (this.offset > 0) {
      const len = Math.min(chunk.byteLength, this.chunkSize - this.offset);
      this.partialChunk.set(chunk.slice(0, len), this.offset);
      this.offset += len;
      i += len;

      if (this.offset === this.chunkSize) {
        this.send(this.partialChunk, controller);
      }
    }

    while (i < chunk.byteLength) {
      const remainingBytes = chunk.byteLength - i;
      if (remainingBytes >= this.chunkSize) {
        const record = chunk.slice(i, i + this.chunkSize);
        i += this.chunkSize;
        this.send(record, controller);
      } else {
        const end = chunk.slice(i, i + remainingBytes);
        i += end.byteLength;
        this.partialChunk.set(end);
        this.offset = end.byteLength;
      }
    }
  }

  flush(controller: TransformStreamDefaultController<Uint8Array>) {
    if (this.offset > 0) {
      controller.enqueue(this.partialChunk.slice(0, this.offset));
    }
  }
}

/**
 * @param input stream containing the plaintext
 * @param key   `KEY_LENGTH` byte input keying material
 */
export function encryptStream(
  input: ReadableStream<Uint8Array>,
  key: Uint8Array,
  rs: number = ECE_RECORD_SIZE,
  salt: Uint8Array = generateSalt(KEY_LENGTH)
): ReadableStream<Uint8Array> {
  const mode = MODE_ENCRYPT;
  const inputStream = transformStream(input, new StreamSlicer(rs, mode));
  return transformStream(inputStream, new ECETransformer(mode, key, rs, salt));
}

/**
 * @param input stream containing the ciphertext, starting with the 21 byte header
 * @param key   `KEY_LENGTH` byte input keying material
 */
export function decryptStream(
  input: ReadableStream<Uint8Array>,
  key: Uint8Array,
  rs: number = ECE_RECORD_SIZE
): ReadableStream<Uint8Array> {
  const mode = MODE_DECRYPT;
  const inputStream = transformStream(input, new StreamSlicer(rs, mode));
  return transformStream(
    inputStream,
    new ECETransformer(mode, key, rs, new Uint8Array(KEY_LENGTH))
  );
}
