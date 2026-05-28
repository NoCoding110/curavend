/**
 * tokenStore — per-(connection, user) Epic OAuth access/refresh token cache in KV.
 *
 * Storage key: `epic:token:{connectionId}:{userId}`
 *
 * Auto-refresh: if access_token expires within REFRESH_BUFFER_MS, attempts a
 * refresh using the stored refresh_token. Returns null if no token stored OR
 * refresh fails — caller should redirect to the launch / authorize flow.
 *
 * Race note: KV is eventually consistent. Two concurrent refresh attempts
 * can both succeed and clobber each other; Epic invalidates the older
 * refresh_token, which we re-fetch on the next 401. Documented as a known
 * trade-off per EPIC_PHASE_1_2_PLAN.md §1.A.
 */
import type { Env } from '../../lib/env';
import type { EhrConnection } from '../ehrAdapter';
import { resolveSecret } from '../connectionRegistry';
import { safeFetch } from '../../lib/safeFetch';

const KV_PREFIX = 'epic:token:';
const REFRESH_BUFFER_MS = 60_000;

export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  /** ms epoch */
  expires_at: number;
  scope: string;
  /** SMART context: launch patient */
  patient?: string;
  /** SMART context: launch encounter */
  encounter?: string;
  /** SMART context: launch user (FHIR Practitioner reference) */
  fhirUser?: string;
  /** ms epoch when this token was first persisted */
  stored_at: number;
}

function key(connId: string, userId: string): string {
  return `${KV_PREFIX}${connId}:${userId}`;
}

export async function putToken(
  env: Env,
  connId: string,
  userId: string,
  token: StoredToken,
): Promise<void> {
  // KV expirationTtl keeps the row alive ~1h past the access token's natural
  // death so the refresh_token survives long enough to be useful.
  const ttl = Math.max(
    60,
    Math.floor((token.expires_at - Date.now()) / 1000) + 3600,
  );
  await env.KV.put(key(connId, userId), JSON.stringify(token), {
    expirationTtl: ttl,
  });
}

export async function getToken(
  env: Env,
  connId: string,
  userId: string,
): Promise<StoredToken | null> {
  const raw = await env.KV.get(key(connId, userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

export async function deleteToken(
  env: Env,
  connId: string,
  userId: string,
): Promise<void> {
  await env.KV.delete(key(connId, userId));
}

/**
 * Returns a valid access token, refreshing if it's within REFRESH_BUFFER_MS of
 * expiry. Returns null if no token stored or refresh fails (caller should
 * trigger a fresh launch).
 */
export async function getValidAccessToken(
  env: Env,
  conn: EhrConnection,
  userId: string,
  tokenEndpoint: string,
): Promise<string | null> {
  const tok = await getToken(env, conn.id, userId);
  if (!tok) return null;

  // Still fresh.
  if (tok.expires_at - Date.now() > REFRESH_BUFFER_MS) {
    return tok.access_token;
  }

  // Need to refresh.
  if (!tok.refresh_token) return null;

  const clientSecret = resolveSecret(env, conn.authSecretEnvRef);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tok.refresh_token,
    client_id: conn.authClientId ?? '',
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await safeFetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    console.warn(
      `[epic] refresh failed for conn=${conn.id} user=${userId} status=${res.status}`,
    );
    return null;
  }
  const r = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    patient?: string;
    encounter?: string;
  };
  const updated: StoredToken = {
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? tok.refresh_token,
    expires_at: Date.now() + r.expires_in * 1000,
    scope: r.scope ?? tok.scope,
    patient: r.patient ?? tok.patient,
    encounter: r.encounter ?? tok.encounter,
    fhirUser: tok.fhirUser,
    stored_at: Date.now(),
  };
  await putToken(env, conn.id, userId, updated);
  return updated.access_token;
}
