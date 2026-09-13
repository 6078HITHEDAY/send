import path from 'node:path';
import type { ServerWebSocket } from 'bun';
import { createBunWebSocket } from 'hono/bun';
import { createWSMessageEvent, WSContext } from 'hono/ws';
import { createApp } from './app';
import { DIST_DIR } from './assets';
import config from './config';
import { createLogger } from './log';
import { onClose, onMessage, onOpen } from './ws';

const log = createLogger('send.server');

const { upgradeWebSocket, websocket: bunWebsocket } =
  createBunWebSocket<ServerWebSocket>();

type BunWsData = {
  events: {
    onOpen?: (event: Event, ws: WSContext) => void;
    onMessage?: (event: MessageEvent, ws: WSContext) => void;
    onClose?: (event: CloseEvent, ws: WSContext) => void;
  };
  url: URL;
  protocol: string;
};

/**
 * Hono's stock Bun adapter does `message.buffer` for binary frames, which
 * keeps the pooled ArrayBuffer's full byteLength (and offset). Slice to the
 * actual frame so our 0x00 EOF sentinel and size limiter see the real bytes.
 */
function framePayload(
  message: string | ArrayBufferView | ArrayBuffer
): string | ArrayBuffer {
  if (typeof message === 'string') {
    return message;
  }
  if (ArrayBuffer.isView(message)) {
    // Copy into a fresh ArrayBuffer so pooled/shared backing stores cannot
    // inflate the frame length past the actual WebSocket payload.
    return message.buffer.slice(
      message.byteOffset,
      message.byteOffset + message.byteLength
    ) as ArrayBuffer;
  }
  return message;
}

function wsContext(ws: ServerWebSocket<BunWsData>): WSContext {
  return new WSContext({
    send: (source, options) => {
      ws.send(source, options?.compress);
    },
    raw: ws,
    readyState: ws.readyState,
    url: ws.data.url,
    protocol: ws.data.protocol,
    close(code, reason) {
      ws.close(code, reason);
    }
  });
}

const websocket = {
  open(ws: ServerWebSocket<BunWsData>) {
    bunWebsocket.open(ws);
  },
  close(ws: ServerWebSocket<BunWsData>, code: number, reason: string) {
    bunWebsocket.close(ws, code, reason);
  },
  message(
    ws: ServerWebSocket<BunWsData>,
    message: string | ArrayBufferView | ArrayBuffer
  ) {
    const onMessage = ws.data.events.onMessage;
    if (!onMessage) return;
    onMessage(createWSMessageEvent(framePayload(message)), wsContext(ws));
  }
};

/** Hashed bundles are immutable; the service worker must never be cached. */
function staticHeaders(pathname: string): Record<string, string> {
  if (/serviceWorker\.js$/.test(pathname)) {
    return { 'Cache-Control': 'no-cache' };
  }
  return { 'Cache-Control': 'public, max-age=31536000, immutable' };
}

async function serveStatic(pathname: string): Promise<Response | null> {
  // `path.normalize` collapses `..` before the prefix check, so a traversal
  // attempt cannot escape dist/.
  const resolved = path.join(DIST_DIR, path.normalize(pathname));
  if (!resolved.startsWith(DIST_DIR)) {
    return null;
  }
  const file = Bun.file(resolved);
  if (!(await file.exists())) {
    return null;
  }
  return new Response(file, { headers: staticHeaders(pathname) });
}

export function buildServer() {
  const app = createApp();

  app.get(
    '/api/ws',
    upgradeWebSocket(c => {
      const request = c.req.raw;
      return {
        onOpen: (_event, ws) => onOpen(ws),
        onMessage: (event, ws) => onMessage(ws, event.data, request),
        onClose: (event, ws) => onClose(ws, event.code)
      };
    })
  );

  return {
    fetch: async (request: Request, server: unknown): Promise<Response> => {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const asset = await serveStatic(url.pathname);
        if (asset) {
          return asset;
        }
      }
      return app.fetch(request, { server });
    },
    websocket
  };
}

export function listen() {
  const { fetch, websocket } = buildServer();
  const server = Bun.serve({
    hostname: config.listen_address,
    port: config.listen_port,
    // Uploads stream through, so no single request needs a large body limit,
    // but the fallback POST /api/upload does.
    maxRequestBodySize: 1024 * 1024 * 1024 * 4,
    idleTimeout: 255,
    fetch,
    websocket
  });
  log.info({
    op: 'listen',
    address: server.hostname,
    port: server.port,
    env: config.env
  });
  return server;
}
