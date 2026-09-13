import { watch } from 'node:fs';
import path from 'node:path';
import { build } from '../../scripts/build';
import { setManifest } from './assets';
import { createLogger } from './log';
import { listen } from './serve';

const log = createLogger('send.dev');
const ROOT = path.resolve(import.meta.dir, '..', '..');

/**
 * `Bun.build` is fast enough to rebuild the whole bundle on save, which keeps
 * dev and production on one code path. A Bun HTML entrypoint would give HMR but
 * would bypass the server-rendered shell that carries the CSP nonce and the
 * injected globals.
 */
let building: Promise<unknown> = Promise.resolve();

async function rebuild(reason: string) {
  const started = Bun.nanoseconds();
  try {
    setManifest(await build({ minify: false, sourcemap: 'linked' }));
    log.info({
      op: 'rebuild',
      reason,
      ms: Math.round((Bun.nanoseconds() - started) / 1e6)
    });
  } catch (e) {
    log.error({ op: 'rebuild', reason, err: (e as Error)?.message });
  }
}

await rebuild('startup');
listen();

for (const dir of ['src/client', 'src/core', 'assets', 'public']) {
  watch(path.join(ROOT, dir), { recursive: true }, (_event, filename) => {
    if (!filename || filename.includes('locales/')) return;
    building = building.then(() => rebuild(filename));
  });
}
