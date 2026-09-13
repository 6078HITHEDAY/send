import { del, fileInfo, setParams, setPassword } from './api';
import { arrayToB64 } from './base64';
import type { ArchiveManifest } from './keychain';
import Keychain from './keychain';

export interface OwnedFileJSON {
  id: string;
  url: string;
  name: string;
  size: number;
  manifest: ArchiveManifest;
  time: number;
  speed: number;
  createdAt: number;
  expiresAt: number;
  secretKey: string;
  ownerToken: string;
  dlimit: number;
  dtotal?: number;
  hasPassword?: boolean;
  timeLimit: number;
  nonce?: string | null;
  /** Legacy key used by very old localStorage entries. */
  fileId?: string;
}

export default class OwnedFile {
  id: string;
  url: string;
  name: string;
  size: number;
  manifest: ArchiveManifest;
  time: number;
  speed: number;
  createdAt: number;
  expiresAt: number;
  ownerToken: string;
  dlimit: number;
  dtotal: number;
  timeLimit: number;
  password: string | null = null;
  readonly keychain: Keychain;
  private _hasPassword: boolean;

  constructor(obj: OwnedFileJSON) {
    if (!obj.manifest) {
      throw new Error('invalid file object');
    }
    this.id = obj.id ?? (obj.fileId as string);
    this.url = obj.url;
    this.name = obj.name;
    this.size = obj.size;
    this.manifest = obj.manifest;
    this.time = obj.time;
    this.speed = obj.speed;
    this.createdAt = obj.createdAt;
    this.expiresAt = obj.expiresAt;
    this.ownerToken = obj.ownerToken;
    this.dlimit = obj.dlimit || 1;
    this.dtotal = obj.dtotal || 0;
    this.keychain = new Keychain(obj.secretKey, obj.nonce);
    this._hasPassword = !!obj.hasPassword;
    this.timeLimit = obj.timeLimit;
  }

  get hasPassword(): boolean {
    return this._hasPassword;
  }

  get expired(): boolean {
    return this.dlimit === this.dtotal || Date.now() > this.expiresAt;
  }

  async setPassword(password: string): Promise<boolean> {
    try {
      this.password = password;
      this._hasPassword = true;
      this.keychain.setPassword(password, this.url);
      return await setPassword(this.id, this.ownerToken, this.keychain);
    } catch (e) {
      this.password = null;
      this._hasPassword = false;
      throw e;
    }
  }

  del(): Promise<boolean> {
    return del(this.id, this.ownerToken);
  }

  changeLimit(dlimit: number, bearerToken?: string): Promise<boolean> {
    if (this.dlimit !== dlimit) {
      this.dlimit = dlimit;
      return setParams(this.id, this.ownerToken, bearerToken, { dlimit });
    }
    return Promise.resolve(true);
  }

  async updateDownloadCount(): Promise<boolean> {
    const oldTotal = this.dtotal;
    const oldLimit = this.dlimit;
    try {
      const result = await fileInfo(this.id, this.ownerToken);
      this.dtotal = result.dtotal;
      this.dlimit = result.dlimit;
    } catch (e) {
      if ((e as Error).message === '404') {
        this.dtotal = this.dlimit;
      }
      // ignore other errors
    }
    return oldTotal !== this.dtotal || oldLimit !== this.dlimit;
  }

  toJSON(): OwnedFileJSON {
    return {
      id: this.id,
      url: this.url,
      name: this.name,
      size: this.size,
      manifest: this.manifest,
      time: this.time,
      speed: this.speed,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      secretKey: arrayToB64(this.keychain.rawSecret),
      ownerToken: this.ownerToken,
      dlimit: this.dlimit,
      dtotal: this.dtotal,
      hasPassword: this.hasPassword,
      timeLimit: this.timeLimit
    };
  }
}
