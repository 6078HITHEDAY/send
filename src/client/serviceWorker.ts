/// <reference lib="webworker" />
import { create as contentDisposition } from 'content-disposition';
import { downloadStream } from '../core/api.ts';
import type { ArchiveManifest } from '../core/keychain.ts';
import Keychain from '../core/keychain.ts';
import { transformStream } from '../core/streams.ts';
import Zip from '../core/zip.ts';
import pkg from '../../package.json' with { type: 'json' };

declare const self: ServiceWorkerGlobalScope;

interface PendingDownload {
  key: string;
  nonce: string;
  filename: string;
  requiresPassword?: boolean;
  password?: string;
  url?: string;
  type?: string;
  manifest?: ArchiveManifest;
  size: number;
  progress: number;
  noSave?: boolean;
  download?: { result: Promise<ReadableStream<Uint8Array>>; cancel(): void };
}

const IMAGES = /\.(png|svg|jpg)$/;
const VERSIONED_ASSET = /\.[A-Fa-f0-9]{8}\.(js|css|png|svg|jpg)(#\w+)?$/;
const DOWNLOAD_URL = /\/api\/download\/([A-Fa-f0-9]{4,})/;
const FONT = /\.woff2?$/;

const pending = new Map<string, PendingDownload>();
let noSave = false;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim().then(precache));
});

/**
 * Decrypts a download in the worker so the browser can stream it straight to
 * disk instead of buffering the plaintext in a page.
 */
async function decryptStream(id: string): Promise<Response> {
  const file = pending.get(id);
  if (!file) {
    return new Response(null, { status: 400 });
  }
  try {
    let size = file.size;
    let type = file.type ?? 'application/octet-stream';
    const keychain = new Keychain(file.key, file.nonce);
    if (file.requiresPassword) {
      keychain.setPassword(file.password as string, file.url as string);
    }

    file.download = downloadStream(id, keychain);
    const body = await file.download.result;
    let plaintext = keychain.decryptStream(body);

    if (file.type === 'send-archive') {
      const zip = new Zip(file.manifest as ArchiveManifest, plaintext);
      plaintext = zip.stream;
      type = 'application/zip';
      size = zip.size;
    }

    const responseStream = transformStream(
      plaintext,
      {
        transform(chunk, controller) {
          file.progress += chunk.length;
          controller.enqueue(chunk);
        }
      },
      () => {
        // Chrome still does not fire cancel here:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=638494
        file.download?.cancel();
        pending.delete(id);
      }
    );

    return new Response(responseStream, {
      headers: {
        'Content-Disposition': contentDisposition(file.filename),
        'Content-Type': type,
        'Content-Length': String(size)
      }
    });
  } catch (e) {
    if (noSave) {
      return new Response(null, { status: Number((e as Error).message) });
    }
    // Back to the page, which can ask for a password and retry.
    return new Response(null, {
      status: 302,
      headers: { Location: `/download/${id}/#${file.key}` }
    });
  }
}

async function precache() {
  try {
    await cleanCache();
    const cache = await caches.open(pkg.version);
    const manifest = (await (await fetch('/manifest.json')).json()) as Record<
      string,
      string
    >;
    const images = Object.values(manifest).filter(url => IMAGES.test(url));
    await cache.addAll(images);
  } catch (e) {
    console.error(e);
    // The cache fills on demand instead.
  }
}

async function cleanCache() {
  for (const key of await caches.keys()) {
    if (key !== pkg.version) {
      await caches.delete(key);
    }
  }
}

function cacheable(url: string): boolean {
  return VERSIONED_ASSET.test(url) || FONT.test(url);
}

async function cachedOrFetched(request: Request): Promise<Response> {
  const cache = await caches.open(pkg.version);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const fetched = await fetch(request);
  if (fetched.ok && cacheable(request.url)) {
    cache.put(request, fetched.clone());
  }
  return fetched;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  const download = DOWNLOAD_URL.exec(url.pathname);
  if (download) {
    event.respondWith(decryptStream(download[1] as string));
  } else if (cacheable(url.pathname)) {
    event.respondWith(cachedOrFetched(request));
  }
});

/**
 * The page's half of this protocol lives in FileReceiver. The message names and
 * their replies are part of the contract with already-cached workers, so they
 * are unchanged.
 */
self.addEventListener('message', event => {
  const data = event.data as {
    request: 'init' | 'progress' | 'cancel';
    id: string;
  } & Record<string, unknown>;
  const port = event.ports[0];
  if (!port) {
    return;
  }

  if (data.request === 'init') {
    noSave = !!data.noSave;
    pending.set(data.id, {
      key: data.key as string,
      nonce: data.nonce as string,
      filename: data.filename as string,
      requiresPassword: data.requiresPassword as boolean,
      password: data.password as string,
      url: data.url as string,
      type: data.type as string,
      manifest: data.manifest as ArchiveManifest,
      size: data.size as number,
      progress: 0
    });
    port.postMessage('file info received');
    return;
  }

  if (data.request === 'progress') {
    const file = pending.get(data.id);
    if (!file) {
      port.postMessage({ error: 'cancelled' });
      return;
    }
    if (file.progress === file.size) {
      pending.delete(data.id);
    }
    port.postMessage({ progress: file.progress });
    return;
  }

  if (data.request === 'cancel') {
    const file = pending.get(data.id);
    if (file) {
      file.download?.cancel();
      pending.delete(data.id);
    }
    port.postMessage('download cancelled');
  }
});
