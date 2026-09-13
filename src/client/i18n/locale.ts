import { FluentBundle, FluentResource } from '@fluent/bundle';
import type { TranslateFn } from '../../core/utils.ts';

function makeBundle(locale: string, ftl: string): FluentBundle {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  bundle.addResource(new FluentResource(ftl));
  return bundle;
}

/**
 * Locale files are fetched rather than bundled: there are 86 of them and a
 * visitor needs at most two (theirs plus the en-US fallback).
 */
async function fetchFtl(locale: string): Promise<string | null> {
  try {
    const response = await fetch(`/locales/${locale}/send.ftl`);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

export async function getTranslator(locale: string): Promise<TranslateFn> {
  const bundles: FluentBundle[] = [];
  if (locale !== 'en-US') {
    const ftl = await fetchFtl(locale);
    if (ftl) {
      bundles.push(makeBundle(locale, ftl));
    }
  }
  const en = await fetchFtl('en-US');
  if (en) {
    bundles.push(makeBundle('en-US', en));
  }

  return (id, data) => {
    for (const bundle of bundles) {
      const message = bundle.getMessage(id);
      if (message?.value) {
        return bundle.formatPattern(
          message.value,
          data as Record<string, string | number> | undefined
        );
      }
    }
    // Better a visible id than a blank string, which is what the old
    // implementation returned when a message was missing everywhere.
    return id;
  };
}
