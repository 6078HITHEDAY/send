import type { Config } from '../config';
import config from '../config';
import type { Logger } from '../log';
import { createLogger } from '../log';
import Metadata from '../metadata';
import type { RedisLike } from './redis';
import { createRedisClient, MemoryRedis } from './redis';
import type { BlobStorage } from './types';

/**
 * Blobs are stored under a day-bucketed prefix so an object lifecycle rule can
 * expire them in bulk. See s3-lifecycle-example.xml.
 */
function getPrefix(seconds: number): number {
  return Math.max(Math.floor(seconds / 86400), 1);
}

async function selectBackend(config: Config): Promise<BlobStorage> {
  if (config.s3_bucket) {
    const { S3Storage } = await import('./s3');
    return new S3Storage(config);
  }
  if (config.gcs_bucket) {
    const { GCSStorage } = await import('./gcs');
    return new GCSStorage(config);
  }
  const { FSStorage } = await import('./fs');
  return new FSStorage(config);
}

export class DB {
  readonly log: Logger;

  constructor(
    private readonly storage: BlobStorage,
    readonly redis: RedisLike,
    private readonly defaultExpireSeconds: number
  ) {
    this.log = createLogger('send.storage');
  }

  async ttl(id: string): Promise<number> {
    const result = await this.redis.ttl(id);
    return Math.ceil(result) * 1000;
  }

  private async getPrefixedId(id: string): Promise<string> {
    const prefix = await this.redis.hget(id, 'prefix');
    return `${prefix}-${id}`;
  }

  async length(id: string): Promise<number> {
    return this.storage.length(await this.getPrefixedId(id));
  }

  async get(id: string): Promise<ReadableStream<Uint8Array>> {
    return this.storage.getStream(await this.getPrefixedId(id));
  }

  /**
   * The metadata write is awaited so that a client which receives the upload
   * response can immediately authenticate against the stored nonce. The old
   * implementation fired hset/hmset/expire without awaiting, which left a
   * window where the file existed but had no metadata.
   */
  async set(
    id: string,
    stream: ReadableStream<Uint8Array>,
    meta?: Record<string, string>,
    expireSeconds: number = this.defaultExpireSeconds
  ): Promise<void> {
    const prefix = getPrefix(expireSeconds);
    await this.storage.set(`${prefix}-${id}`, stream);
    await this.redis.hset(id, 'prefix', String(prefix));
    if (meta) {
      await this.redis.hmset(id, meta);
    }
    await this.redis.expire(id, expireSeconds);
  }

  async setField(id: string, key: string, value: string): Promise<void> {
    await this.redis.hset(id, key, value);
  }

  async incrementField(id: string, key: string, increment = 1): Promise<void> {
    await this.redis.hincrby(id, key, increment);
  }

  async del(id: string): Promise<void> {
    const filePath = await this.getPrefixedId(id);
    await this.storage.del(filePath);
    await this.redis.del(id);
  }

  async ping(): Promise<void> {
    await this.redis.ping();
    await this.storage.ping();
  }

  async metadata(id: string): Promise<Metadata | null> {
    const result = await this.redis.hgetall(id);
    return result && Object.keys(result).length > 0
      ? new Metadata(result)
      : null;
  }
}

const log = createLogger('send.storage');

/**
 * Matches the old behaviour of swapping in `redis-mock`: a default local
 * development or test run needs no Redis server.
 */
function selectRedis(): RedisLike {
  const local = config.redis_host === 'localhost';
  if (config.env === 'test' || (config.env === 'development' && local)) {
    return new MemoryRedis();
  }
  return createRedisClient(config, log);
}

const storage = new DB(
  await selectBackend(config),
  selectRedis(),
  config.default_expire_seconds
);

export default storage;
