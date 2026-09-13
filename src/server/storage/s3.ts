import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Config } from '../config';
import type { BlobStorage } from './types';

export class S3Storage implements BlobStorage {
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(config: Config) {
    this.bucket = config.s3_bucket;
    this.s3 = new S3Client({
      ...(config.s3_endpoint ? { endpoint: config.s3_endpoint } : {}),
      forcePathStyle: config.s3_use_path_style_endpoint
    });
  }

  async length(id: string): Promise<number> {
    const result = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: id })
    );
    return Number(result.ContentLength);
  }

  async getStream(id: string): Promise<ReadableStream<Uint8Array>> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: id })
    );
    return result.Body?.transformToWebStream() as ReadableStream<Uint8Array>;
  }

  /**
   * `lib-storage` streams the body as a multipart upload and aborts the
   * in-flight parts if the source fails, replacing the v2 `upload().abort()`
   * wiring.
   */
  async set(id: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: id,
        Body: Readable.fromWeb(stream as never)
      }
    });
    try {
      await upload.done();
    } catch (e) {
      await upload.abort().catch(() => {});
      throw e;
    }
  }

  async del(id: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: id })
    );
  }

  ping(): Promise<unknown> {
    return this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}

export default S3Storage;
