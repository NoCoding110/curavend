/**
 * Backend Services JWT — per-connection RSA-2048 keypair + client_assertion JWT
 * + cached bearer token for headless FHIR access (no user session).
 *
 * Used by Phase 2 writebacks (DocumentReference.create, Procedure.create) and
 * the nightly Practitioner directory sync — anything that needs to call Epic
 * without a clinician logged in.
 *
 * Storage layout (Cloudflare KV):
 *   epic:jwks:{connId}:private    Fernet-encrypted PKCS8 PEM of the RSA private key
 *   epic:jwks:{connId}:public     plaintext JWK (n, e, kty, alg, use, kid) — published in /.well-known/jwks.json
 *   epic:bsv-token:{connId}:{scopeHash}   cached bearer token, TTL = expires_in - 60s
 *
 * The customer registers `https://curavend-api.metabilityllc1.workers.dev/.well-known/jwks.json`
 * once on their Epic app config. We rotate keys per-connection by reissuing kid + bumping the
 * connection's `mappingProfile.jwksKid` — old key stays in KV for grace window, then gets purged.
 *
 * Required Worker secret: `FERNET_KEY` (32-byte URL-safe-base64).
 */
import * as jose from 'jose';
import { encrypt as fernetEncrypt, decrypt as fernetDecrypt } from '../fernetCipher';
import { getSmartConfig } from './smartDiscovery';
import { AppError } from '../../lib/errors';
import { safeFetch } from '../../lib/safeFetch';
import type { Env } from '../../lib/env';
import type { EhrConnection } from '../ehrAdapter';

const PRIVATE_KV_PREFIX = 'epic:jwks:';
const TOKEN_KV_PREFIX = 'epic:bsv-token:';
const TOKEN_REFRESH_BUFFER_S = 60;

/** Public JWK shape (subset of RFC 7517) — what we publish at /.well-known/jwks.json. */
export interface PublicJwk {
  kty: 'RSA';
  alg: 'RS384';
  use: 'sig';
  kid: string;
  n: string;
  e: string;
}

interface CachedBearer {
  token: string;
  expires_at: number; // ms epoch
  scope: string;
}

function privateKeyKey(connId: string): string {
  return `${PRIVATE_KV_PREFIX}${connId}:private`;
}
function publicJwkKey(connId: string): string {
  return `${PRIVATE_KV_PREFIX}${connId}:public`;
}
async function scopeHash(scope: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Require FERNET_KEY for at-rest encryption of the private key. */
function requireFernetKey(env: Env): string {
  if (!env.FERNET_KEY) {
    throw new AppError(
      500,
      'FERNET_KEY Worker secret not set — required for Backend Services keypair encryption',
      'BACKEND_SERVICES_NOT_CONFIGURED',
    );
  }
  return env.FERNET_KEY;
}

/**
 * Generate (or retrieve) the per-connection RSA-2048 keypair.
 *
 * On first call for a connection, generates RS384-compatible keypair via
 * Web Crypto, exports private as PKCS8 PEM, Fernet-encrypts with `env.FERNET_KEY`,
 * and stashes both the encrypted private and the public JWK in KV.
 *
 * Subsequent calls return the stored pair. Idempotent.
 */
export async function getOrMintConnectionKeypair(
  env: Env,
  connId: string,
): Promise<{ kid: string; publicJwk: PublicJwk; privateKey: jose.KeyLike }> {
  const fernetKey = requireFernetKey(env);

  // Try cached public JWK first — fast path.
  const cachedPublic = await env.KV.get<PublicJwk>(publicJwkKey(connId), 'json');
  const cachedPrivateToken = await env.KV.get(privateKeyKey(connId));

  if (cachedPublic && cachedPrivateToken) {
    const privatePemBytes = await fernetDecrypt(cachedPrivateToken, fernetKey);
    const privatePem = new TextDecoder().decode(privatePemBytes);
    const privateKey = await jose.importPKCS8(privatePem, 'RS384', { extractable: true });
    return { kid: cachedPublic.kid, publicJwk: cachedPublic, privateKey };
  }

  // First time for this connection — mint a fresh keypair via jose (uses
  // Web Crypto under the hood but with clean key handles).
  const { publicKey, privateKey } = await jose.generateKeyPair('RS384', {
    modulusLength: 2048,
    extractable: true,
  });

  // Export public as JWK (n + e go into the JWKS we publish).
  const publicJwkRaw = await jose.exportJWK(publicKey);
  const kid = connId;
  const publicJwk: PublicJwk = {
    kty: 'RSA',
    alg: 'RS384',
    use: 'sig',
    kid,
    n: publicJwkRaw.n!,
    e: publicJwkRaw.e!,
  };

  // Export private as PKCS8 PEM, Fernet-encrypt for KV storage.
  const privatePem = await jose.exportPKCS8(privateKey);
  const privateToken = await fernetEncrypt(privatePem, fernetKey);

  await Promise.all([
    env.KV.put(publicJwkKey(connId), JSON.stringify(publicJwk)),
    env.KV.put(privateKeyKey(connId), privateToken),
  ]);

  return { kid, publicJwk, privateKey };
}

/**
 * Mint a signed client_assertion JWT for the given connection.
 *
 * Claims (per SMART Backend Services spec):
 *   iss = sub = client_id
 *   aud = token_endpoint (from SMART discovery)
 *   jti = uuid (single-use)
 *   exp = now + 4 min (Epic accepts up to 5 min)
 *   iat = now
 *
 * Header has `alg: RS384`, `kid: <connId>` — Epic uses kid to find the matching
 * JWK in our published JWKS.
 */
export async function mintClientAssertion(
  env: Env,
  conn: EhrConnection,
): Promise<string> {
  if (!conn.fhirBaseUrl || !conn.authClientId) {
    throw new AppError(500, 'Connection missing fhirBaseUrl or authClientId', 'FHIR_CONFIG');
  }
  const { kid, privateKey } = await getOrMintConnectionKeypair(env, conn.id);
  const smart = await getSmartConfig(env, conn.fhirBaseUrl);
  const now = Math.floor(Date.now() / 1000);
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS384', kid })
    .setIssuer(conn.authClientId)
    .setSubject(conn.authClientId)
    .setAudience(smart.token_endpoint)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 240) // 4 min
    .sign(privateKey);
}

/**
 * Get a Backend Services bearer token for the given scope set.
 *
 * Cached in KV under `epic:bsv-token:{connId}:{sha256(scope)[:16]}` so subsequent
 * calls within the token's lifetime reuse it. Refreshes within
 * REFRESH_BUFFER_S of expiry.
 */
export async function getBackendAccessToken(
  env: Env,
  conn: EhrConnection,
  scope: string,
): Promise<string> {
  const hash = await scopeHash(scope);
  const cacheKey = `${TOKEN_KV_PREFIX}${conn.id}:${hash}`;
  const cached = await env.KV.get<CachedBearer>(cacheKey, 'json');
  if (cached && cached.expires_at - Date.now() > TOKEN_REFRESH_BUFFER_S * 1000) {
    return cached.token;
  }

  if (!conn.fhirBaseUrl) {
    throw new AppError(500, 'Connection missing fhirBaseUrl', 'FHIR_CONFIG');
  }
  const smart = await getSmartConfig(env, conn.fhirBaseUrl);
  const assertion = await mintClientAssertion(env, conn);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
    scope,
  });

  const res = await safeFetch(smart.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new AppError(
      502,
      `Backend Services token exchange failed (${res.status}): ${detail.slice(0, 300)}`,
      'BACKEND_SERVICES_TOKEN_FAILED',
    );
  }
  const r = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  const expires_at = Date.now() + r.expires_in * 1000;
  const cacheValue: CachedBearer = { token: r.access_token, expires_at, scope: r.scope ?? scope };
  // Cache for slightly less than the token's lifetime.
  const ttl = Math.max(60, r.expires_in - TOKEN_REFRESH_BUFFER_S);
  await env.KV.put(cacheKey, JSON.stringify(cacheValue), { expirationTtl: ttl });
  return r.access_token;
}

/**
 * List all active connections' public JWKs — what /.well-known/jwks.json publishes.
 * Lazy: only includes connections that have completed a backend-services mint.
 * (Unminted connections never appear because we only insert public JWK on first mint.)
 */
export async function listPublicJwks(env: Env, connIds: string[]): Promise<PublicJwk[]> {
  const out: PublicJwk[] = [];
  for (const connId of connIds) {
    const jwk = await env.KV.get<PublicJwk>(publicJwkKey(connId), 'json');
    if (jwk) out.push(jwk);
  }
  return out;
}
