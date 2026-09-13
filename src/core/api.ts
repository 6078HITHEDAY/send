import { arrayToB64, b64ToArray } from './base64';
import { ECE_RECORD_SIZE } from './ece';
import type Keychain from './keychain';
import type { ArchiveManifest } from './keychain';
import { delay } from './utils';

let fileProtocolWssUrl: string | null = null;
try {
  fileProtocolWssUrl = localStorage.getItem('wssURL');
} catch {
  // no localStorage (service worker, private mode)
}
if (!fileProtocolWssUrl) {
  fileProtocolWssUrl = 'wss://send.firefox.com/api/ws';
}

export class ConnectionError extends Error {
  cancelled: boolean;
  duration?: number;
  size?: number;

  constructor(cancelled: boolean, duration?: number, size?: number) {
    super(cancelled ? '0' : 'connection closed');
    this.cancelled = cancelled;
    this.duration = duration;
    this.size = size;
  }
}

export function setFileProtocolWssUrl(url: string) {
  try {
    localStorage.setItem('wssURL', url);
  } catch {
    // ignore
  }
  fileProtocolWssUrl = url;
}

export function getFileProtocolWssUrl(): string {
  return fileProtocolWssUrl as string;
}

let apiUrlPrefix = '';

export function getApiUrl(path: string): string {
  return apiUrlPrefix + path;
}

export function setApiUrlPrefix(prefix: string) {
  apiUrlPrefix = prefix;
}

function post(obj: unknown, bearerToken?: string): RequestInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (bearerToken) {
    h.Authorization = `Bearer ${bearerToken}`;
  }
  return {
    method: 'POST',
    headers: new Headers(h),
    body: JSON.stringify(obj)
  };
}

export function parseNonce(header: string | null): string | undefined {
  return (header || '').split(' ')[1];
}

interface AuthResult {
  response: Response;
  ok: boolean;
  shouldRetry: boolean;
}

/**
 * Sends the `send-v1` HMAC of the current nonce, then adopts the nonce the
 * server hands back in `WWW-Authenticate`. The server rotates it on every
 * successful request, so a 401 carrying a *different* nonce means our copy was
 * stale and the request is worth retrying exactly once.
 */
async function fetchWithAuth(
  url: string,
  params: RequestInit,
  keychain: Keychain
): Promise<AuthResult> {
  const h = await keychain.authHeader();
  const response = await fetch(url, {
    ...params,
    headers: new Headers({
      Authorization: h,
      'Content-Type': 'application/json'
    })
  });
  const nonce = parseNonce(response.headers.get('WWW-Authenticate'));
  const shouldRetry = response.status === 401 && nonce !== keychain.nonce;
  keychain.nonce = nonce;
  return { response, ok: response.ok, shouldRetry };
}

async function fetchWithAuthAndRetry(
  url: string,
  params: RequestInit,
  keychain: Keychain
): Promise<AuthResult> {
  const result = await fetchWithAuth(url, params, keychain);
  if (result.shouldRetry) {
    return fetchWithAuth(url, params, keychain);
  }
  return result;
}

export async function del(id: string, ownerToken: string): Promise<boolean> {
  const response = await fetch(
    getApiUrl(`/api/delete/${id}`),
    post({ owner_token: ownerToken })
  );
  return response.ok;
}

export async function setParams(
  id: string,
  ownerToken: string,
  bearerToken: string | undefined,
  params: { dlimit: number }
): Promise<boolean> {
  const response = await fetch(
    getApiUrl(`/api/params/${id}`),
    post({ owner_token: ownerToken, dlimit: params.dlimit }, bearerToken)
  );
  return response.ok;
}

export interface FileInfoResponse {
  dtotal: number;
  dlimit: number;
}

export async function fileInfo(
  id: string,
  ownerToken: string
): Promise<FileInfoResponse> {
  const response = await fetch(
    getApiUrl(`/api/info/${id}`),
    post({ owner_token: ownerToken })
  );

  if (response.ok) {
    return response.json();
  }

  throw new Error(String(response.status));
}

export interface FileMetadata {
  size: number;
  ttl: number;
  name: string;
  type: string;
  manifest: ArchiveManifest | Record<string, never>;
}

export async function metadata(
  id: string,
  keychain: Keychain
): Promise<FileMetadata> {
  const result = await fetchWithAuthAndRetry(
    getApiUrl(`/api/metadata/${id}`),
    { method: 'GET' },
    keychain
  );
  if (result.ok) {
    const data = await result.response.json();
    const meta = await keychain.decryptMetadata(b64ToArray(data.metadata));
    return {
      size: meta.size,
      ttl: data.ttl,
      name: meta.name,
      type: meta.type,
      manifest: meta.manifest
    };
  }
  throw new Error(String(result.response.status));
}

export async function setPassword(
  id: string,
  ownerToken: string,
  keychain: Keychain
): Promise<boolean> {
  const auth = await keychain.authKeyB64();
  const response = await fetch(
    getApiUrl(`/api/password/${id}`),
    post({ owner_token: ownerToken, auth })
  );
  return response.ok;
}

export interface UploadInfo {
  id: string;
  url: string;
  ownerToken: string;
  duration: number;
}

interface Canceller {
  cancelled: boolean;
}

function asyncInitWebSocket(server: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(server);
      ws.addEventListener('open', () => resolve(ws), { once: true });
    } catch {
      reject(new ConnectionError(false));
    }
  });
}

function listenForResponse<T>(ws: WebSocket, canceller: Canceller): Promise<T> {
  return new Promise((resolve, reject) => {
    function handleClose() {
      // a 'close' event before a 'message' event means the request failed
      ws.removeEventListener('message', handleMessage);
      reject(new ConnectionError(canceller.cancelled));
    }
    function handleMessage(msg: MessageEvent) {
      ws.removeEventListener('close', handleClose);
      try {
        const response = JSON.parse(msg.data);
        if (response.error) {
          throw new Error(response.error);
        }
        resolve(response);
      } catch (e) {
        reject(e);
      }
    }
    ws.addEventListener('message', handleMessage, { once: true });
    ws.addEventListener('close', handleClose, { once: true });
  });
}

function wsEndpoint(): string {
  if (window.location.protocol === 'file:') {
    return getFileProtocolWssUrl();
  }
  const host = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${host}${port ? ':' : ''}${port}/api/ws`;
}

async function upload(
  stream: ReadableStream<Uint8Array>,
  metadataBuffer: ArrayBuffer,
  verifierB64: string,
  timeLimit: number,
  dlimit: number,
  bearerToken: string | undefined,
  onprogress: (size: number) => void,
  canceller: Canceller
): Promise<UploadInfo> {
  let size = 0;
  const start = Date.now();
  const ws = await asyncInitWebSocket(wsEndpoint());

  try {
    const fileMeta = {
      fileMetadata: arrayToB64(new Uint8Array(metadataBuffer)),
      authorization: `send-v1 ${verifierB64}`,
      bearer: bearerToken,
      timeLimit,
      dlimit
    };
    const uploadInfoResponse = listenForResponse<UploadInfo>(ws, canceller);
    ws.send(JSON.stringify(fileMeta));
    const uploadInfo = await uploadInfoResponse;

    const completedResponse = listenForResponse(ws, canceller);

    const reader = stream.getReader();
    let state = await reader.read();
    while (!state.done) {
      if (canceller.cancelled) {
        ws.close();
      }
      if (ws.readyState !== WebSocket.OPEN) {
        break;
      }
      const buf = state.value;
      ws.send(buf);
      onprogress(size);
      size += buf.length;
      state = await reader.read();
      // Client-side backpressure: never let more than two records queue up in
      // the socket's send buffer.
      while (
        ws.bufferedAmount > ECE_RECORD_SIZE * 2 &&
        ws.readyState === WebSocket.OPEN &&
        !canceller.cancelled
      ) {
        await delay();
      }
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(new Uint8Array([0])); // EOF
    }

    await completedResponse;
    uploadInfo.duration = Date.now() - start;
    return uploadInfo;
  } catch (e) {
    const err = e as ConnectionError;
    err.size = size;
    err.duration = Date.now() - start;
    throw err;
  } finally {
    if (
      ws.readyState !== WebSocket.CLOSED &&
      ws.readyState !== WebSocket.CLOSING
    ) {
      ws.close();
    }
  }
}

export interface Cancellable<T> {
  cancel: () => void;
  result: Promise<T>;
}

export function uploadWs(
  encrypted: ReadableStream<Uint8Array>,
  metadataBuffer: ArrayBuffer,
  verifierB64: string,
  timeLimit: number,
  dlimit: number,
  bearerToken: string | undefined,
  onprogress: (size: number) => void
): Cancellable<UploadInfo> {
  const canceller: Canceller = { cancelled: false };

  return {
    cancel() {
      canceller.cancelled = true;
    },
    result: upload(
      encrypted,
      metadataBuffer,
      verifierB64,
      timeLimit,
      dlimit,
      bearerToken,
      onprogress,
      canceller
    )
  };
}

async function downloadS(
  id: string,
  keychain: Keychain,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const auth = await keychain.authHeader();

  const response = await fetch(getApiUrl(`/api/download/${id}`), {
    signal,
    method: 'GET',
    headers: { Authorization: auth }
  });

  const authHeader = response.headers.get('WWW-Authenticate');
  if (authHeader) {
    keychain.nonce = parseNonce(authHeader);
  }

  if (response.status !== 200) {
    throw new Error(String(response.status));
  }

  return response.body as ReadableStream<Uint8Array>;
}

async function tryDownloadStream(
  id: string,
  keychain: Keychain,
  signal: AbortSignal,
  tries = 2
): Promise<ReadableStream<Uint8Array>> {
  try {
    return await downloadS(id, keychain, signal);
  } catch (e) {
    const err = e as Error;
    if (err.message === '401' && --tries > 0) {
      return tryDownloadStream(id, keychain, signal, tries);
    }
    if (err.name === 'AbortError') {
      throw new Error('0');
    }
    throw err;
  }
}

export function downloadStream(
  id: string,
  keychain: Keychain
): Cancellable<ReadableStream<Uint8Array>> {
  const controller = new AbortController();
  return {
    cancel() {
      controller.abort();
    },
    result: tryDownloadStream(id, keychain, controller.signal)
  };
}

interface DownloadCanceller {
  oncancel: () => void;
}

async function download(
  id: string,
  keychain: Keychain,
  onprogress: (loaded: number) => void,
  canceller: DownloadCanceller
): Promise<Blob> {
  const auth = await keychain.authHeader();
  const xhr = new XMLHttpRequest();
  canceller.oncancel = () => xhr.abort();
  return new Promise((resolve, reject) => {
    xhr.addEventListener('loadend', () => {
      canceller.oncancel = () => {};
      const authHeader = xhr.getResponseHeader('WWW-Authenticate');
      if (authHeader) {
        keychain.nonce = parseNonce(authHeader);
      }
      if (xhr.status !== 200) {
        reject(new Error(String(xhr.status)));
        return;
      }
      resolve(new Blob([xhr.response]));
    });

    xhr.addEventListener('progress', event => {
      if (xhr.status === 200) {
        onprogress(event.loaded);
      }
    });
    xhr.open('get', getApiUrl(`/api/download/blob/${id}`));
    xhr.setRequestHeader('Authorization', auth);
    xhr.responseType = 'blob';
    xhr.send();
    onprogress(0);
  });
}

async function tryDownload(
  id: string,
  keychain: Keychain,
  onprogress: (loaded: number) => void,
  canceller: DownloadCanceller,
  tries = 2
): Promise<Blob> {
  try {
    return await download(id, keychain, onprogress, canceller);
  } catch (e) {
    if ((e as Error).message === '401' && --tries > 0) {
      return tryDownload(id, keychain, onprogress, canceller, tries);
    }
    throw e;
  }
}

export function downloadFile(
  id: string,
  keychain: Keychain,
  onprogress: (loaded: number) => void
): Cancellable<Blob> {
  const canceller: DownloadCanceller = {
    oncancel: () => {} // download() sets this
  };
  return {
    cancel() {
      canceller.oncancel();
    },
    result: tryDownload(id, keychain, onprogress, canceller)
  };
}

export async function getFileList(
  bearerToken: string,
  kid: string
): Promise<Blob> {
  const headers = new Headers({ Authorization: `Bearer ${bearerToken}` });
  const response = await fetch(getApiUrl(`/api/filelist/${kid}`), { headers });
  if (response.ok) {
    return response.blob();
  }
  throw new Error(String(response.status));
}

export async function setFileList(
  bearerToken: string,
  kid: string,
  data: ArrayBuffer
): Promise<boolean> {
  const headers = new Headers({ Authorization: `Bearer ${bearerToken}` });
  const response = await fetch(getApiUrl(`/api/filelist/${kid}`), {
    headers,
    method: 'POST',
    body: data
  });
  return response.ok;
}

export async function getConstants(): Promise<unknown> {
  const response = await fetch(getApiUrl('/config'));
  if (response.ok) {
    return response.json();
  }
  throw new Error(String(response.status));
}
