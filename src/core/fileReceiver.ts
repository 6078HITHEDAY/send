import type { Cancellable } from './api';
import { downloadFile, getApiUrl, metadata } from './api';
import Keychain from './keychain';
import type { ArchiveManifest } from './keychain';
import { blobStream, streamToArrayBuffer } from './streams';
import { TransferEmitter } from './transfer';
import { bytes, delay } from './utils';
import Zip from './zip';

export interface FileInfo {
  id: string;
  /** Read from the URL fragment, never from a path segment or query. */
  secretKey: string;
  nonce?: string | null;
  requiresPassword?: boolean;
  password?: string | null;
  url?: string;
  name?: string;
  type?: string;
  size?: number;
  manifest?: ArchiveManifest | Record<string, never>;
}

export type ReceiverState =
  | 'initialized'
  | 'ready'
  | 'downloading'
  | 'decrypting'
  | 'complete';

/** The service worker's half of the `postMessage` protocol. */
type SwRequest =
  | ({ request: 'init' } & Record<string, unknown>)
  | { request: 'progress'; id: string }
  | { request: 'cancel'; id: string };

export default class FileReceiver extends TransferEmitter {
  readonly keychain: Keychain;
  readonly fileInfo: FileInfo;
  state: ReceiverState = 'initialized';
  private downloadRequest: Pick<Cancellable<unknown>, 'cancel'> | null = null;

  constructor(fileInfo: FileInfo) {
    super();
    this.keychain = new Keychain(fileInfo.secretKey, fileInfo.nonce);
    if (fileInfo.requiresPassword) {
      this.keychain.setPassword(
        fileInfo.password as string,
        fileInfo.url as string
      );
    }
    this.fileInfo = fileInfo;
    this.reset();
  }

  get progressIndefinite(): boolean {
    return this.state !== 'downloading';
  }

  get sizes() {
    return {
      partialSize: bytes(this.progress[0]),
      totalSize: bytes(this.progress[1])
    };
  }

  cancel() {
    this.downloadRequest?.cancel();
  }

  reset() {
    this.msg = 'fileSizeProgress';
    this.state = 'initialized';
    this.progress = [0, 1];
  }

  async getMetadata() {
    const meta = await metadata(this.fileInfo.id, this.keychain);
    this.fileInfo.name = meta.name;
    this.fileInfo.type = meta.type;
    this.fileInfo.size = +meta.size;
    this.fileInfo.manifest = meta.manifest;
    this.state = 'ready';
  }

  private sendMessageToSw<T>(msg: SwRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = event => {
        if (event.data === undefined) {
          reject(new Error('bad response from serviceWorker'));
        } else if (event.data.error !== undefined) {
          reject(event.data.error);
        } else {
          resolve(event.data);
        }
      };

      (
        navigator.serviceWorker.controller as ServiceWorker
      ).postMessage(msg, [channel.port2]);
    });
  }

  /** Buffers the whole file in memory. Used where streaming is unavailable. */
  async downloadBlob(noSave = false) {
    this.state = 'downloading';
    const request = downloadFile(this.fileInfo.id, this.keychain, p => {
      this.progress = [p, this.fileInfo.size as number];
      this.emit('progress');
    });
    this.downloadRequest = request;
    try {
      const ciphertext = await request.result;
      this.downloadRequest = null;
      this.msg = 'decryptingFile';
      this.state = 'decrypting';
      this.emit('decrypting');
      let size = this.fileInfo.size as number;
      let plainStream = this.keychain.decryptStream(blobStream(ciphertext));
      if (this.fileInfo.type === 'send-archive') {
        const zip = new Zip(
          this.fileInfo.manifest as ArchiveManifest,
          plainStream
        );
        plainStream = zip.stream;
        size = zip.size;
      }
      const plaintext = await streamToArrayBuffer(plainStream, size);
      if (!noSave) {
        saveFile({
          plaintext,
          name: decodeURIComponent(this.fileInfo.name as string),
          type: this.fileInfo.type as string
        });
      }
      this.msg = 'downloadFinish';
      this.emit('complete');
      this.state = 'complete';
    } catch (e) {
      this.downloadRequest = null;
      throw e;
    }
  }

  /** Hands decryption to the service worker so the browser streams to disk. */
  async downloadStream(noSave = false) {
    const start = Date.now();
    const onprogress = (p: number) => {
      this.progress = [p, this.fileInfo.size as number];
      this.emit('progress');
    };

    this.downloadRequest = {
      cancel: () => {
        this.sendMessageToSw({ request: 'cancel', id: this.fileInfo.id });
      }
    };

    try {
      this.state = 'downloading';

      await this.sendMessageToSw({
        request: 'init',
        id: this.fileInfo.id,
        filename: this.fileInfo.name,
        type: this.fileInfo.type,
        manifest: this.fileInfo.manifest,
        key: this.fileInfo.secretKey,
        requiresPassword: this.fileInfo.requiresPassword,
        password: this.fileInfo.password,
        url: this.fileInfo.url,
        size: this.fileInfo.size,
        nonce: this.keychain.nonce,
        noSave
      });

      onprogress(0);

      if (noSave) {
        const res = await fetch(getApiUrl(`/api/download/${this.fileInfo.id}`));
        if (res.status !== 200) {
          throw new Error(String(res.status));
        }
      } else {
        const downloadPath = `/api/download/${this.fileInfo.id}`;
        let downloadUrl = getApiUrl(downloadPath);
        if (downloadUrl === downloadPath) {
          downloadUrl = `${location.protocol}//${location.host}${downloadPath}`;
        }
        const a = document.createElement('a');
        a.href = downloadUrl;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      let prog = 0;
      let hangs = 0;
      while (prog < (this.fileInfo.size as number)) {
        const msg = await this.sendMessageToSw<{ progress: number }>({
          request: 'progress',
          id: this.fileInfo.id
        });
        if (msg.progress === prog) {
          hangs++;
        } else {
          hangs = 0;
        }
        if (hangs > 30) {
          // On Chrome we don't get a cancel signal, so a cancellation is
          // indistinguishable from a hang.
          const e = new Error('hung download') as Error & {
            duration?: number;
            size?: number;
            progress?: number;
          };
          e.duration = Date.now() - start;
          e.size = this.fileInfo.size;
          e.progress = prog;
          throw e;
        }
        prog = msg.progress;
        onprogress(prog);
        await delay(1000);
      }

      this.downloadRequest = null;
      this.msg = 'downloadFinish';
      this.emit('complete');
      this.state = 'complete';
    } catch (e) {
      this.downloadRequest = null;
      if (e === 'cancelled' || (e as Error).message === '400') {
        throw new Error('0');
      }
      throw e;
    }
  }

  download(options: { stream: boolean; noSave?: boolean }) {
    if (options.stream) {
      return this.downloadStream(options.noSave);
    }
    return this.downloadBlob(options.noSave);
  }
}

function saveFile(file: {
  plaintext: ArrayBuffer;
  name: string;
  type: string;
}) {
  const blob = new Blob([file.plaintext], { type: file.type });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(downloadUrl);
}
