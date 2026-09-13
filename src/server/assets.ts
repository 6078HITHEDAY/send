import path from 'node:path';

export const DIST_DIR = path.resolve(import.meta.dir, '..', '..', 'dist');

export interface AssetManifest {
  [logicalName: string]: string;
}

let manifest: AssetManifest = {};

try {
  manifest = (await import(`${DIST_DIR}/manifest.json`, {
    with: { type: 'json' }
  })) as unknown as AssetManifest;
  // Bun exposes JSON modules under `default`.
  manifest = (manifest as { default?: AssetManifest }).default ?? manifest;
} catch {
  // No build yet. The dev server injects a live manifest via setManifest().
}

export function setManifest(next: AssetManifest) {
  manifest = next;
}

/** @returns the content-hashed public path for a logical asset name. */
export function asset(name: string): string {
  return manifest[name] ?? `/${name}`;
}

export function matchAssets(pattern: RegExp): string[] {
  return Object.keys(manifest)
    .filter(k => pattern.test(k))
    .map(asset);
}

export function assetManifest(): AssetManifest {
  return manifest;
}
