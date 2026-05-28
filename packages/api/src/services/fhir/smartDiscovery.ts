/**
 * smartDiscovery — fetch + KV-cache SMART configuration per FHIR base URL.
 *
 * Per EPIC_FHIR_REFERENCE.md §2: every Epic tenant publishes
 * `{base}/.well-known/smart-configuration` listing the auth + token endpoints,
 * supported scopes, and capabilities. We cache per `sha256(normalizedBaseUrl)`
 * for 24h to avoid hammering Epic on every request.
 *
 * Fallback: legacy Epic tenants without SMART discovery get
 * `{base}/oauth2/{authorize,token}` by convention.
 */
import { safeFetch } from '../../lib/safeFetch';
import type { Env } from '../../lib/env';

const KV_PREFIX = 'smart-config:';
const TTL_SECONDS = 86400; // 24h

export interface SmartConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  introspection_endpoint?: string;
  jwks_uri?: string;
  capabilities?: string[];
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Canonicalize a FHIR base URL for stable KV cache keys. */
function normalize(fhirBaseUrl: string): string {
  try {
    return new URL(fhirBaseUrl).toString();
  } catch {
    return fhirBaseUrl;
  }
}

export async function getSmartConfig(
  env: Env,
  fhirBaseUrl: string,
): Promise<SmartConfig> {
  const base = normalize(fhirBaseUrl);
  const key = `${KV_PREFIX}${await sha256Hex(base)}`;
  const cached = await env.KV.get<SmartConfig>(key, 'json');
  if (cached) return cached;

  const discoveryUrl = `${base.replace(/\/$/, '')}/.well-known/smart-configuration`;
  const res = await safeFetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
  });

  let config: SmartConfig;
  if (res.ok) {
    config = (await res.json()) as SmartConfig;
  } else {
    // Legacy Epic fallback — derive endpoints from base URL convention.
    console.warn(
      `[smart-discovery] ${discoveryUrl} returned ${res.status}, falling back to convention`,
    );
    config = {
      authorization_endpoint: `${base.replace(/\/$/, '')}/oauth2/authorize`,
      token_endpoint: `${base.replace(/\/$/, '')}/oauth2/token`,
    };
  }
  await env.KV.put(key, JSON.stringify(config), { expirationTtl: TTL_SECONDS });
  return config;
}

/** Invalidate the cached SMART config — call after editing a connection. */
export async function invalidateSmartConfig(
  env: Env,
  fhirBaseUrl: string,
): Promise<void> {
  const key = `${KV_PREFIX}${await sha256Hex(normalize(fhirBaseUrl))}`;
  await env.KV.delete(key);
}
