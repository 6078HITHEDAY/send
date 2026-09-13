import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const env = process.env;

function bool(name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

function num(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return Number(raw);
}

function str(name: string, fallback: string): string {
  const raw = env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

/** Accepts an int array or a comma-separated string of positive integers. */
const positiveIntArray = z
  .union([z.string(), z.array(z.number())])
  .transform(value =>
    Array.isArray(value)
      ? value
      : value
          .trim()
          .split(',')
          .map(part => Number.parseInt(part.replace(/['"]+/g, '').trim(), 10))
  )
  .pipe(z.array(z.number().int().nonnegative()).min(1));

function intList(name: string, fallback: number[]): number[] {
  const raw = env[name];
  return positiveIntArray.parse(
    raw === undefined || raw === '' ? fallback : raw
  );
}

const schema = z.object({
  s3_bucket: z.string(),
  s3_endpoint: z.string(),
  s3_use_path_style_endpoint: z.boolean(),
  gcs_bucket: z.string(),

  expire_times_seconds: z.array(z.number().int().nonnegative()).min(1),
  default_expire_seconds: z.number().int().positive(),
  max_expire_seconds: z.number().int().positive(),
  download_counts: z.array(z.number().int().nonnegative()).min(1),
  default_downloads: z.number().int().positive(),
  max_downloads: z.number().int().positive(),
  max_files_per_archive: z.number().int().positive(),
  max_archives_per_user: z.number().int().positive(),
  max_file_size: z.number().int().positive(),

  redis_host: z.string(),
  redis_port: z.number().int().min(1).max(65535),
  redis_user: z.string(),
  redis_password: z.string(),
  redis_db: z.string(),
  redis_retry_time: z.number().int().nonnegative(),
  redis_retry_delay: z.number().int().nonnegative(),

  listen_address: z.string().min(1),
  listen_port: z.number().int().min(1).max(65535),

  sentry_id: z.string(),
  sentry_dsn: z.string(),

  env: z.enum(['production', 'development', 'test']),
  l10n_dev: z.boolean(),
  base_url: z.string().url(),
  detect_base_url: z.boolean(),
  file_dir: z.string(),

  custom_title: z.string(),
  custom_description: z.string(),
  custom_locale: z.string(),

  fxa_url: z.string().url(),
  fxa_client_id: z.string(),
  fxa_key_scope: z.string(),
  // Was referenced by the upload and auth middleware but never declared in the
  // old convict schema, so it was always undefined and never enforced.
  fxa_required: z.boolean(),
  fxa_csp_oauth_url: z.string(),
  fxa_csp_content_url: z.string(),
  fxa_csp_profile_url: z.string(),
  fxa_csp_profileimage_url: z.string(),

  survey_url: z.string(),
  ip_db: z.string(),

  footer_donate_url: z.string(),
  footer_cli_url: z.string(),
  footer_dmca_url: z.string(),
  footer_source_url: z.string(),
  custom_footer_text: z.string(),
  custom_footer_url: z.string(),

  main_notice_html: z.string(),
  upload_area_notice_html: z.string(),
  uploads_list_notice_html: z.string(),
  download_notice_html: z.string(),
  show_thunderbird_sponsor: z.boolean(),

  ui_color_primary: z.string(),
  ui_color_accent: z.string(),

  ui_custom_assets: z.object({
    android_chrome_192px: z.string(),
    android_chrome_512px: z.string(),
    apple_touch_icon: z.string(),
    favicon_16px: z.string(),
    favicon_32px: z.string(),
    icon: z.string(),
    safari_pinned_tab: z.string(),
    facebook: z.string(),
    twitter: z.string(),
    wordmark: z.string(),
    custom_css: z.string()
  })
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  return schema.parse({
    s3_bucket: str('S3_BUCKET', ''),
    s3_endpoint: str('S3_ENDPOINT', ''),
    s3_use_path_style_endpoint: bool('S3_USE_PATH_STYLE_ENDPOINT', false),
    gcs_bucket: str('GCS_BUCKET', ''),

    expire_times_seconds: intList(
      'EXPIRE_TIMES_SECONDS',
      [300, 3600, 86400, 604800]
    ),
    default_expire_seconds: num('DEFAULT_EXPIRE_SECONDS', 86400),
    max_expire_seconds: num('MAX_EXPIRE_SECONDS', 86400 * 7),
    download_counts: intList('DOWNLOAD_COUNTS', [1, 2, 3, 4, 5, 20, 50, 100]),
    default_downloads: num('DEFAULT_DOWNLOADS', 1),
    max_downloads: num('MAX_DOWNLOADS', 100),
    max_files_per_archive: num('MAX_FILES_PER_ARCHIVE', 64),
    max_archives_per_user: num('MAX_ARCHIVES_PER_USER', 16),
    max_file_size: num('MAX_FILE_SIZE', 1024 * 1024 * 1024 * 2.5),

    redis_host: str('REDIS_HOST', 'localhost'),
    redis_port: num('REDIS_PORT', 6379),
    redis_user: str('REDIS_USER', ''),
    redis_password: str('REDIS_PASSWORD', ''),
    redis_db: str('REDIS_DB', ''),
    redis_retry_time: num('REDIS_RETRY_TIME', 10000),
    redis_retry_delay: num('REDIS_RETRY_DELAY', 500),

    listen_address: str('IP_ADDRESS', '0.0.0.0'),
    listen_port: num('PORT', 1443),

    sentry_id: str('SENTRY_CLIENT', ''),
    sentry_dsn: str('SENTRY_DSN', ''),

    env: str('NODE_ENV', 'development'),
    l10n_dev: bool('L10N_DEV', false),
    base_url: str('BASE_URL', 'https://send.example.com'),
    detect_base_url: bool('DETECT_BASE_URL', false),
    file_dir: str(
      'FILE_DIR',
      `${tmpdir()}${path.sep}send-${randomBytes(4).toString('hex')}`
    ),

    custom_title: str('CUSTOM_TITLE', 'Send'),
    custom_description: str(
      'CUSTOM_DESCRIPTION',
      'Encrypt and send files with a link that automatically expires to ensure your important documents don’t stay online forever.'
    ),
    custom_locale: str('CUSTOM_LOCALE', ''),

    fxa_url: str('FXA_URL', 'https://send-fxa.dev.lcip.org'),
    fxa_client_id: str('FXA_CLIENT_ID', ''), // empty disables accounts
    fxa_key_scope: str(
      'FXA_KEY_SCOPE',
      'https://identity.mozilla.com/apps/send'
    ),
    fxa_required: bool('FXA_REQUIRED', false),
    fxa_csp_oauth_url: str('FXA_CSP_OAUTH_URL', ''),
    fxa_csp_content_url: str('FXA_CSP_CONTENT_URL', ''),
    fxa_csp_profile_url: str('FXA_CSP_PROFILE_URL', ''),
    fxa_csp_profileimage_url: str('FXA_CSP_PROFILEIMAGE_URL', ''),

    survey_url: str('SURVEY_URL', ''),
    ip_db: str('IP_DB', ''),

    footer_donate_url: str('SEND_FOOTER_DONATE_URL', ''),
    footer_cli_url: str(
      'SEND_FOOTER_CLI_URL',
      'https://github.com/timvisee/ffsend'
    ),
    footer_dmca_url: str('SEND_FOOTER_DMCA_URL', ''),
    footer_source_url: str(
      'SEND_FOOTER_SOURCE_URL',
      'https://github.com/timvisee/send'
    ),
    custom_footer_text: str('CUSTOM_FOOTER_TEXT', ''),
    custom_footer_url: str('CUSTOM_FOOTER_URL', ''),

    main_notice_html: str('SEND_MAIN_NOTICE_HTML', ''),
    upload_area_notice_html: str('SEND_UPLOAD_AREA_NOTICE_HTML', ''),
    uploads_list_notice_html: str('SEND_UPLOADS_LIST_NOTICE_HTML', ''),
    download_notice_html: str('SEND_DOWNLOAD_NOTICE_HTML', ''),
    show_thunderbird_sponsor: bool('SHOW_THUNDERBIRD_SPONSOR', false),

    ui_color_primary: str('UI_COLOR_PRIMARY', '#0a84ff'),
    ui_color_accent: str('UI_COLOR_ACCENT', '#003eaa'),

    ui_custom_assets: {
      android_chrome_192px: str('UI_CUSTOM_ASSETS_ANDROID_CHROME_192PX', ''),
      android_chrome_512px: str('UI_CUSTOM_ASSETS_ANDROID_CHROME_512PX', ''),
      apple_touch_icon: str('UI_CUSTOM_ASSETS_APPLE_TOUCH_ICON', ''),
      favicon_16px: str('UI_CUSTOM_ASSETS_FAVICON_16PX', ''),
      favicon_32px: str('UI_CUSTOM_ASSETS_FAVICON_32PX', ''),
      icon: str('UI_CUSTOM_ASSETS_ICON', ''),
      safari_pinned_tab: str('UI_CUSTOM_ASSETS_SAFARI_PINNED_TAB', ''),
      facebook: str('UI_CUSTOM_ASSETS_FACEBOOK', ''),
      twitter: str('UI_CUSTOM_ASSETS_TWITTER', ''),
      wordmark: str('UI_CUSTOM_ASSETS_WORDMARK', ''),
      custom_css: str('UI_CUSTOM_CSS', '')
    }
  });
}

const config = loadConfig();

export default config;

export const IS_DEV = config.env === 'development';
export const IS_PRODUCTION = config.env === 'production';

/**
 * `detect_base_url` lets a single image serve several hostnames; the share
 * links it generates then follow whatever host the uploader used.
 */
export function deriveBaseUrl(req: Request): string {
  if (!config.detect_base_url) {
    return config.base_url;
  }
  const url = new URL(req.url);
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const protocol = `${forwardedProto || url.protocol.replace(':', '')}://`;
  const host = req.headers.get('host') || url.host;
  return `${protocol}${host}`;
}
