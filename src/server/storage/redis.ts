import { RedisClient } from 'bun';
import type { Config } from '../config';
import type { Logger } from '../log';

/**
 * The commands `DB` needs. Everything here maps onto a native
 * `Bun.RedisClient` method, so the old hand-written `promisify` wrappers are
 * gone; the interface exists so tests can inject `MemoryRedis`.
 */
export interface RedisLike {
  ttl(key: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<number>;
  hmset(key: string, fields: Record<string, string>): Promise<'OK'>;
  hincrby(key: string, field: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  close?(): void;
}

export function redisUrl(config: Config): string {
  const auth = config.redis_password
    ? `${encodeURIComponent(config.redis_user)}:${encodeURIComponent(
        config.redis_password
      )}@`
    : '';
  const db = config.redis_db ? `/${config.redis_db}` : '';
  return `redis://${auth}${config.redis_host}:${config.redis_port}${db}`;
}

export function createRedisClient(config: Config, log: Logger): RedisLike {
  const client = new RedisClient(redisUrl(config), {
    connectionTimeout: config.redis_retry_time,
    autoReconnect: true,
    enableOfflineQueue: true
  });
  client.onclose = error => {
    log.error({ op: 'redis.close', err: error?.message });
  };
  return client as unknown as RedisLike;
}

/** In-memory stand-in used by tests and by `bun test`-driven server runs. */
export class MemoryRedis implements RedisLike {
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly expiries = new Map<string, number>();

  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  private live(key: string): boolean {
    const expiry = this.expiries.get(key);
    if (expiry !== undefined && expiry <= Date.now()) {
      this.hashes.delete(key);
      this.expiries.delete(key);
      return false;
    }
    return this.hashes.has(key);
  }

  async ttl(key: string): Promise<number> {
    if (!this.live(key)) return -2;
    const expiry = this.expiries.get(key);
    if (expiry === undefined) return -1;
    return Math.ceil((expiry - Date.now()) / 1000);
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (!this.live(key)) return null;
    return this.hash(key).get(field) ?? null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.live(key)) return {};
    return Object.fromEntries(this.hash(key));
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const existed = this.hash(key).has(field);
    this.hash(key).set(field, value);
    return existed ? 0 : 1;
  }

  async hmset(key: string, fields: Record<string, string>): Promise<'OK'> {
    for (const [field, value] of Object.entries(fields)) {
      this.hash(key).set(field, String(value));
    }
    return 'OK';
  }

  async hincrby(
    key: string,
    field: string,
    increment: number
  ): Promise<number> {
    const next = Number(this.hash(key).get(field) ?? 0) + increment;
    this.hash(key).set(field, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.hashes.has(key)) return 0;
    this.expiries.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async del(key: string): Promise<number> {
    this.expiries.delete(key);
    return this.hashes.delete(key) ? 1 : 0;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}
