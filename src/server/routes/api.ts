import crypto from 'node:crypto';
import { Hono } from 'hono';
import { encryptedSize } from '../../core/utils';
import config, { deriveBaseUrl } from '../config';
import { isLimitExceeded, limitStream } from '../limiter';
import { createLogger } from '../log';
import type { AuthVariables } from '../middleware/auth';
import { fxaAuth, hmac, owner } from '../middleware/auth';
import storage from '../storage';

const log = createLogger('send.api');

// Ids are 8 random bytes rendered as hex; the wider bound covers historical ids.
const ID_PATTERN = '[0-9a-fA-F]{10,16}';
const KID_PATTERN = '[\\w-]{16}';

type Env = { Variables: AuthVariables };

/** Per-account file list blobs are keyed by user and derived key id. */
function fileListId(user: string, kid: string): string {
  const sha = crypto.createHash('sha256');
  sha.update(user);
  sha.update(kid);
  return `filelist-${sha.digest('hex')}`;
}

async function serveBlob(id: string): Promise<Response> {
  const contentLength = await storage.length(id);
  const stream = await storage.get(id);
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(contentLength)
    }
  });
}

const api = new Hono<Env>();

/**
 * Counts the download once the body has been fully delivered, and removes the
 * file when it hits its limit.
 */
async function download(c: import('hono').Context<Env>) {
  const id = c.req.param('id') as string;
  const meta = c.get('meta');
  try {
    const contentLength = await storage.length(id);
    const source = await storage.get(id);

    let delivered = 0;
    const counted = source.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          delivered += chunk.length;
          controller.enqueue(chunk);
        },
        async flush() {
          if (delivered < contentLength) {
            return;
          }
          try {
            if (meta.dl + 1 >= meta.dlimit) {
              await storage.del(id);
            } else {
              await storage.incrementField(id, 'dl');
            }
          } catch {
            log.info({ op: 'download.count', err: 'StorageError', id });
          }
        }
      })
    );

    return new Response(counted, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(contentLength)
      }
    });
  } catch {
    return c.body(null, 404);
  }
}

api.get(`/download/:id{${ID_PATTERN}}`, hmac, download);
api.get(`/download/blob/:id{${ID_PATTERN}}`, hmac, download);

api.get(`/exists/:id{${ID_PATTERN}}`, async c => {
  const meta = await storage.metadata(c.req.param('id'));
  if (!meta) {
    return c.body(null, 404);
  }
  c.header('WWW-Authenticate', `send-v1 ${meta.nonce}`);
  return c.json({ requiresPassword: meta.pwd });
});

api.get(`/metadata/:id{${ID_PATTERN}}`, hmac, async c => {
  const id = c.req.param('id');
  const meta = c.get('meta');
  try {
    const ttl = await storage.ttl(id);
    return c.json({
      metadata: meta.metadata,
      finalDownload: meta.dl + 1 === meta.dlimit,
      ttl
    });
  } catch {
    return c.body(null, 404);
  }
});

api.get(`/filelist/:id{${KID_PATTERN}}`, fxaAuth, async c => {
  const user = c.get('user');
  if (!user) {
    return c.body(null, 401);
  }
  try {
    return await serveBlob(fileListId(user, c.req.param('id')));
  } catch {
    return c.body(null, 404);
  }
});

api.post(`/filelist/:id{${KID_PATTERN}}`, fxaAuth, async c => {
  const user = c.get('user');
  if (!user) {
    return c.body(null, 401);
  }
  const body = c.req.raw.body;
  if (!body) {
    return c.body(null, 400);
  }
  try {
    await storage.set(
      fileListId(user, c.req.param('id')),
      body.pipeThrough(limitStream(1024 * 1024 * 10)),
      undefined,
      config.max_expire_seconds
    );
    return c.body(null, 200);
  } catch (e) {
    if (isLimitExceeded(e)) {
      return c.body(null, 413);
    }
    log.error({ op: 'filelist.post', err: (e as Error)?.message });
    return c.body(null, 500);
  }
});

/**
 * Non-streaming upload fallback for clients that cannot use `/api/ws`. The
 * body is the ECE ciphertext; the encrypted metadata rides in a header.
 */
api.post('/upload', fxaAuth, async c => {
  const newId = crypto.randomBytes(8).toString('hex');
  const metadata = c.req.header('X-File-Metadata');
  const auth = c.req.header('Authorization');
  const body = c.req.raw.body;
  if (!metadata || !auth || !body) {
    return c.body(null, 400);
  }
  const meta = {
    owner: crypto.randomBytes(10).toString('hex'),
    metadata,
    auth: auth.split(' ')[1] as string,
    nonce: crypto.randomBytes(16).toString('base64')
  };

  try {
    await storage.set(
      newId,
      body.pipeThrough(limitStream(encryptedSize(config.max_file_size))),
      meta,
      config.default_expire_seconds
    );
    c.header('WWW-Authenticate', `send-v1 ${meta.nonce}`);
    return c.json({
      url: `${deriveBaseUrl(c.req.raw)}/download/${newId}/`,
      owner: meta.owner,
      id: newId
    });
  } catch (e) {
    if (isLimitExceeded(e)) {
      return c.body(null, 413);
    }
    log.error({ op: 'upload', err: (e as Error)?.message });
    return c.body(null, 500);
  }
});

api.post(`/delete/:id{${ID_PATTERN}}`, owner, async c => {
  try {
    await storage.del(c.req.param('id') as string);
    return c.body(null, 200);
  } catch {
    return c.body(null, 404);
  }
});

api.post(`/password/:id{${ID_PATTERN}}`, owner, async c => {
  const id = c.req.param('id') as string;
  const { auth } = await c.req.json<{ auth?: string }>();
  if (!auth) {
    return c.body(null, 400);
  }
  try {
    await storage.setField(id, 'auth', auth);
    await storage.setField(id, 'pwd', 'true');
    return c.body(null, 200);
  } catch {
    return c.body(null, 404);
  }
});

api.post(`/params/:id{${ID_PATTERN}}`, owner, fxaAuth, async c => {
  const { dlimit } = await c.req.json<{ dlimit?: number }>();
  if (!dlimit || dlimit > config.max_downloads) {
    return c.body(null, 400);
  }
  try {
    await storage.setField(
      c.req.param('id') as string,
      'dlimit',
      String(dlimit)
    );
    return c.body(null, 200);
  } catch {
    return c.body(null, 404);
  }
});

api.post(`/info/:id{${ID_PATTERN}}`, owner, async c => {
  const meta = c.get('meta');
  try {
    const ttl = await storage.ttl(c.req.param('id') as string);
    return c.json({
      dlimit: +meta.dlimit,
      dtotal: +meta.dl,
      ttl
    });
  } catch {
    return c.body(null, 404);
  }
});

export default api;
export { ID_PATTERN, KID_PATTERN };
