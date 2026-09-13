import { asset, assetManifest } from './assets';
import { clientConstants } from './clientConstants';
import config from './config';
import type { FxaConfig } from './fxa';
import { getFxaConfig } from './fxa';
import { availableLanguages } from './language';
import { getTranslator } from './locale';
import version from './version';

export interface DownloadMetadata {
  nonce?: string;
  pwd?: boolean;
  status?: number;
}

export interface ShellOptions {
  locale: string;
  baseUrl: string;
  cspNonce: string;
  robots: 'all' | 'none';
  downloadMetadata?: DownloadMetadata;
}

export interface UiAssets {
  android_chrome_192px: string;
  android_chrome_512px: string;
  apple_touch_icon: string;
  favicon_16px: string;
  favicon_32px: string;
  icon: string;
  safari_pinned_tab: string;
  facebook: string;
  twitter: string;
  wordmark: string;
  user: string;
  custom_css: string;
}

export function resolveLocale(negotiated: string): string {
  if (
    config.custom_locale !== '' &&
    availableLanguages.includes(config.custom_locale)
  ) {
    return config.custom_locale;
  }
  return negotiated || 'en-US';
}

export function uiAssets(baseUrl: string): UiAssets {
  const assets: UiAssets = {
    android_chrome_192px: asset('android-chrome-192x192.png'),
    android_chrome_512px: asset('android-chrome-512x512.png'),
    apple_touch_icon: asset('apple-touch-icon.png'),
    favicon_16px: asset('favicon-16x16.png'),
    favicon_32px: asset('favicon-32x32.png'),
    icon: asset('icon.svg'),
    safari_pinned_tab: asset('safari-pinned-tab.svg'),
    facebook: `${baseUrl}${asset('send-fb.jpg')}`,
    twitter: `${baseUrl}${asset('send-twitter.jpg')}`,
    wordmark: `${asset('wordmark.svg')}#logo`,
    user: asset('user.svg'),
    custom_css: ''
  };
  for (const key of Object.keys(assets) as (keyof UiAssets)[]) {
    const override = (config.ui_custom_assets as Record<string, string>)[key];
    if (override) {
      assets[key] = override;
    }
  }
  return assets;
}

export async function authConfig(): Promise<
  (FxaConfig & { client_id: string }) | null
> {
  if (!config.fxa_client_id) {
    return null;
  }
  const fetched = await getFxaConfig();
  if (!fetched) {
    return null;
  }
  return { ...fetched, client_id: config.fxa_client_id };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serialises a value for embedding in an inline `<script>`. `</script>` inside
 * a JSON string would otherwise close the element early.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sentryConfig(): string {
  if (!config.sentry_id) {
    return '';
  }
  return `window.SENTRY_CONFIG = {
  dsn: ${jsonForScript(config.sentry_id)},
  release: ${jsonForScript(version.version)},
  beforeSend: function (data) {
    // Strip the secret key out of any URL that ends up in a report.
    var hash = window.location.hash;
    if (hash) {
      return JSON.parse(JSON.stringify(data).replace(new RegExp(hash.slice(1), 'g'), ''));
    }
    return data;
  }
};`;
}

/**
 * The globals the SPA reads at boot. Served inline under the per-request CSP
 * nonce, exactly as the old `initScript` did.
 */
function initScript(options: ShellOptions, auth: unknown): string {
  return [
    `window.LIMITS = ${jsonForScript(clientConstants.LIMITS)};`,
    `window.WEB_UI = ${jsonForScript(clientConstants.WEB_UI)};`,
    `window.DEFAULTS = ${jsonForScript(clientConstants.DEFAULTS)};`,
    `window.PREFS = ${jsonForScript(
      config.survey_url ? { surveyUrl: config.survey_url } : {}
    )};`,
    `window.downloadMetadata = ${jsonForScript(
      options.downloadMetadata ?? {}
    )};`,
    `window.ASSET_MANIFEST = ${jsonForScript(assetManifest())};`,
    `window.BASE_URL = ${jsonForScript(options.baseUrl)};`,
    `window.LOCALE = ${jsonForScript(options.locale)};`,
    auth ? `window.AUTH_CONFIG = ${jsonForScript(auth)};` : '',
    sentryConfig()
  ]
    .filter(Boolean)
    .join('\n');
}

export async function renderShell(options: ShellOptions): Promise<string> {
  const translate = getTranslator(options.locale);
  const assets = uiAssets(options.baseUrl);
  const auth = await authConfig();
  const customCss = assets.custom_css
    ? `<link rel="stylesheet" href="${escapeHtml(assets.custom_css)}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(options.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(config.custom_title)}</title>
    <base href="/" />
    <meta name="robots" content="${options.robots},noarchive" />
    <meta name="google" content="nositelinkssearchbox" />

    <meta property="og:title" content="${escapeHtml(config.custom_title)}" />
    <meta name="twitter:title" content="${escapeHtml(config.custom_title)}" />
    <meta name="description" content="${escapeHtml(
      config.custom_description
    )}" />
    <meta property="og:description" content="${escapeHtml(
      config.custom_description
    )}" />
    <meta name="twitter:description" content="${escapeHtml(
      config.custom_description
    )}" />
    <meta name="twitter:card" content="summary" />
    <meta property="og:image" content="${escapeHtml(assets.facebook)}" />
    <meta name="twitter:image" content="${escapeHtml(assets.twitter)}" />
    <meta property="og:url" content="${escapeHtml(options.baseUrl)}" />
    <meta name="theme-color" content="#220033" />
    <meta name="msapplication-TileColor" content="#220033" />

    <link rel="manifest" href="/app.webmanifest" />
    <link rel="stylesheet" href="/inter.css" />
    <style nonce="${options.cspNonce}">
      :root {
        --send-color-primary: ${config.ui_color_primary};
        --send-color-accent: ${config.ui_color_accent};
      }
    </style>
    <link rel="stylesheet" href="${escapeHtml(asset('app.css'))}" />
    ${customCss}
    <link
      rel="apple-touch-icon"
      sizes="180x180"
      href="${escapeHtml(assets.apple_touch_icon)}"
    />
    <link
      rel="icon"
      type="image/png"
      sizes="32x32"
      href="${escapeHtml(assets.favicon_32px)}"
    />
    <link
      rel="icon"
      type="image/png"
      sizes="16x16"
      href="${escapeHtml(assets.favicon_16px)}"
    />
    <link
      rel="mask-icon"
      href="${escapeHtml(assets.safari_pinned_tab)}"
      color="#838383"
    />
    <script nonce="${options.cspNonce}">
${initScript(options, auth)}
    </script>
    <script defer src="${escapeHtml(asset('app.js'))}"></script>
  </head>
  <body
    class="flex flex-col items-center font-sans md:h-screen md:bg-grey-10 dark:bg-black"
  >
    <noscript>
      <div class="noscript">
        <h2>${escapeHtml(translate('javascriptRequired'))}</h2>
        <p>
          <a
            class="link"
            href="https://github.com/timvisee/send/blob/master/docs/faq.md#why-does-send-require-javascript"
            >${escapeHtml(translate('whyJavascript'))}</a
          >
        </p>
        <p>${escapeHtml(translate('enableJavascript'))}</p>
      </div>
    </noscript>
    <!-- display:contents keeps the React subtree in the body's flex layout. -->
    <div id="app" class="contents"></div>
  </body>
</html>
`;
}
