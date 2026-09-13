import assert from 'node:assert';
import crypto from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import config from '../config';
import * as fxa from '../fxa';
import type Metadata from '../metadata';
import storage from '../storage';

export interface AuthVariables {
  meta: Metadata;
  nonce: string;
  user: string | null;
}

/**
 * `send-v1` challenge/response: the client signs the current nonce with the
 * key derived from the file's secret. On success the nonce is rotated and the
 * new one is returned in `WWW-Authenticate`, so each signature is usable once.
 */
export const hmac: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next
) => {
  const id = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  let authorized = false;

  if (id && authHeader) {
    try {
      const auth = authHeader.split(' ')[1] as string;
      const meta = await storage.metadata(id);
      if (!meta) {
        return c.body(null, 404);
      }
      const hash = crypto.createHmac(
        'sha256',
        Buffer.from(meta.auth, 'base64')
      );
      hash.update(Buffer.from(meta.nonce, 'base64'));
      const verifyHash = hash.digest();
      // timingSafeEqual throws on a length mismatch, which the catch below
      // turns into a plain 401.
      if (crypto.timingSafeEqual(verifyHash, Buffer.from(auth, 'base64'))) {
        const nonce = crypto.randomBytes(16).toString('base64');
        await storage.setField(id, 'nonce', nonce);
        c.header('WWW-Authenticate', `send-v1 ${nonce}`);
        c.set('nonce', nonce);
        c.set('meta', meta);
        authorized = true;
      } else {
        c.header('WWW-Authenticate', `send-v1 ${meta.nonce}`);
      }
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return c.body(null, 401);
  }
  await next();
  return undefined;
};

/** Proves ownership of an upload via the token handed out at upload time. */
export const owner: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next
) => {
  const id = c.req.param('id');
  let body: { owner_token?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const ownerToken = body.owner_token;
  let authorized = false;

  if (id && ownerToken) {
    try {
      const meta = await storage.metadata(id);
      if (!meta) {
        return c.body(null, 404);
      }
      const metaOwner = Buffer.from(meta.owner, 'utf8');
      const given = Buffer.from(ownerToken, 'utf8');
      assert(metaOwner.length > 0);
      assert(metaOwner.length === given.length);
      authorized = crypto.timingSafeEqual(metaOwner, given);
      if (authorized) {
        c.set('meta', meta);
      }
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return c.body(null, 401);
  }
  await next();
  return undefined;
};

/**
 * Attaches the FxA user when a bearer token is present. Anonymous requests are
 * allowed through unless `fxa_required` is set.
 */
export const fxaAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next
) => {
  const authHeader = c.req.header('Authorization');
  let user: string | null = null;
  if (authHeader && /^Bearer\s/i.test(authHeader)) {
    user = await fxa.verify(authHeader.split(' ')[1]);
  }
  c.set('user', user);

  if (config.fxa_required && !user) {
    return c.body(null, 401);
  }
  await next();
  return undefined;
};
