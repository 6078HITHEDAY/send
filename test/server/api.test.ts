import { afterAll, describe, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Isolate this suite from whatever FILE_DIR / NODE_ENV the developer shell
 * happens to carry, and force the in-memory Redis path.
 */
const fileDir = mkdtempSync(path.join(tmpdir(), 'send-api-test-'));
process.env.NODE_ENV = 'test';
process.env.FILE_DIR = fileDir;
process.env.REDIS_HOST = 'localhost';
process.env.BASE_URL = 'http://send.test';

const { createApp } = await import('../../src/server/app.ts');
const app = createApp();

afterAll(() => {
  rmSync(fileDir, { recursive: true, force: true });
});

function sign(authKey: Buffer, nonceB64: string): string {
  return crypto
    .createHmac('sha256', authKey)
    .update(Buffer.from(nonceB64, 'base64'))
    .digest('base64');
}

async function upload(body: Uint8Array = new Uint8Array(64).fill(7)): Promise<{
  id: string;
  owner: string;
  authKey: Buffer;
  nonce: string;
}> {
  const authKey = crypto.randomBytes(16);
  const response = await app.request('/api/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Metadata': Buffer.from('meta').toString('base64'),
      Authorization: `send-v1 ${authKey.toString('base64')}`
    },
    body: new Blob([Buffer.from(body)])
  });
  expect(response.status).toBe(200);
  const json = (await response.json()) as {
    id: string;
    owner: string;
    url: string;
  };
  const nonce = response.headers.get('WWW-Authenticate')?.split(' ')[1];
  expect(nonce).toBeTruthy();
  return { id: json.id, owner: json.owner, authKey, nonce: nonce as string };
}

describe('POST /api/upload', () => {
  test('stores the blob and returns an owner token', async () => {
    const { id, owner } = await upload();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(owner).toMatch(/^[0-9a-f]{20}$/);
  });

  test('rejects a request missing Authorization with 400', async () => {
    const response = await app.request('/api/upload', {
      method: 'POST',
      headers: { 'X-File-Metadata': 'bWV0YQ' },
      body: new Uint8Array([1])
    });
    expect(response.status).toBe(400);
  });
});

describe('send-v1 HMAC auth', () => {
  test('rejects a missing Authorization header with 401', async () => {
    const { id } = await upload();
    const response = await app.request(`/api/metadata/${id}`);
    expect(response.status).toBe(401);
  });

  test('rejects a bad signature with 401 and returns the current nonce', async () => {
    const { id, nonce } = await upload();
    const response = await app.request(`/api/metadata/${id}`, {
      headers: {
        Authorization: `send-v1 ${Buffer.alloc(32).toString('base64')}`
      }
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe(`send-v1 ${nonce}`);
  });

  test('rotates the nonce on success', async () => {
    const { id, authKey, nonce } = await upload();
    const response = await app.request(`/api/metadata/${id}`, {
      headers: { Authorization: `send-v1 ${sign(authKey, nonce)}` }
    });
    expect(response.status).toBe(200);
    const next = response.headers.get('WWW-Authenticate')?.split(' ')[1];
    expect(next).toBeTruthy();
    expect(next).not.toBe(nonce);

    // The old nonce must no longer work.
    const replay = await app.request(`/api/metadata/${id}`, {
      headers: { Authorization: `send-v1 ${sign(authKey, nonce)}` }
    });
    expect(replay.status).toBe(401);
  });
});

describe('owner-token routes', () => {
  test('DELETE requires a matching owner token', async () => {
    const { id, owner } = await upload();

    const denied = await app.request(`/api/delete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_token: 'nope' })
    });
    expect(denied.status).toBe(401);

    const ok = await app.request(`/api/delete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_token: owner })
    });
    expect(ok.status).toBe(200);

    const gone = await app.request(`/api/exists/${id}`);
    expect(gone.status).toBe(404);
  });

  test('password and params update the stored metadata', async () => {
    const { id, owner } = await upload();

    const pwd = await app.request(`/api/password/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_token: owner,
        auth: crypto.randomBytes(16).toString('base64')
      })
    });
    expect(pwd.status).toBe(200);

    const params = await app.request(`/api/params/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_token: owner, dlimit: 5 })
    });
    expect(params.status).toBe(200);

    const info = await app.request(`/api/info/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_token: owner })
    });
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ dlimit: 5, dtotal: 0 });
  });

  test('params rejects a dlimit over the configured maximum', async () => {
    const { id, owner } = await upload();
    const response = await app.request(`/api/params/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_token: owner, dlimit: 999999 })
    });
    expect(response.status).toBe(400);
  });
});

describe('download', () => {
  test('returns the ciphertext and removes the file at the download limit', async () => {
    const payload = new Uint8Array(32).fill(9);
    const { id, authKey, nonce } = await upload(payload);

    const response = await app.request(`/api/download/${id}`, {
      headers: { Authorization: `send-v1 ${sign(authKey, nonce)}` }
    });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(payload);

    // Default dlimit is 1, so the next exists check should 404.
    // The download counter runs in the response stream's flush, so drain first
    // (already done via arrayBuffer above) and give the microtask a turn.
    await Promise.resolve();
    const exists = await app.request(`/api/exists/${id}`);
    expect(exists.status).toBe(404);
  });
});

describe('page routes', () => {
  test('GET / returns the HTML shell', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('id="app"');
    expect(html).toContain('window.LIMITS');
  });

  test('unknown paths render the 404 shell', async () => {
    const response = await app.request('/nope');
    expect(response.status).toBe(404);
  });
});

describe('ops endpoints', () => {
  test('__lbheartbeat__ is always 200', async () => {
    const response = await app.request('/__lbheartbeat__');
    expect(response.status).toBe(200);
  });

  test('__heartbeat__ pings storage', async () => {
    const response = await app.request('/__heartbeat__');
    expect(response.status).toBe(200);
  });

  test('__version__ returns the build metadata', async () => {
    const response = await app.request('/__version__');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { version: string };
    expect(body.version).toMatch(/^v?\d+\.\d+\.\d+/);
  });
});
