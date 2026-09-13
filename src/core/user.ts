import { getFileList, setFileList } from './api';
import { arrayToB64, b64ToArray } from './base64';
import { decryptStream, encryptStream } from './ece';
import type { AuthConfig } from './fxa';
import { getFileListKey, preparePkce, prepareScopedBundleKey } from './fxa';
import type { OwnedFileJSON } from './ownedFile';
import type { MergeChanges, Storage } from './storage';
import { blobStream, streamToArrayBuffer } from './streams';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const anonId = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));

export interface Limits {
  MAX_FILE_SIZE: number;
  MAX_EXPIRE_SECONDS: number;
  MAX_DOWNLOADS: number;
  MAX_FILES_PER_ARCHIVE: number;
  MAX_ARCHIVES_PER_USER: number;
}

interface UserInfo {
  uid?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  avatarDefault?: boolean;
  access_token?: string;
  refresh_token?: string;
  fileListKey?: string;
}

/** Rotates monthly so metrics ids cannot be correlated across months. */
async function hashId(id: string): Promise<string> {
  const d = new Date();
  const encoded = textEncoder.encode(
    `${id}:${d.getUTCFullYear()}:${d.getUTCMonth()}`
  );
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return arrayToB64(new Uint8Array(hash.slice(16)));
}

export default class User {
  private data: UserInfo;
  private utms: Record<string, string | undefined> = {};
  private trigger: string | undefined;

  constructor(
    private readonly storage: Storage,
    private readonly limits: Limits,
    private readonly authConfig?: AuthConfig,
    private readonly defaultAvatar = ''
  ) {
    this.data = (storage.user as UserInfo) || {};
  }

  get info(): UserInfo {
    return this.data || (this.storage.user as UserInfo) || {};
  }

  set info(data: UserInfo) {
    this.data = data;
    this.storage.user = data as Record<string, unknown>;
  }

  get surveyed(): boolean {
    return this.storage.get('surveyed') === 'true';
  }

  set surveyed(yes: boolean) {
    this.storage.set('surveyed', String(yes));
  }

  get avatar(): string {
    if (this.info.avatarDefault) {
      return this.defaultAvatar;
    }
    return this.info.avatar || this.defaultAvatar;
  }

  get name(): string | undefined {
    return this.info.displayName;
  }

  get email(): string | undefined {
    return this.info.email;
  }

  get loggedIn(): boolean {
    return !!this.info.access_token;
  }

  get bearerToken(): string | undefined {
    return this.info.access_token;
  }

  get refreshToken(): string | undefined {
    return this.info.refresh_token;
  }

  get maxSize(): number {
    return this.limits.MAX_FILE_SIZE;
  }

  get maxExpireSeconds(): number {
    return this.limits.MAX_EXPIRE_SECONDS;
  }

  get maxDownloads(): number {
    return this.limits.MAX_DOWNLOADS;
  }

  async metricId(): Promise<string | undefined> {
    return this.loggedIn ? hashId(this.info.uid as string) : undefined;
  }

  async deviceId(): Promise<string> {
    return this.loggedIn ? hashId(this.storage.id) : hashId(anonId);
  }

  startAuthFlow(trigger: string, utms: Record<string, string | undefined> = {}) {
    this.utms = utms;
    this.trigger = trigger;
  }

  async login(email?: string) {
    const authConfig = this.requireAuthConfig();
    const state = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));
    this.storage.set('oauthState', state);
    const keys_jwk = await prepareScopedBundleKey(this.storage);
    const code_challenge = await preparePkce(this.storage);
    const options: Record<string, string> = {
      action: 'email',
      access_type: 'offline',
      client_id: authConfig.client_id,
      code_challenge,
      code_challenge_method: 'S256',
      response_type: 'code',
      scope: `profile ${authConfig.key_scope}`,
      state,
      keys_jwk
    };
    if (email) {
      options.email = email;
    }
    if (this.trigger) {
      options.entrypoint = `send-${this.trigger}`;
    }
    options.utm_campaign = this.utms.campaign || 'none';
    options.utm_content = this.utms.content || 'none';
    options.utm_medium = this.utms.medium || 'none';
    options.utm_source = this.utms.source || 'send';
    options.utm_term = this.utms.term || 'none';

    const params = new URLSearchParams(options);
    location.assign(
      `${authConfig.authorization_endpoint}?${params.toString()}`
    );
  }

  async finishLogin(code: string, state: string) {
    const authConfig = this.requireAuthConfig();
    const localState = this.storage.get('oauthState');
    this.storage.remove('oauthState');
    if (state !== localState) {
      throw new Error('state mismatch');
    }
    const tokenResponse = await fetch(authConfig.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: authConfig.client_id,
        code_verifier: this.storage.get('pkceVerifier')
      })
    });
    const auth = await tokenResponse.json();
    const infoResponse = await fetch(authConfig.userinfo_endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${auth.access_token}` }
    });
    const userInfo = (await infoResponse.json()) as UserInfo;
    userInfo.access_token = auth.access_token;
    userInfo.refresh_token = auth.refresh_token;
    userInfo.fileListKey = await getFileListKey(
      this.storage,
      auth.keys_jwe,
      authConfig
    );
    this.info = userInfo;
    this.storage.remove('pkceVerifier');
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshToken || !this.authConfig) {
      return false;
    }
    try {
      const tokenResponse = await fetch(this.authConfig.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.authConfig.client_id,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        })
      });
      if (tokenResponse.ok) {
        const auth = await tokenResponse.json();
        this.info = { ...this.info, access_token: auth.access_token };
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    await this.logout();
    return false;
  }

  async logout() {
    try {
      const authConfig = this.authConfig;
      if (authConfig) {
        for (const body of [
          this.refreshToken ? { refresh_token: this.refreshToken } : null,
          this.bearerToken ? { token: this.bearerToken } : null
        ]) {
          if (!body) continue;
          await fetch(authConfig.revocation_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        }
      }
    } catch (e) {
      console.error(e);
      // oh well, we tried
    }
    this.storage.clearLocalFiles();
    this.info = {};
  }

  /**
   * The account file list is itself end-to-end encrypted with a key derived
   * from the FxA scoped key, so the server only ever sees ciphertext.
   */
  async syncFileList(): Promise<MergeChanges> {
    if (!this.loggedIn) {
      return this.storage.merge();
    }
    let list: OwnedFileJSON[] = [];
    const key = b64ToArray(this.info.fileListKey as string);
    const sha = await crypto.subtle.digest('SHA-256', key);
    const kid = arrayToB64(new Uint8Array(sha)).substring(0, 16);
    const retry = async (): Promise<MergeChanges> => {
      const refreshed = await this.refresh();
      if (refreshed) {
        return this.syncFileList();
      }
      return { incoming: true, outgoing: false, downloadCount: false };
    };
    try {
      const encrypted = await getFileList(this.bearerToken as string, kid);
      const decrypted = await streamToArrayBuffer(
        decryptStream(blobStream(encrypted), key)
      );
      list = JSON.parse(textDecoder.decode(decrypted));
    } catch (e) {
      if ((e as Error).message === '401') {
        return retry();
      }
    }
    const changes = await this.storage.merge(list);
    if (!changes.outgoing) {
      return changes;
    }
    try {
      const blob = new Blob([
        textEncoder.encode(JSON.stringify(this.storage.files))
      ]);
      const encrypted = await streamToArrayBuffer(
        encryptStream(blobStream(blob), key)
      );
      await setFileList(this.bearerToken as string, kid, encrypted);
    } catch (e) {
      if ((e as Error).message === '401') {
        return retry();
      }
    }
    return changes;
  }

  toJSON(): UserInfo {
    return this.info;
  }

  private requireAuthConfig(): AuthConfig {
    if (!this.authConfig) {
      throw new Error('accounts are not configured');
    }
    return this.authConfig;
  }
}
