import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';
import type { BlobStorage } from './types';

export class FSStorage implements BlobStorage {
  private readonly dir: string;

  constructor(config: Config) {
    this.dir = config.file_dir;
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string): string {
    return path.join(this.dir, id);
  }

  async length(id: string): Promise<number> {
    return Bun.file(this.path(id)).size;
  }

  async getStream(id: string): Promise<ReadableStream<Uint8Array>> {
    return Bun.file(this.path(id)).stream();
  }

  async set(id: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const filepath = this.path(id);
    try {
      await Bun.write(filepath, new Response(stream));
    } catch (e) {
      await unlink(filepath).catch(() => {});
      throw e;
    }
  }

  async del(id: string): Promise<void> {
    await unlink(this.path(id));
  }

  async ping(): Promise<void> {}
}

export default FSStorage;
