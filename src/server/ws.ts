import crypto from 'node:crypto';
import type { WSContext, WSMessageReceive } from 'hono/ws';
import { ECE_RECORD_SIZE } from '../core/ece';
import { encryptedSize } from '../core/utils';
import config, { deriveBaseUrl } from './config';
import * as fxa from './fxa';
import { isLimitExceeded, LimitExceededError, limitStream } from './limiter';
import { createLogger } from './log';
import storage from './storage';

const log = createLogger('send.upload');

/**
 * Bun's server WebSocket cannot be paused, so instead of relying on socket
 * backpressure we bound the queue explicitly. The client already throttles
 * itself to two records of `bufferedAmount`, so exceeding this means the peer
 * is ignoring backpressure.
 */
const MAX_PENDING_BYTES = ECE_RECORD_SIZE * 8;

/** Single byte `0x00` marks the end of the upload body. */
function isEofSentinel(chunk: Uint8Array): boolean {
  return chunk.length === 1 && chunk[0] === 0;
}

function toBytes(data: WSMessageReceive): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  return null;
}

/** Turns discrete WebSocket frames into a single bounded ReadableStream. */
class UploadBody {
  readonly stream: ReadableStream<Uint8Array>;
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private pending = 0;
  private closed = false;

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: controller => {
        this.controller = controller;
      },
      pull: () => {
        this.pending = 0;
      },
      cancel: () => {
        this.closed = true;
      }
    });
  }

  /** @returns false once the body has ended, so later frames are ignored. */
  push(chunk: Uint8Array): boolean {
    if (this.closed) {
      return false;
    }
    if (isEofSentinel(chunk)) {
      this.end();
      return false;
    }
    this.pending += chunk.length;
    if (this.pending > MAX_PENDING_BYTES) {
      this.fail(new LimitExceededError(MAX_PENDING_BYTES));
      return false;
    }
    this.controller.enqueue(chunk);
    return true;
  }

  end() {
    if (this.closed) return;
    this.closed = true;
    this.controller.close();
  }

  fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    this.controller.error(error);
  }
}

interface UploadRequest {
  fileMetadata?: string;
  authorization?: string;
  bearer?: string;
  timeLimit?: number;
  dlimit?: number;
}

interface Session {
  body: UploadBody | null;
  /** Guards against a second control frame reopening the upload. */
  started: boolean;
}

const sessions = new WeakMap<WSContext, Session>();

export function onOpen(ws: WSContext) {
  sessions.set(ws, { body: null, started: false });
}

export function onClose(ws: WSContext, code?: number) {
  const session = sessions.get(ws);
  if (session?.body && code !== 1000) {
    session.body.fail(new Error('client disconnected'));
  }
  sessions.delete(ws);
}

export async function onMessage(
  ws: WSContext,
  data: WSMessageReceive,
  request: Request
) {
  const session = sessions.get(ws);
  if (!session) {
    return;
  }

  if (session.started) {
    const chunk = toBytes(data);
    if (chunk && session.body) {
      session.body.push(chunk);
    }
    return;
  }

  session.started = true;
  const body = new UploadBody();
  session.body = body;

  try {
    const newId = crypto.randomBytes(8).toString('hex');
    const owner = crypto.randomBytes(10).toString('hex');

    const fileInfo = JSON.parse(String(data)) as UploadRequest;
    const timeLimit = fileInfo.timeLimit || config.default_expire_seconds;
    const dlimit = fileInfo.dlimit || config.default_downloads;
    const metadata = fileInfo.fileMetadata;
    const auth = fileInfo.authorization;
    const user = await fxa.verify(fileInfo.bearer);

    if (config.fxa_required && !user) {
      ws.send(JSON.stringify({ error: 401 }));
      ws.close();
      return;
    }
    if (
      !metadata ||
      !auth ||
      timeLimit <= 0 ||
      timeLimit > config.max_expire_seconds ||
      dlimit > config.max_downloads
    ) {
      ws.send(JSON.stringify({ error: 400 }));
      ws.close();
      return;
    }

    const meta = {
      owner,
      metadata,
      dlimit: String(dlimit),
      auth: auth.split(' ')[1] as string,
      nonce: crypto.randomBytes(16).toString('base64')
    };

    const url = `${deriveBaseUrl(request)}/download/${newId}/`;
    ws.send(
      JSON.stringify({
        url,
        ownerToken: meta.owner,
        id: newId
      })
    );

    // The limiter is last in the chain so it sees exactly the bytes that would
    // be persisted.
    const limited = body.stream.pipeThrough(
      limitStream(encryptedSize(config.max_file_size))
    );

    await storage.set(newId, limited, meta, timeLimit);

    if (ws.readyState === 1) {
      // A cancelled upload closes the socket without erroring the stream, so
      // the state has to be checked before replying.
      ws.send(JSON.stringify({ ok: true }));
    }
  } catch (e) {
    log.error({ op: 'upload', err: (e as Error)?.message });
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ error: isLimitExceeded(e) ? 413 : 500 }));
    }
  } finally {
    session.body = null;
  }
  ws.close();
}
