import * as Sentry from '@sentry/browser';
import { create } from 'zustand';
import Archive from '../core/archive.ts';
import type { Capabilities } from '../core/capabilities.ts';
import getCapabilities from '../core/capabilities.ts';
import type { FileInfo } from '../core/fileReceiver.ts';
import FileReceiver from '../core/fileReceiver.ts';
import FileSender from '../core/fileSender.ts';
import type OwnedFile from '../core/ownedFile.ts';
import type { Storage } from '../core/storage.ts';
import storage from '../core/storage.ts';
import type { TransferEmitter } from '../core/transfer.ts';
import User from '../core/user.ts';
import { bytes, locale, translate } from '../core/utils.ts';
import { asset } from './assets.ts';
import { updateFavicon } from './favicon.ts';
import { AUTH_CONFIG, DEFAULTS, LIMITS, PREFS } from './globals.ts';
import { openLinksInNewTab } from './links.ts';

export type ModalSpec =
  | { type: 'ok'; message: string }
  | { type: 'copy'; name: string; url: string }
  | { type: 'share'; name: string; url: string }
  | { type: 'signup' }
  | { type: 'survey' };

export type Navigate = (
  to: string,
  options?: { replace?: boolean }
) => void;

/**
 * `Archive`, `User` and `Storage` stay mutable class instances: the crypto core
 * drives them imperatively. `revision` takes the place of choo's explicit
 * `emit('render')` calls, telling React that one of them changed.
 */
export interface AppState {
  capabilities: Capabilities;
  user: User;
  storage: Storage;
  archive: Archive;
  revision: number;

  transfer: TransferEmitter | null;
  /** Mirrored out of `transfer` so high-frequency updates land in one place. */
  progressRatio: number;
  uploading: boolean;
  settingPassword: boolean;
  passwordSetError: Error | null;
  fileInfo: FileInfo | null;
  modal: ModalSpec | null;

  navigate: Navigate;
}

export interface AppActions {
  touch(): void;
  setNavigate(navigate: Navigate): void;
  setModal(modal: ModalSpec | null): void;
  closeModal(): void;

  checkFiles(): Promise<void>;
  login(email?: string): Promise<void>;
  logout(): Promise<void>;
  signupCta(source: string, utms?: Record<string, string | undefined>): void;
  authenticate(code: string, oauthState: string): Promise<void>;

  addFiles(files: File[]): void;
  removeUpload(file: File): void;
  deleteFile(file: OwnedFile): Promise<void>;
  upload(): Promise<void>;
  setPassword(password: string, file: OwnedFile): Promise<void>;
  cancel(): void;

  startDownload(fileInfo: FileInfo): void;
  getMetadata(): Promise<void>;
  download(): Promise<void>;
}

export type Store = AppState & AppActions;

export interface StoreSeed {
  capabilities: Capabilities;
  user: User;
  storage: Storage;
}

function noNavigate() {
  throw new Error('navigate used before the router mounted');
}

export function createStore(seed: StoreSeed) {
  return create<Store>((set, get) => {
    /** Bumping the revision is how a mutated core object reaches React. */
    const touch = () => set(s => ({ revision: s.revision + 1 }));

    const trackTransfer = (transfer: TransferEmitter) => {
      const onProgress = () => {
        set({ progressRatio: transfer.progressRatio });
        updateFavicon(transfer.progressRatio);
      };
      transfer.on('progress', onProgress);
      transfer.on('encrypting', touch);
      transfer.on('decrypting', touch);
      transfer.on('complete', touch);
      return onProgress;
    };

    const captureTransferError = (
      err: Error & { duration?: number; size?: number; progress?: number }
    ) => {
      Sentry.withScope(scope => {
        scope.setExtra('duration', err.duration);
        scope.setExtra('size', err.size);
        scope.setExtra('progress', err.progress);
        Sentry.captureException(err);
      });
    };

    return {
      capabilities: seed.capabilities,
      user: seed.user,
      storage: seed.storage,
      archive: new Archive([], DEFAULTS.EXPIRE_SECONDS, DEFAULTS.DOWNLOADS),
      revision: 0,

      transfer: null,
      progressRatio: 0,
      uploading: false,
      settingPassword: false,
      passwordSetError: null,
      fileInfo: null,
      modal: null,

      navigate: noNavigate,

      touch,

      setNavigate(navigate) {
        set({ navigate });
      },

      setModal(modal) {
        set({ modal });
      },

      /**
       * After a successful share the survey takes the modal's place, once, for
       * English-speaking users who have actually used Send.
       */
      closeModal() {
        const { modal, storage, user } = get();
        const shared = modal?.type === 'copy' || modal?.type === 'share';
        if (
          PREFS.surveyUrl &&
          shared &&
          locale().startsWith('en') &&
          (storage.totalUploads > 1 || storage.totalDownloads > 0) &&
          !user.surveyed
        ) {
          user.surveyed = true;
          set({ modal: { type: 'survey' } });
          return;
        }
        set({ modal: null });
      },

      async checkFiles() {
        const changes = await get().user.syncFileList();
        if (changes.incoming || changes.downloadCount) {
          touch();
        }
      },

      async login(email) {
        await get().user.login(email);
      },

      async logout() {
        await get().user.logout();
        get().navigate('/');
        touch();
      },

      signupCta(source, utms = {}) {
        get().user.startAuthFlow(source, utms);
        set({ modal: { type: 'signup' } });
      },

      async authenticate(code, oauthState) {
        const { user, navigate } = get();
        try {
          await user.finishLogin(code, oauthState);
          await user.syncFileList();
          navigate('/', { replace: true });
        } catch {
          navigate('/error', { replace: true });
        }
        touch();
      },

      addFiles(files) {
        if (files.length < 1) {
          return;
        }
        const { archive, user } = get();
        const maxSize = user.maxSize;
        try {
          archive.addFiles(files, maxSize, LIMITS.MAX_FILES_PER_ARCHIVE);
        } catch (e) {
          set({
            modal: {
              type: 'ok',
              message: translate((e as Error).message, {
                size: bytes(maxSize),
                count: LIMITS.MAX_FILES_PER_ARCHIVE
              })
            }
          });
        }
        touch();
      },

      removeUpload(file) {
        const { archive } = get();
        archive.remove(file);
        if (archive.numFiles === 0) {
          archive.clear();
        }
        touch();
      },

      async deleteFile(file) {
        const { storage } = get();
        try {
          storage.remove(file.id);
          await file.del();
        } catch (e) {
          Sentry.captureException(e);
        }
        touch();
      },

      async upload() {
        const { storage, archive, user, capabilities } = get();
        if (storage.files.length >= LIMITS.MAX_ARCHIVES_PER_USER) {
          set({
            modal: {
              type: 'ok',
              message: translate('tooManyArchives', {
                count: LIMITS.MAX_ARCHIVES_PER_USER
              })
            }
          });
          return;
        }

        const sender = new FileSender();
        trackTransfer(sender);
        set({ transfer: sender, uploading: true, progressRatio: 0 });

        const links = openLinksInNewTab();
        try {
          const ownedFile = await sender.upload(archive, user.bearerToken);
          storage.totalUploads += 1;
          updateFavicon(0);
          storage.addFile(ownedFile);
          if (archive.password) {
            await get().setPassword(archive.password, ownedFile);
          }
          set({
            modal: capabilities.share
              ? { type: 'share', name: ownedFile.name, url: ownedFile.url }
              : { type: 'copy', name: ownedFile.name, url: ownedFile.url }
          });
        } catch (e) {
          const err = e as Error;
          if (err.message === '0') {
            // cancelled: nothing to report
          } else if (err.message === '401') {
            if (await user.refresh()) {
              set({ uploading: false, transfer: null });
              return get().upload();
            }
            get().navigate('/error');
          } else {
            console.error(err);
            captureTransferError(err);
            get().navigate('/error');
          }
        } finally {
          openLinksInNewTab(links, false);
          archive.clear();
          set({ uploading: false, transfer: null });
          await user.syncFileList();
          touch();
        }
      },

      async setPassword(password, file) {
        set({ settingPassword: true, passwordSetError: null });
        try {
          await file.setPassword(password);
          get().storage.writeFile(file);
        } catch (e) {
          console.error(e);
          set({ passwordSetError: e as Error });
        } finally {
          set({ settingPassword: false });
          touch();
        }
      },

      cancel() {
        get().transfer?.cancel();
        updateFavicon(0);
      },

      startDownload(fileInfo) {
        set({ fileInfo });
      },

      async getMetadata() {
        const { fileInfo, navigate } = get();
        if (!fileInfo) {
          return;
        }
        const receiver = new FileReceiver(fileInfo);
        try {
          await receiver.getMetadata();
          trackTransfer(receiver);
          set({ transfer: receiver, progressRatio: 0 });
        } catch (e) {
          const message = (e as Error).message;
          if (message === '401' || message === '404') {
            fileInfo.password = null;
            if (!fileInfo.requiresPassword) {
              navigate('/404');
              return;
            }
          } else {
            console.error(e);
            navigate('/error');
            return;
          }
        }
        touch();
      },

      async download() {
        const { transfer, storage, capabilities, navigate } = get();
        const receiver = transfer as FileReceiver | null;
        if (!receiver) {
          return;
        }
        const links = openLinksInNewTab();
        try {
          touch();
          await receiver.download({ stream: capabilities.streamDownload });
          storage.totalDownloads += 1;
          updateFavicon(0);
          touch();
        } catch (e) {
          const err = e as Error;
          if (err.message === '0') {
            receiver.reset();
            set({ progressRatio: 0 });
            touch();
            return;
          }
          set({ transfer: null });
          if (err.message === '404') {
            navigate('/404');
            return;
          }
          captureTransferError(err);
          navigate('/error');
        } finally {
          openLinksInNewTab(links, false);
        }
      }
    };
  });
}

/**
 * A module-level singleton, like the old `window.app` state: the imperative
 * crypto core and the document-level drag/paste listeners reach it without
 * prop drilling.
 */
export const useStore = createStore({
  capabilities: getCapabilities(!!AUTH_CONFIG),
  storage,
  user: new User(storage, LIMITS, AUTH_CONFIG, asset('user.svg'))
});

export function getStore(): Store {
  return useStore.getState();
}
