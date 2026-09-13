import path from 'node:path';
import type { ServerWebSocket } from 'bun';
import { createBunWebSocket } from 'hono/bun';
import { createApp } from './app';
import { DIST_DIR } from './assets';
import config from './config';
import { createLogger } from './log';
import { onClose, onMessage, onOpen } from './ws';

const log = createLogger('send.server');

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

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
