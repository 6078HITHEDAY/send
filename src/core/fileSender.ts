import type { Cancellable, UploadInfo } from './api';
import { uploadWs } from './api';
import type Archive from './archive';
import { arrayToB64 } from './base64';
import Keychain from './keychain';
import OwnedFile from './ownedFile';
import { TransferEmitter } from './transfer';
import { bytes, encryptedSize } from './utils';

export default class FileSender extends TransferEmitter {
  readonly keychain = new Keychain();
  private uploadRequest: Cancellable<UploadInfo> | null = null;
  cancelled = false;

  constructor() {
    super();
    this.reset();
  }

  get progressIndefinite(): boolean {
    return !['fileSizeProgress', 'notifyUploadEncryptDone'].includes(this.msg);
  }

  get sizes() {
    return {
      partialSize: bytes(this.progress[0]),
      totalSize: bytes(this.progress[1])
    };
  }

  reset() {
    this.uploadRequest = null;
    this.msg = 'importingFile';
    this.progress = [0, 1];
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
    this.uploadRequest?.cancel();
  }

  async upload(archive: Archive, bearerToken?: string): Promise<OwnedFile> {
    if (this.cancelled) {
      throw new Error('0');
    }
    this.msg = 'encryptingFile';
    this.emit('encrypting');
    const totalSize = encryptedSize(archive.size);
    const encStream = this.keychain.encryptStream(archive.stream);
    const metadata = await this.keychain.encryptMetadata(archive);
    const authKeyB64 = await this.keychain.authKeyB64();

    this.uploadRequest = uploadWs(
      encStream,
      metadata,
      authKeyB64,
      archive.timeLimit,
      archive.dlimit,
      bearerToken,
      p => {
        this.progress = [p, totalSize];
        this.emit('progress');
      }
    );

    if (this.cancelled) {
      throw new Error('0');
    }

    this.msg = 'fileSizeProgress';
    this.emit('progress');
    try {
      const result = await this.uploadRequest.result;
      this.msg = 'notifyUploadEncryptDone';
      this.uploadRequest = null;
      this.progress = [1, 1];
      // The secret key travels only in the URL fragment, so it is never sent
      // to the server by a browser following this link.
      const secretKey = arrayToB64(this.keychain.rawSecret);
      return new OwnedFile({
        id: result.id,
        url: `${result.url}#${secretKey}`,
        name: archive.name,
        size: archive.size,
        manifest: archive.manifest,
        time: result.duration,
        speed: archive.size / (result.duration / 1000),
        createdAt: Date.now(),
        expiresAt: Date.now() + archive.timeLimit * 1000,
        secretKey,
        nonce: this.keychain.nonce,
        ownerToken: result.ownerToken,
        dlimit: archive.dlimit,
        timeLimit: archive.timeLimit
      });
    } catch (e) {
      this.msg = 'errorPageHeader';
      this.uploadRequest = null;
      throw e;
    }
  }
}
