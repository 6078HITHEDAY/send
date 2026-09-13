// The `crc/calculators/*` entry points operate directly on byte arrays. The
// top-level `crc` export wraps them in `Buffer.from`, which would drag a
// Buffer polyfill into the browser bundle.
import crc32calc from 'crc/calculators/crc32';
import type { ArchiveManifest } from './keychain';

const encoder = new TextEncoder();

function crc32(value: Uint8Array, previous?: number | null): number {
  return crc32calc(value, previous ?? undefined) >>> 0;
}

function dosDateTime(dateTime = new Date()) {
  const year = (dateTime.getFullYear() - 1980) << 9;
  const month = (dateTime.getMonth() + 1) << 5;
  const day = dateTime.getDate();
  const date = year | month | day;
  const hour = dateTime.getHours() << 11;
  const minute = dateTime.getMinutes() << 5;
  const second = Math.floor(dateTime.getSeconds() / 2);
  const time = hour | minute | second;

  return { date, time };
}

class ZipFile {
  private readonly name: Uint8Array;
  readonly size: number;
  bytesRead = 0;
  private crc: number | null = null;
  private readonly dateTime: { date: number; time: number };

  constructor(info: { name: string; size: number }) {
    this.name = encoder.encode(info.name);
    this.size = info.size;
    this.dateTime = dosDateTime();
  }

  get header(): Uint8Array {
    const h = new ArrayBuffer(30 + this.name.byteLength);
    const v = new DataView(h);
    v.setUint32(0, 0x04034b50, true); // sig
    v.setUint16(4, 20, true); // version
    v.setUint16(6, 0x808, true); // bit flags (use data descriptor(8) + utf8-encoded(8 << 8))
    v.setUint16(8, 0, true); // compression
    v.setUint16(10, this.dateTime.time, true); // modified time
    v.setUint16(12, this.dateTime.date, true); // modified date
    v.setUint32(14, 0, true); // crc32 (in descriptor)
    v.setUint32(18, 0, true); // compressed size (in descriptor)
    v.setUint32(22, 0, true); // uncompressed size (in descriptor)
    v.setUint16(26, this.name.byteLength, true); // name length
    v.setUint16(28, 0, true); // extra field length
    for (let i = 0; i < this.name.byteLength; i++) {
      v.setUint8(30 + i, this.name[i] as number);
    }
    return new Uint8Array(h);
  }

  get dataDescriptor(): Uint8Array {
    const dd = new ArrayBuffer(16);
    const v = new DataView(dd);
    v.setUint32(0, 0x08074b50, true); // sig
    v.setUint32(4, this.crc as number, true); // crc32
    v.setUint32(8, this.size, true); // compressed size
    v.setUint32(12, this.size, true); // uncompressed size
    return new Uint8Array(dd);
  }

  directoryRecord(offset: number): Uint8Array {
    const dr = new ArrayBuffer(46 + this.name.byteLength);
    const v = new DataView(dr);
    v.setUint32(0, 0x02014b50, true); // sig
    v.setUint16(4, 20, true); // version made
    v.setUint16(6, 20, true); // version required
    v.setUint16(8, 0x808, true); // bit flags (use data descriptor(8) + utf8-encoded(8 << 8))
    v.setUint16(10, 0, true); // compression
    v.setUint16(12, this.dateTime.time, true); // modified time
    v.setUint16(14, this.dateTime.date, true); // modified date
    v.setUint32(16, this.crc as number, true); // crc
    v.setUint32(20, this.size, true); // compressed size
    v.setUint32(24, this.size, true); // uncompressed size
    v.setUint16(28, this.name.byteLength, true); // name length
    v.setUint16(30, 0, true); // extra length
    v.setUint16(32, 0, true); // comment length
    v.setUint16(34, 0, true); // disk number
    v.setUint16(36, 0, true); // internal file attrs
    v.setUint32(38, 0, true); // external file attrs
    v.setUint32(42, offset, true); // file offset
    for (let i = 0; i < this.name.byteLength; i++) {
      v.setUint8(46 + i, this.name[i] as number);
    }
    return new Uint8Array(dr);
  }

  get byteLength(): number {
    return this.size + this.name.byteLength + 30 + 16;
  }

  append(
    data: Uint8Array,
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Uint8Array | undefined {
    this.bytesRead += data.byteLength;
    const endIndex = data.byteLength - Math.max(this.bytesRead - this.size, 0);
    const buf = data.slice(0, endIndex);
    this.crc = crc32(buf, this.crc);
    controller.enqueue(buf);
    if (endIndex < data.byteLength) {
      return data.slice(endIndex, data.byteLength);
    }
    return undefined;
  }
}

function centralDirectory(
  files: ZipFile[],
  controller: ReadableStreamDefaultController<Uint8Array>
) {
  let directoryOffset = 0;
  let directorySize = 0;
  for (const file of files) {
    const record = file.directoryRecord(directoryOffset);
    directoryOffset += file.byteLength;
    controller.enqueue(record);
    directorySize += record.byteLength;
  }
  controller.enqueue(eod(files.length, directorySize, directoryOffset));
}

function eod(
  fileCount: number,
  directorySize: number,
  directoryOffset: number
): Uint8Array {
  const e = new ArrayBuffer(22);
  const v = new DataView(e);
  v.setUint32(0, 0x06054b50, true); // sig
  v.setUint16(4, 0, true); // disk number
  v.setUint16(6, 0, true); // directory disk
  v.setUint16(8, fileCount, true); // number of records
  v.setUint16(10, fileCount, true); // total records
  v.setUint32(12, directorySize, true); // size of directory
  v.setUint32(16, directoryOffset, true); // offset of directory
  v.setUint16(20, 0, true); // comment length
  return new Uint8Array(e);
}

class ZipStreamController implements UnderlyingDefaultSource<Uint8Array> {
  private fileIndex = 0;
  private file: ZipFile | undefined;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private extra: Uint8Array | undefined;

  constructor(
    private readonly files: ZipFile[],
    source: ReadableStream<Uint8Array>
  ) {
    this.reader = source.getReader();
    this.nextFile();
  }

  private nextFile() {
    this.file = this.files[this.fileIndex++];
  }

  async pull(
    controller: ReadableStreamDefaultController<Uint8Array>
  ): Promise<void> {
    const file = this.file;
    if (!file) {
      // end of archive
      centralDirectory(this.files, controller);
      controller.close();
      return;
    }
    if (file.bytesRead === 0) {
      // beginning of file
      controller.enqueue(file.header);
      if (this.extra) {
        this.extra = file.append(this.extra, controller);
      }
    }
    if (file.bytesRead >= file.size) {
      // end of file
      controller.enqueue(file.dataDescriptor);
      this.nextFile();
      return this.pull(controller);
    }
    const data = await this.reader.read();
    if (data.done) {
      this.nextFile();
      return this.pull(controller);
    }
    this.extra = file.append(data.value, controller);
  }
}

export default class Zip {
  private readonly files: ZipFile[];

  constructor(
    manifest: ArchiveManifest,
    private readonly source: ReadableStream<Uint8Array>
  ) {
    this.files = manifest.files.map(info => new ZipFile(info));
  }

  get stream(): ReadableStream<Uint8Array> {
    return new ReadableStream(new ZipStreamController(this.files, this.source));
  }

  get size(): number {
    const entries = this.files.reduce(
      (total, file) => total + file.byteLength * 2 - file.size,
      0
    );
    const eodSize = 22;
    return entries + eodSize;
  }
}
