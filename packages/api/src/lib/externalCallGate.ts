/**
 * externalCallGate — dev-only outbound HTTP firewall.
 *
 * Wraps `fetch()`; in non-production environments where the env var
 * `DISABLE_OUTBOUND_HOSTS` is set (comma-separated hostname list), any
 * request whose URL hostname matches is short-circuited with a synthetic
 * 204 response. In production it's a no-op.
 *
 * Inspired by Medzah's `ExternalCallGate` which has the same "block
 * outbound calls in local dev" intent.
 */
import type { Env } from './env';

export interface GuardedFetchResult {
  response: Response;
  gated: boolean;
}

function getDisabledHosts(env: Env): Set<string> {
  if ((env.ENVIRONMENT ?? 'production') === 'production') return new Set();
  const raw = (env as any).DISABLE_OUTBOUND_HOSTS as string | undefined;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isGated(env: Env, url: string): boolean {
  const hosts = getDisabledHosts(env);
  if (hosts.size === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.has(host);
  } catch {
    return false;
  }
}

/**
 * Replacement for `fetch()` that respects the dev-only gate.
 * Returns `{response, gated}` so callers can branch on whether a real
 * network call was made.
 */
export async function guardedFetch(
  env: Env,
  input: string | URL,
  init?: RequestInit,
): Promise<GuardedFetchResult> {
  const urlStr = typeof input === 'string' ? input : input.toString();
  if (isGated(env, urlStr)) {
    console.log(`[externalCallGate] blocked outbound call to ${urlStr}`);
    return {
      response: new Response(null, {
        status: 204,
        headers: { 'X-External-Call-Gated': '1' },
      }),
      gated: true,
    };
  }
  const response = await fetch(urlStr, init);
  return { response, gated: false };
}
