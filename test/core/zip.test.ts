import { describe, expect, it } from 'bun:test';
import crc32calc from 'crc/calculators/crc32';
import { streamToArrayBuffer } from '../../src/core/streams';
import Zip from '../../src/core/zip';

const encoder = new TextEncoder();

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

async function zipBytes(
  files: { name: string; size: number }[],
  ...chunks: Uint8Array[]
) {
  const zip = new Zip({ files }, streamOf(...chunks));
  const { stream, size } = { stream: zip.stream, size: zip.size };
  return { bytes: new Uint8Array(await streamToArrayBuffer(stream)), size };
}

function u32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);
}

function u16(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(offset, true);
}

describe('CRC32', () => {
  it('matches the standard check value', () => {
    // The canonical CRC-32 check value for "123456789".
    expect(crc32calc(encoder.encode('123456789')) >>> 0).toBe(0xcbf43926);
  });

  it('is chainable across chunk boundaries', () => {
    const whole = crc32calc(encoder.encode('123456789')) >>> 0;
    const chained =
      crc32calc(
        encoder.encode('456789'),
        crc32calc(encoder.encode('123'))
      ) >>> 0;
    expect(chained).toBe(whole);
  });

  it('treats a null seed the same as no seed', () => {
    expect(crc32calc(encoder.encode('abc'), undefined) >>> 0).toBe(
      crc32calc(encoder.encode('abc'), null as unknown as undefined) >>> 0
    );
  });
});

describe('Zip', () => {
  const HELLO = encoder.encode('hello');
  const WORLD = encoder.encode('world!');

  it('predicts the exact archive size before streaming', async () => {
    const { bytes, size } = await zipBytes(
      [
        { name: 'a.txt', size: HELLO.length },
        { name: 'b.txt', size: WORLD.length }
      ],
      HELLO,
      WORLD
    );
    expect(bytes.length).toBe(size);
  });

  it('writes local file headers with the data-descriptor and utf8 flags', async () => {
    const { bytes } = await zipBytes(
      [{ name: 'a.txt', size: HELLO.length }],
      HELLO
    );

    expect(u32(bytes, 0)).toBe(0x04034b50); // local header signature
    expect(u16(bytes, 4)).toBe(20); // version needed
    expect(u16(bytes, 6)).toBe(0x808); // data descriptor + utf8 name
    expect(u16(bytes, 8)).toBe(0); // stored, no compression
    expect(u32(bytes, 14)).toBe(0); // crc deferred to descriptor
    expect(u32(bytes, 18)).toBe(0); // sizes deferred to descriptor
    expect(u32(bytes, 22)).toBe(0);
    expect(u16(bytes, 26)).toBe(5); // name length
    expect(u16(bytes, 28)).toBe(0); // no extra field
    expect(new TextDecoder().decode(bytes.subarray(30, 35))).toBe('a.txt');
  });

  it('writes a data descriptor carrying the real crc and sizes', async () => {
    const { bytes } = await zipBytes(
      [{ name: 'a.txt', size: HELLO.length }],
      HELLO
    );

    const ddOffset = 30 + 5 + HELLO.length;
    expect(u32(bytes, ddOffset)).toBe(0x08074b50);
    expect(u32(bytes, ddOffset + 4)).toBe(crc32calc(HELLO) >>> 0);
    expect(u32(bytes, ddOffset + 8)).toBe(HELLO.length);
    expect(u32(bytes, ddOffset + 12)).toBe(HELLO.length);
  });

  it('writes a central directory and end-of-directory record', async () => {
    const { bytes } = await zipBytes(
      [
        { name: 'a.txt', size: HELLO.length },
        { name: 'b.txt', size: WORLD.length }
      ],
      HELLO,
      WORLD
    );

    const eodOffset = bytes.length - 22;
    expect(u32(bytes, eodOffset)).toBe(0x06054b50);
    expect(u16(bytes, eodOffset + 8)).toBe(2); // records on this disk
    expect(u16(bytes, eodOffset + 10)).toBe(2); // total records
    const directorySize = u32(bytes, eodOffset + 12);
    const directoryOffset = u32(bytes, eodOffset + 16);
    expect(directorySize).toBe(2 * (46 + 5));
    expect(directoryOffset).toBe(eodOffset - directorySize);

    // First central directory record.
    expect(u32(bytes, directoryOffset)).toBe(0x02014b50);
    expect(u32(bytes, directoryOffset + 16)).toBe(crc32calc(HELLO) >>> 0);
    expect(u32(bytes, directoryOffset + 20)).toBe(HELLO.length);
    expect(u32(bytes, directoryOffset + 42)).toBe(0); // first file at offset 0

    // Second record points past the first entry.
    const second = directoryOffset + 46 + 5;
    expect(u32(bytes, second)).toBe(0x02014b50);
    expect(u32(bytes, second + 16)).toBe(crc32calc(WORLD) >>> 0);
    expect(u32(bytes, second + 42)).toBe(30 + 5 + HELLO.length + 16);
  });

  it('splits a single source stream across file boundaries', async () => {
    // One chunk carries the tail of a.txt and the head of b.txt.
    const combined = new Uint8Array(HELLO.length + WORLD.length);
    combined.set(HELLO, 0);
    combined.set(WORLD, HELLO.length);

    const split = await zipBytes(
      [
        { name: 'a.txt', size: HELLO.length },
        { name: 'b.txt', size: WORLD.length }
      ],
      combined
    );
    const separate = await zipBytes(
      [
        { name: 'a.txt', size: HELLO.length },
        { name: 'b.txt', size: WORLD.length }
      ],
      HELLO,
      WORLD
    );

    expect(split.bytes.length).toBe(separate.bytes.length);
    const ddOffset = 30 + 5 + HELLO.length;
    expect(u32(split.bytes, ddOffset + 4)).toBe(crc32calc(HELLO) >>> 0);
  });

  it('encodes multi-byte file names as utf8', async () => {
    const name = 'ünïcø∂é.txt';
    const nameBytes = encoder.encode(name);
    const { bytes } = await zipBytes([{ name, size: HELLO.length }], HELLO);
    expect(u16(bytes, 26)).toBe(nameBytes.byteLength);
    expect(bytes.subarray(30, 30 + nameBytes.byteLength)).toEqual(nameBytes);
  });
});
