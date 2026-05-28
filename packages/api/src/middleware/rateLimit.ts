import type { MiddlewareHandler } from 'hono';
import type { Env } from '../lib/env';

/**
 * KV-backed sliding-window rate limiter.
 *
 * Stores a counter per `{prefix}:{key}` in Cloudflare KV with a TTL equal to
 * the window.  Each request increments the counter; once it exceeds `limit`
 * the request is rejected with 429.
 *
 * Usage:
 *   authRoutes.post('/login', rateLimit({ limit: 10, windowSeconds: 60, keyFn: ip }), handler)
 */
export interface RateLimitOptions {
  /** Max requests allowed within the window. Default: 10 */
  limit?: number;
  /** Window length in seconds. Default: 60 */
  windowSeconds?: number;
  /** Derive the bucket key from the request context. Defaults to IP address. */
  keyFn?: (c: any) => string;
  /** KV key prefix, used to namespace buckets between routes. Default: 'rl' */
  prefix?: string;
}

function getIp(c: any): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export const rateLimit = (opts: RateLimitOptions = {}): MiddlewareHandler<{ Bindings: Env }> => {
  const limit = opts.limit ?? 10;
  const windowSeconds = opts.windowSeconds ?? 60;
  const keyFn = opts.keyFn ?? getIp;
  const prefix = opts.prefix ?? 'rl';

  return async (c, next) => {
    const kv: KVNamespace = (c.env as any).KV;
    if (!kv) {
      // KV not bound — skip silently in dev
      await next();
      return;
    }

    const bucketKey = `${prefix}:${keyFn(c)}`;

    // Increment atomically-ish via KV read-modify-write (best-effort; KV is
    // eventually consistent but sufficient for brute-force protection)
    const raw = await kv.get(bucketKey);
    const count = raw ? parseInt(raw, 10) + 1 : 1;

    if (count > limit) {
      return c.json(
        { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
        429,
      );
    }

    // Always (re)set the TTL on write. A KV put without expirationTtl clears
    // any prior TTL, which would make the bucket permanent and lock the IP out
    // forever. Re-setting each time gives a sliding window from the last
    // request — correct and safe for brute-force protection.
    await kv.put(bucketKey, String(count), { expirationTtl: windowSeconds });

    await next();
  };
};
