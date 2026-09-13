/**
 * Content-hashed asset URLs. The map is produced by scripts/build.ts and
 * injected into the page by the server, which resolves the same names for the
 * `<head>` links, so both sides agree on one set of hashes.
 */
const manifest: Record<string, string> = globalThis.ASSET_MANIFEST ?? {};

export function asset(name: string): string {
  return manifest[name] ?? `/${name}`;
}

/** An SVG sprite reference, e.g. `/blue_file.1a2b3c4d.svg#icon`. */
export function sprite(name: string, id: string): string {
  return `${asset(name)}#${id}`;
}

/**
 * The custom asset overrides come from server config, so a deployment can
 * rebrand without rebuilding.
 */
export function brandedAsset(
  override: string | undefined,
  name: string
): string {
  return override && override !== '' ? override : asset(name);
}
