import * as Sentry from '@sentry/browser';
import { createRoot } from 'react-dom/client';
import { setLocale, setTranslate } from '../core/utils.ts';
import { App } from './App.tsx';
import { getTranslator } from './i18n/locale.ts';
import './main.css';
import { getStore } from './store.ts';

if (navigator.doNotTrack !== '1' && globalThis.SENTRY_CONFIG) {
  Sentry.init(globalThis.SENTRY_CONFIG);
}

async function start() {
  // Without WebCrypto nothing here works, and there is no longer a polyfill to
  // fall back to.
  if (
    !globalThis.crypto?.subtle &&
    window.location.pathname !== '/unsupported/crypto'
  ) {
    window.location.assign('/unsupported/crypto');
    return;
  }

  const locale = document.documentElement.lang || globalThis.LOCALE || 'en-US';
  setLocale(locale);

  const { capabilities } = getStore();

  if (capabilities.serviceWorker) {
    try {
      await navigator.serviceWorker.register('/serviceWorker.js');
      await navigator.serviceWorker.ready;
    } catch {
      // Streaming downloads need the worker; fall back to buffering.
      capabilities.streamDownload = false;
    }
  }

  const translate = await getTranslator(locale);
  // The crypto core formats sizes through this, outside of React.
  setTranslate(translate);

  const container = document.getElementById('app');
  if (!container) {
    throw new Error('missing #app container');
  }
  createRoot(container).render(<App translate={translate} />);
}

start();
