import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FluentVariable } from '@fluent/bundle';
import { FluentBundle, FluentResource } from '@fluent/bundle';
import { LOCALES_PATH } from './language';

function makeBundle(locale: string): [string, FluentBundle] {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  bundle.addResource(
    new FluentResource(
      readFileSync(path.resolve(LOCALES_PATH, locale, 'send.ftl'), 'utf8')
    )
  );
  return [locale, bundle];
}

const bundles = new Map(readdirSync(LOCALES_PATH).map(makeBundle));

export type Translate = (
  id: string,
  data?: Record<string, FluentVariable>
) => string;

export function getTranslator(locale: string): Translate {
  const defaultBundle = bundles.get('en-US') as FluentBundle;
  const bundle = bundles.get(locale) || defaultBundle;
  return (id, data) => {
    const message = bundle.hasMessage(id)
      ? bundle.getMessage(id)
      : defaultBundle.getMessage(id);
    const target = bundle.hasMessage(id) ? bundle : defaultBundle;
    if (!message?.value) {
      return id;
    }
    return target.formatPattern(message.value, data);
  };
}
