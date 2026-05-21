/**
 * serviceAuthCache — KV-backed cache for service-to-service JWTs.
 *
 * Use when the Worker needs to call out to a peer service that requires
 * its own JWT (e.g. external lab integration). The token is cached and
 * refreshed 60 s before expiry.
 *
 * Matches the spirit of Medzah's `AuthTokenHelper` but uses KV instead of
 * in-process state (Workers don't survive across requests).
 */
import * as jose from 'jose';
import type { Env } from '../lib/env';

interface CachedToken {
  token: string;
  expiresAt: number; // ms epoch
}

const KV_PREFIX = 'service-auth:';
const REFRESH_BUFFER_MS = 60_000; // refresh 60s before expiry

/**
 * Generate a service-account JWT for inter-service calls. Caches in KV.
 * Refreshes within `REFRESH_BUFFER_MS` of expiry.
 */
export async function getServiceToken(
  env: Env,
  scope: string,
  options: {
    ttlSeconds?: number;
    audience?: string;
    subject?: string;
  } = {},
): Promise<string> {
  const cacheKey = `${KV_PREFIX}${scope}`;
  const cached = await env.KV.get<CachedToken>(cacheKey, 'json');
  if (cached && cached.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return cached.token;
  }
  const ttl = options.ttlSeconds ?? 900; // 15 min
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const token = await new jose.SignJWT({ scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('curavend-internal')
    .setSubject(options.subject ?? 'service-account')
    .setAudience(options.audience ?? 'curavend-internal')
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(secret);
  await env.KV.put(
    cacheKey,
    JSON.stringify({ token, expiresAt: (now + ttl) * 1000 } satisfies CachedToken),
    { expirationTtl: ttl },
  );
  return token;
}

export async function invalidateServiceToken(env: Env, scope: string): Promise<void> {
  await env.KV.delete(`${KV_PREFIX}${scope}`);
}
