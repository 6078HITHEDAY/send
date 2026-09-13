import { browserName, locale } from './utils';

export interface Capabilities {
  account: boolean;
  serviceWorker: boolean;
  streamDownload: boolean;
  share: boolean;
  standalone: boolean;
}

/**
 * Safari and Firefox for Android cannot consume a service-worker-generated
 * streaming response, so they fall back to buffering the whole file in memory.
 */
export default function getCapabilities(
  authConfigured: boolean
): Capabilities {
  const browser = browserName();
  const isMobile = /mobi|android/i.test(navigator.userAgent);
  const serviceWorker = 'serviceWorker' in navigator;

  let account = authConfigured;
  try {
    account = account && !!localStorage;
  } catch {
    account = false;
  }

  const share =
    isMobile &&
    typeof navigator.share === 'function' &&
    locale().startsWith('en'); // en until strings merge

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  const mobileFirefox = browser === 'firefox' && isMobile;

  return {
    account,
    serviceWorker,
    streamDownload:
      serviceWorker && browser !== 'safari' && !mobileFirefox,
    share,
    standalone
  };
}
