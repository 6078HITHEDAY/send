import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Storage } from '@google-cloud/storage';
import type { Config } from '../config';
import type { BlobStorage } from './types';

const storage = new Storage();

export class GCSStorage implements BlobStorage {
  private readonly bucket: ReturnType<Storage['bucket']>;

  constructor(config: Config) {
    this.bucket = storage.bucket(config.gcs_bucket);
  }

  async length(id: string): Promise<number> {
    const [metadata] = await this.bucket.file(id).getMetadata();
    return Number(metadata.size);
  }

  async getStream(id: string): Promise<ReadableStream<Uint8Array>> {
    const nodeStream = this.bucket.file(id).createReadStream({
      validation: false
    });
    return Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  }

  async set(id: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const writeStream = this.bucket.file(id).createWriteStream({
      validation: false,
      resumable: true
    });
    await pipeline(
      Readable.fromWeb(stream as never),
      writeStream as unknown as Writable
    );
  }

  async del(id: string): Promise<void> {
    await this.bucket.file(id).delete();
  }

  ping(): Promise<unknown> {
    return this.bucket.exists();
  }
}

export default GCSStorage;
