import type { Context } from 'hono';
import { Hono } from 'hono';
import config, { deriveBaseUrl } from '../config';
import type { DownloadMetadata } from '../html';
import { renderShell, resolveLocale, uiAssets } from '../html';
import { negotiateLanguage } from '../language';
import storage from '../storage';
import { ID_PATTERN } from './api';

export interface PageVariables {
  cspNonce: string;
  locale: string;
}

/**
 * Takes the request and the page variables directly rather than a `Context`, so
 * the same code can serve these routes and the app-wide `notFound` handler,
 * whose Hono env is wider than this router's.
 */
export async function renderPage(
  request: Request,
  vars: PageVariables,
  robots: 'all' | 'none',
  downloadMetadata?: DownloadMetadata
): Promise<Response> {
  const html = await renderShell({
    locale: vars.locale,
    baseUrl: deriveBaseUrl(request),
    cspNonce: vars.cspNonce,
    robots,
    downloadMetadata
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' }
  });
}

export async function renderNotFound(
  request: Request,
  vars: PageVariables
): Promise<Response> {
  const response = await renderPage(request, vars, 'none', { status: 404 });
  return new Response(response.body, {
    status: 404,
    headers: response.headers
  });
}

export function resolveRequestLocale(acceptLanguage: string | null): string {
  return resolveLocale(negotiateLanguage(acceptLanguage));
}

type PageEnv = { Variables: PageVariables };

const pages = new Hono<PageEnv>();

function pageVars(c: Context<PageEnv>): PageVariables {
  return { locale: c.get('locale'), cspNonce: c.get('cspNonce') };
}

const page =
  (robots: 'all' | 'none') =>
  (c: Context<PageEnv>): Promise<Response> =>
    renderPage(c.req.raw, pageVars(c), robots);

pages.get('/', page('all'));
pages.get('/error', page('none'));
pages.get('/oauth', page('none'));
pages.get('/login', page('none'));
pages.get('/unsupported/:reason', page('none'));

/**
 * Seeds the page with the file's current nonce so the SPA's first authenticated
 * request already has one. The secret key lives in the fragment and so never
 * reaches this handler.
 */
async function downloadPage(c: Context<PageEnv>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) {
    return renderNotFound(c.req.raw, pageVars(c));
  }
  const meta = await storage.metadata(id);
  if (!meta) {
    return renderNotFound(c.req.raw, pageVars(c));
  }
  c.header('WWW-Authenticate', `send-v1 ${meta.nonce}`);
  return renderPage(c.req.raw, pageVars(c), 'none', {
    nonce: meta.nonce,
    pwd: meta.pwd
  });
}

// Accept an optional trailing slash so older share links still resolve.
pages.get(`/download/:id{${ID_PATTERN}}`, downloadPage);
pages.get(`/download/:id{${ID_PATTERN}}/`, downloadPage);

pages.get('/app.webmanifest', c => {
  const assets = uiAssets(deriveBaseUrl(c.req.raw));
  c.header('Content-Type', 'application/manifest+json');
  return c.body(
    JSON.stringify({
      name: config.custom_title,
      short_name: config.custom_title,
      lang: c.get('locale'),
      icons: [
        {
          src: assets.android_chrome_192px,
          type: 'image/png',
          sizes: '192x192'
        },
        {
          src: assets.android_chrome_512px,
          type: 'image/png',
          sizes: '512x512'
        }
      ],
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#220033',
      background_color: 'white'
    })
  );
});

export default pages;
