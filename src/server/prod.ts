import * as Sentry from '@sentry/node';
import config from './config';
import { listen } from './serve';

if (config.sentry_dsn) {
  Sentry.init({ dsn: config.sentry_dsn });
}

listen();
