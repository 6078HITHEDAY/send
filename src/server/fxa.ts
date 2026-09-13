import config from './config';

const KEY_SCOPE = config.fxa_key_scope;
const CONFIG_TTL_MS = 1000 * 60 * 5;
const CONFIG_TIMEOUT_MS = 3000;

export interface FxaConfig {
  jwks_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  revocation_endpoint: string;
  key_scope: string;
}

let fxaConfig: FxaConfig | null = null;
let lastConfigRefresh = 0;

export async function getFxaConfig(): Promise<FxaConfig | null> {
  if (fxaConfig && Date.now() - lastConfigRefresh < CONFIG_TTL_MS) {
    return fxaConfig;
  }
  try {
    const res = await fetch(
      `${config.fxa_url}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS) }
    );
    const loaded = (await res.json()) as FxaConfig;
    loaded.key_scope = KEY_SCOPE;
    fxaConfig = loaded;
    lastConfigRefresh = Date.now();
  } catch {
    // continue with the previously fetched config
  }
  return fxaConfig;
}

/**
 * @returns the FxA uid when the token grants Send's scoped key, else null.
 */
export async function verify(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) {
    return null;
  }

  const c = await getFxaConfig();
  if (!c) {
    return null;
  }
  try {
    const verifyUrl = c.jwks_uri.replace('jwks', 'verify'); // HACK
    const result = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const info = (await result.json()) as {
      scope?: string[];
      user?: string;
    };
    if (
      info.scope &&
      Array.isArray(info.scope) &&
      info.scope.includes(KEY_SCOPE)
    ) {
      return info.user ?? null;
    }
  } catch {
    // treat any failure as "not authenticated"
  }
  return null;
}
