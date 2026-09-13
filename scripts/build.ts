/**
 * Replaces webpack. Produces:
 *   dist/app.<hash>.js + dist/app.<hash>.css   the SPA bundle
 *   dist/serviceWorker.js                      unhashed, the registration
 *                                              path is hard-coded
 *   dist/<name>.<hash>.<ext>                   hashed copies of assets/
 *   dist/*                                     verbatim copies of public/
 *   dist/manifest.json                         logical name -> public path
 */
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import tailwind from 'bun-plugin-tailwind';

const ROOT = path.resolve(import.meta.dir, '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'assets');
const PUBLIC = path.join(ROOT, 'public');

export interface BuildOptions {
  minify?: boolean;
  sourcemap?: 'none' | 'linked' | 'inline' | 'external';
}

const HASHED_ASSET = /\.(png|jpg|jpeg|svg|webp|ico)$/;

/** Same 8 hex characters webpack's `[contenthash:8]` used. */
async function contentHash(file: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(await Bun.file(file).arrayBuffer());
  return hasher.digest('hex').slice(0, 8);
}

async function copyHashedAssets(): Promise<Record<string, string>> {
  const manifest: Record<string, string> = {};
  for (const name of await readdir(ASSETS)) {
    const source = path.join(ASSETS, name);
    if (!HASHED_ASSET.test(name)) {
      await cp(source, path.join(DIST, name));
      manifest[name] = `/${name}`;
      continue;
    }
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    const hashedName = `${base}.${await contentHash(source)}${ext}`;
    await cp(source, path.join(DIST, hashedName));
    manifest[name] = `/${hashedName}`;
  }
  return manifest;
}

async function copyPublic() {
  await cp(PUBLIC, DIST, { recursive: true });
}

function publicPath(outputPath: string): string {
  return `/${path.relative(DIST, outputPath).split(path.sep).join('/')}`;
}

export async function build(options: BuildOptions = {}) {
  const minify = options.minify ?? true;
  const sourcemap = options.sourcemap ?? 'linked';

  await mkdir(DIST, { recursive: true });

  const manifest: Record<string, string> = {
    ...(await copyHashedAssets())
  };
  await copyPublic();

  const client = await Bun.build({
    entrypoints: [path.join(ROOT, 'src', 'client', 'main.tsx')],
    outdir: DIST,
    target: 'browser',
    naming: {
      entry: 'app.[hash].[ext]',
      chunk: '[name].[hash].[ext]',
      asset: '[name].[hash].[ext]'
    },
    splitting: true,
    minify,
    sourcemap,
    publicPath: '/',
    plugins: [tailwind],
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        minify ? 'production' : 'development'
      )
    }
  });

  if (!client.success) {
    for (const message of client.logs) {
      console.error(message);
    }
    throw new AggregateError(client.logs, 'client build failed');
  }

  for (const output of client.outputs) {
    const p = publicPath(output.path);
    if (output.kind === 'entry-point' && p.endsWith('.js')) {
      manifest['app.js'] = p;
    } else if (p.endsWith('.css')) {
      manifest['app.css'] = p;
    }
  }

  // The service worker registers at a fixed path, so it cannot be hashed.
  const sw = await Bun.build({
    entrypoints: [path.join(ROOT, 'src', 'client', 'serviceWorker.ts')],
    outdir: DIST,
    target: 'browser',
    naming: { entry: 'serviceWorker.js' },
    minify,
    sourcemap,
    publicPath: '/',
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        minify ? 'production' : 'development'
      )
    }
  });

  if (!sw.success) {
    for (const message of sw.logs) {
      console.error(message);
    }
    throw new AggregateError(sw.logs, 'service worker build failed');
  }

  manifest['serviceWorker.js'] = '/serviceWorker.js';

  await Bun.write(
    path.join(DIST, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  return manifest;
}

export async function clean() {
  await rm(DIST, { recursive: true, force: true });
}

if (import.meta.main) {
  const manifest = await build();
  console.log(
    `built ${Object.keys(manifest).length} assets -> ${path.relative(
      process.cwd(),
      DIST
    )}`
  );
}
