import type {
  Defaults,
  Limits,
  WebUi
} from '../server/clientConstants.ts';
import type { AuthConfig } from '../core/fxa.ts';

/** Metadata the server seeds into a download page so the SPA can start. */
export interface DownloadMetadata {
  nonce?: string;
  pwd?: boolean;
  status?: number;
}

export interface Prefs {
  surveyUrl?: string;
}

declare global {
  // Injected by the server in an inline script carrying the CSP nonce.
  var LIMITS: Limits;
  var WEB_UI: WebUi;
  var DEFAULTS: Defaults;
  var PREFS: Prefs;
  var downloadMetadata: DownloadMetadata;
  var BASE_URL: string;
  var LOCALE: string;
  var ASSET_MANIFEST: Record<string, string>;
  var AUTH_CONFIG: (AuthConfig & { client_id: string }) | undefined;
  var SENTRY_CONFIG: Record<string, unknown> | undefined;
}

export const LIMITS = globalThis.LIMITS;
export const WEB_UI = globalThis.WEB_UI;
export const DEFAULTS = globalThis.DEFAULTS;
export const PREFS = globalThis.PREFS ?? {};
export const BASE_URL = globalThis.BASE_URL;
export const AUTH_CONFIG = globalThis.AUTH_CONFIG;

export function downloadMetadata(): DownloadMetadata {
  return globalThis.downloadMetadata ?? {};
}
