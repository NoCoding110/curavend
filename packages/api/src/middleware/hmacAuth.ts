/**
 * hmacAuth — middleware factory for HMAC-signed inbound webhooks.
 *
 * Verifies `hex(hmac-sha256(timestamp + "." + rawBody, secret)) == header`.
 * Blocks replays older than `toleranceSec` seconds (default 300 = 5 min).
 *
 * Required request headers (defaults overridable):
 *   X-Webhook-Signature   — hex(hmac-sha256(...))
 *   X-Webhook-Timestamp   — unix seconds (string)
 *
 * The middleware *consumes* the body via `c.req.text()` and re-injects it
 * into the context as a Variable `rawBody` so downstream handlers can
 * parse it without double-reading the stream.
 *
 * Inspired by Medzah's `LcvHmacAuthHandler` plus Stripe's webhook pattern.
 */
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../lib/env';

export interface HmacAuthOptions {
  /** Env var name holding the shared secret. */
  secretEnv: keyof Env;
  /** Header carrying the hex HMAC. Default: `X-Webhook-Signature`. */
  signatureHeader?: string;
  /** Header carrying the unix-seconds timestamp. Default: `X-Webhook-Timestamp`. */
  timestampHeader?: string;
  /** Replay window in seconds. Default: 300 (5 min). */
  toleranceSec?: number;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('invalid hex');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function fixedTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function hmacAuth(
  options: HmacAuthOptions,
): MiddlewareHandler<{ Bindings: Env; Variables: { rawBody: string } }> {
  const sigHeader = options.signatureHeader ?? 'X-Webhook-Signature';
  const tsHeader = options.timestampHeader ?? 'X-Webhook-Timestamp';
  const tolerance = options.toleranceSec ?? 300;

  return async (c, next) => {
    const secret = (c.env as any)[options.secretEnv] as string | undefined;
    if (!secret) {
      console.warn(`[hmacAuth] secret env ${String(options.secretEnv)} not configured`);
      return c.json({ error: 'webhook auth not configured', code: 'HMAC_NOT_CONFIGURED' }, 503);
    }
    const signature = c.req.header(sigHeader);
    const timestamp = c.req.header(tsHeader);
    if (!signature || !timestamp) {
      return c.json({ error: 'missing webhook signature headers', code: 'UNAUTHORIZED' }, 401);
    }

    // Replay protection — reject if timestamp is too old or in the future
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return c.json({ error: 'invalid timestamp', code: 'UNAUTHORIZED' }, 401);
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > tolerance) {
      return c.json({ error: 'timestamp outside replay window', code: 'UNAUTHORIZED' }, 401);
    }

    // Read body once; cache for handler reuse
    const rawBody = await c.req.text();

    // Compute expected signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signedBuf = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    );
    const expected = new Uint8Array(signedBuf);

    let given: Uint8Array;
    try {
      given = hexToBytes(signature);
    } catch {
      return c.json({ error: 'invalid signature format', code: 'UNAUTHORIZED' }, 401);
    }
    if (!fixedTimeEquals(expected, given)) {
      return c.json({ error: 'invalid signature', code: 'UNAUTHORIZED' }, 401);
    }

    // Stash raw body so the handler can JSON.parse without re-reading the stream
    c.set('rawBody', rawBody);
    await next();
  };
}

/**
 * Helper for test/admin tools: compute the signature that would be expected
 * for a given body + timestamp + secret.
 */
export async function signHmacWebhook(
  secret: string,
  body: string,
  timestamp?: number,
): Promise<{ signature: string; timestamp: number }> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`)),
  );
  let hex = '';
  for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, '0');
  return { signature: hex, timestamp: ts };
}
