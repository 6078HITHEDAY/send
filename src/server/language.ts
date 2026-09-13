import { readdirSync } from 'node:fs';
import path from 'node:path';
import { negotiateLanguages } from '@fluent/langneg';
import pkg from '../../package.json' with { type: 'json' };
import config from './config';

// The header length is bounded before this runs, so backtracking on a hostile
// value is not a concern. Kept identical to the original so negotiation
// behaviour is unchanged.
const ACCEPT_LANGUAGE =
  /(([a-zA-Z]+(-[a-zA-Z0-9]+){0,2})|\*)(;q=[0-1](\.[0-9]+)?)?/g;
const MAX_HEADER_LENGTH = 255;

export const LOCALES_PATH = path.resolve(
  import.meta.dir,
  '..',
  '..',
  'public',
  'locales'
);

/**
 * `l10n_dev` exposes every translation on disk, including ones not yet
 * complete enough to ship.
 */
export const availableLanguages: string[] = config.l10n_dev
  ? readdirSync(LOCALES_PATH)
  : (pkg.availableLanguages as string[]);

/**
 * @fluent/langneg carries its own minimal CLDR likely-subtags table, so
 * requests such as `zh-Hant` still resolve to `zh-TW` without depending on the
 * full `cldr-core` dataset.
 */
export function negotiateLanguage(acceptLanguage: string | null): string {
  const header = acceptLanguage || 'en-US';
  if (header.length > MAX_HEADER_LENGTH) {
    return 'en-US';
  }
  const langs = header.replace(/\s/g, '').match(ACCEPT_LANGUAGE) || ['en-US'];
  const preferred = langs
    .map(l => {
      const parts = l.split(';');
      return {
        locale: parts[0] as string,
        q: parts[1] ? Number.parseFloat(parts[1].split('=')[1] as string) : 1
      };
    })
    .sort((a, b) => b.q - a.q)
    .map(x => x.locale);

  return (
    negotiateLanguages(preferred, availableLanguages, {
      strategy: 'lookup',
      defaultLocale: 'en-US'
    })[0] ?? 'en-US'
  );
}
