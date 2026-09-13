/**
 * Replaces build/version_plugin.js. Keeps the same three fields so
 * `GET /__version__` and the Sentry release tag are unchanged.
 */
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const DIST = path.resolve(import.meta.dir, '..', 'dist');

async function gitCommit(): Promise<string> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--short', 'HEAD'], {
      stdout: 'pipe',
      stderr: 'ignore'
    });
    const out = (await new Response(proc.stdout).text()).trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

const version = {
  commit: await gitCommit(),
  source: pkg.homepage,
  version: process.env.SEND_RELEASE_TAG || `v${pkg.version}`
};

await Bun.write(
  path.join(DIST, 'version.json'),
  `${JSON.stringify(version, null, 2)}\n`
);

console.log(`wrote dist/version.json ${version.version} (${version.commit})`);
