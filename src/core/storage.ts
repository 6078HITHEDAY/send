import { arrayToB64 } from './base64';
import type { OwnedFileJSON } from './ownedFile';
import OwnedFile from './ownedFile';
import { isFile } from './utils';

interface StorageEngine {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(i: number): string | null;
}

/** Fallback when localStorage is unavailable (private mode, blocked cookies). */
class Mem implements StorageEngine {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  key(i: number) {
    return Array.from(this.items.keys())[i] ?? null;
  }
}

export interface MergeChanges {
  incoming: boolean;
  outgoing: boolean;
  downloadCount: boolean;
}

export class Storage {
  private readonly engine: StorageEngine;
  private _files: Map<string, OwnedFile>;

  constructor(engine?: StorageEngine) {
    if (engine) {
      this.engine = engine;
    } else {
      try {
        this.engine = localStorage ?? new Mem();
      } catch {
        this.engine = new Mem();
      }
    }
    this._files = this.loadFiles();
  }

  private loadFiles(): Map<string, OwnedFile> {
    const fs = new Map<string, OwnedFile>();
    for (let i = 0; i < this.engine.length; i++) {
      const k = this.engine.key(i);
      if (k && isFile(k)) {
        try {
          const f = new OwnedFile(
            JSON.parse(this.engine.getItem(k) as string) as OwnedFileJSON
          );
          fs.set(f.id, f);
        } catch {
          this.engine.removeItem(k);
        }
      }
    }
    return fs;
  }

  get id(): string {
    let id = this.engine.getItem('device_id');
    if (!id) {
      id = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));
      this.engine.setItem('device_id', id);
    }
    return id;
  }

  get totalDownloads(): number {
    return Number(this.engine.getItem('totalDownloads'));
  }

  set totalDownloads(n: number) {
    this.engine.setItem('totalDownloads', String(n));
  }

  get totalUploads(): number {
    return Number(this.engine.getItem('totalUploads'));
  }

  set totalUploads(n: number) {
    this.engine.setItem('totalUploads', String(n));
  }

  get referrer(): string | null {
    return this.engine.getItem('referrer');
  }

  set referrer(str: string) {
    this.engine.setItem('referrer', str);
  }

  get files(): OwnedFile[] {
    return Array.from(this._files.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  get user(): Record<string, unknown> | null {
    try {
      return JSON.parse(this.engine.getItem('user') as string);
    } catch {
      return null;
    }
  }

  set user(info: Record<string, unknown>) {
    this.engine.setItem('user', JSON.stringify(info));
  }

  getFileById(id: string): OwnedFile | undefined {
    return this._files.get(id);
  }

  get(id: string): string | null {
    return this.engine.getItem(id);
  }

  set(id: string, value: string) {
    this.engine.setItem(id, value);
  }

  remove(property: string) {
    if (isFile(property)) {
      this._files.delete(property);
    }
    this.engine.removeItem(property);
  }

  addFile(file: OwnedFile) {
    this._files.set(file.id, file);
    this.writeFile(file);
  }

  writeFile(file: OwnedFile) {
    this.engine.setItem(file.id, JSON.stringify(file));
  }

  clearLocalFiles() {
    for (const f of this._files.values()) {
      this.engine.removeItem(f.id);
    }
    this._files = new Map();
  }

  /**
   * Reconciles the server-side file list with local state, dropping expired
   * entries and refreshing download counts.
   */
  async merge(files: OwnedFileJSON[] = []): Promise<MergeChanges> {
    let incoming = false;
    let outgoing = false;
    let downloadCount = false;
    for (const f of files) {
      if (!this.getFileById(f.id)) {
        this.addFile(new OwnedFile(f));
        incoming = true;
      }
    }
    for (const f of this.files.slice()) {
      const cc = await f.updateDownloadCount();
      if (cc) {
        this.writeFile(f);
      }
      downloadCount = downloadCount || cc;
      outgoing = outgoing || f.expired;
      if (f.expired) {
        this.remove(f.id);
      } else if (!files.find(x => x.id === f.id)) {
        outgoing = true;
      }
    }
    return { incoming, outgoing, downloadCount };
  }
}

export default new Storage();
