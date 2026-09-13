import crypto from 'node:crypto';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { NONCE, secureHeaders } from 'hono/secure-headers';
import { UAParser } from 'ua-parser-js';
import { clientConstants } from './clientConstants';
import config, { deriveBaseUrl, IS_DEV } from './config';
import type { AuthVariables } from './middleware/auth';
import api from './routes/api';
import type { PageVariables } from './routes/pages';
import pages, { renderNotFound, resolveRequestLocale } from './routes/pages';
import storage from './storage';
import version from './version';

export type AppVariables = AuthVariables &
  PageVariables & {
    ua: ReturnType<UAParser['getResult']>;
    geo: { country?: string; state?: string };
  };

export type AppEnv = { Variables: AppVariables };

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  if (IS_DEV) {
    app.use(logger());
  }

  app.use(
    secureHeaders({
      // helmet's HSTS was forced on in production only; in development the
      // server is reached over plain HTTP.
      strictTransportSecurity: IS_DEV ? false : 'max-age=31536000',
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: IS_DEV
        ? undefined
        : {
            defaultSrc: ["'self'"],
            connectSrc: [
              "'self'",
              c => deriveBaseUrl(c.req.raw).replace(/^http(s?):\/\//, 'ws$1://')
            ],
            imgSrc: ["'self'", 'data:'],
            // No 'unsafe-eval' and no 'unsafe-inline': the inline boot script
            // and the theme <style> both carry this request's nonce.
            scriptSrc: ["'self'", NONCE],
            styleSrc: ["'self'", NONCE],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            reportUri: '/__cspreport__'
          }
    })
  );

  app.use(async (c, next) => {
    // secureHeaders generates the nonce in production; development has no CSP,
    // so make one here to keep the templates uniform.
    c.set(
      'cspNonce',
      c.get('secureHeadersNonce') ?? crypto.randomBytes(16).toString('base64')
    );
    c.set('ua', new UAParser(c.req.header('user-agent') ?? '').getResult());
    c.set(
      'locale',
      resolveRequestLocale(c.req.header('accept-language') ?? null)
    );

    // Set by the load balancer.
    const [country, state] = (
      c.req.header('X-Client-Geo-Location') ?? ''
    ).split(',');
    c.set('geo', country ? { country, state } : {});

    await next();

    c.header('Pragma', 'no-cache');
    c.header(
      'Cache-Control',
      'private, no-cache, no-store, must-revalidate, max-age=0'
    );
  });

  app.get('/config', c => c.json(clientConstants));
  app.get('/__version__', c => c.json(version));
  app.get('/__lbheartbeat__', c => c.body(null, 200));
  app.get('/__heartbeat__', async c => {
    try {
      await storage.ping();
      return c.body(null, 200);
    } catch {
      return c.body(null, 500);
    }
  });
  app.post('/__cspreport__', c => c.body(null, 204));

  app.route('/api', api);
  app.route('/', pages);

  app.notFound(c =>
    renderNotFound(c.req.raw, {
      locale: c.get('locale'),
      cspNonce: c.get('cspNonce')
    })
  );

  return app;
}

export { config };
