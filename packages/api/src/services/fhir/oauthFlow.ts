/**
 * oauthFlow — PKCE-based SMART OAuth helpers for Epic standalone + EHR launch.
 *
 * State token: signed JWT carrying `{ connId, userId?, launchToken?, iss?, nonce, exp }`.
 * The `code_verifier` is stored separately in KV under `pkce:{nonce}` (TTL 10 min).
 *
 * Why split: state goes through the user's browser unencrypted; the verifier
 * never does. The verifier is one-shot (popped on first use).
 */
import * as jose from 'jose';
import type { Env } from '../../lib/env';

const PKCE_KV_PREFIX = 'pkce:';
const PKCE_TTL_SECONDS = 600; // 10 min — covers user clicking through Epic's auth screen

export interface LaunchState {
  /** EhrConnection.id */
  connId: string;
  /** User who initiated the flow (standalone). Undefined for EHR Launch where the user identity comes from Epic's `fhirUser` claim. */
  userId?: string;
  /** Epic's opaque launch parameter (EHR Launch only). */
  launchToken?: string;
  /** Issuer (FHIR base URL) — populated for EHR Launch. */
  iss?: string;
  /** Single-use anti-replay nonce; also the KV key for the PKCE verifier. */
  nonce: string;
}

/** Base64URL-encode bytes (no padding). */
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Generate a PKCE pair: `code_verifier` (43-char URL-safe random) + S256 `code_challenge`. */
export async function makePkce(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = b64url(bytes);
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  const challenge = b64url(new Uint8Array(hash));
  return { verifier, challenge };
}

/** Sign a state token (HS256 with `JWT_SECRET`). */
export async function signState(
  env: Env,
  state: LaunchState,
  ttlSeconds = 600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  // Build payload explicitly to avoid colliding with reserved JWT claims like `iss`.
  const payload: Record<string, unknown> = {
    connId: state.connId,
    nonce: state.nonce,
  };
  if (state.userId) payload.userId = state.userId;
  if (state.launchToken) payload.launchToken = state.launchToken;
  if (state.iss) payload.fhirIss = state.iss; // renamed to avoid JWT reserved `iss`
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('curavend-fhir')
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

/** Verify a state token. Returns null on invalid/expired. */
export async function verifyState(
  env: Env,
  token: string,
): Promise<LaunchState | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'curavend-fhir',
    });
    return {
      connId: payload.connId as string,
      userId: payload.userId as string | undefined,
      launchToken: payload.launchToken as string | undefined,
      iss: payload.fhirIss as string | undefined,
      nonce: payload.nonce as string,
    };
  } catch {
    return null;
  }
}

/** Stash a PKCE `code_verifier` under its `nonce`. TTL = 10 min. */
export async function stashVerifier(
  env: Env,
  nonce: string,
  verifier: string,
): Promise<void> {
  await env.KV.put(`${PKCE_KV_PREFIX}${nonce}`, verifier, {
    expirationTtl: PKCE_TTL_SECONDS,
  });
}

/** Pop (read + delete) the verifier. One-shot semantics. */
export async function popVerifier(
  env: Env,
  nonce: string,
): Promise<string | null> {
  const v = await env.KV.get(`${PKCE_KV_PREFIX}${nonce}`);
  if (v) await env.KV.delete(`${PKCE_KV_PREFIX}${nonce}`);
  return v;
}
