import type { MiddlewareHandler } from 'hono';
import type { Env } from '../lib/env';

/**
 * Cloudflare Turnstile bot-protection middleware.
 *
 * Verifies a token issued by the Turnstile widget on the frontend before
 * allowing the request to proceed. Mirrors reCAPTCHA semantics; uses
 * Cloudflare's siteverify endpoint at:
 *   https://challenges.cloudflare.com/turnstile/v0/siteverify
 *
 * Token MUST be sent as the `cf-turnstile-token` request header. Sending it
 * in the body would force this middleware to consume the body, breaking
 * downstream `c.req.json()` calls in route handlers — so a header is used.
 *
 * Behavior:
 *   - If `TURNSTILE_SECRET_KEY` is not set on the env, the middleware
 *     silently no-ops (so local dev without a Turnstile site still works).
 *   - If `ENVIRONMENT === 'development'`, also bypasses (explicit dev opt-out).
 *   - Otherwise, missing token → 400; failed siteverify → 401.
 *
 * Usage:
 *   authRoutes.post('/login', turnstile(), rateLimit(...), handler)
 */

interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export interface TurnstileOptions {
  /** Skip enforcement when ENVIRONMENT === 'development'. Default: true. */
  bypassInDev?: boolean;
}

export const turnstile = (
  opts: TurnstileOptions = {},
): MiddlewareHandler<{ Bindings: Env }> => {
  const bypassInDev = opts.bypassInDev ?? true;

  return async (c, next) => {
    const env = c.env as Env & { TURNSTILE_SECRET_KEY?: string };
    const secret = env.TURNSTILE_SECRET_KEY;

    // No secret configured → silently skip (local-dev convenience)
    if (!secret) {
      await next();
      return;
    }

    // Optional explicit dev bypass
    if (bypassInDev && env.ENVIRONMENT === 'development') {
      await next();
      return;
    }

    // CI / integration-test bypass ─────────────────────────────────────────
    // Only active when TURNSTILE_SKIP_SECRET is configured in the worker env
    // (set it in preview/staging, NEVER in production). The caller must present
    // the matching value in the `x-turnstile-skip` request header.
    // Using Cloudflare's public test-mode keys is an equivalent alternative.
    const skipSecret = (env as any).TURNSTILE_SKIP_SECRET as string | undefined;
    if (skipSecret) {
      const skipHeader = c.req.header('x-turnstile-skip') || '';
      if (skipHeader && skipHeader === skipSecret) {
        await next();
        return;
      }
    }

    const token = c.req.header('cf-turnstile-token') || '';
    if (!token) {
      return c.json(
        { error: 'Bot-protection token missing. Refresh and try again.', code: 'TURNSTILE_MISSING' },
        400,
      );
    }

    const form = new URLSearchParams();
    form.append('secret', secret);
    form.append('response', token);

    let result: SiteVerifyResponse;
    try {
      const resp = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        },
      );
      result = (await resp.json()) as SiteVerifyResponse;
    } catch (err) {
      // Don't fail-open on siteverify errors — refusing is the safer default
      console.error('[turnstile] siteverify request failed:', err);
      return c.json(
        { error: 'Bot-protection check failed. Try again.', code: 'TURNSTILE_VERIFY_FAILED' },
        401,
      );
    }

    if (!result.success) {
      console.warn('[turnstile] verification rejected — error-codes:', JSON.stringify(result['error-codes']), '| hostname:', result.hostname, '| action:', result.action);
      return c.json(
        { error: 'Bot-protection check failed. Refresh and try again.', code: 'TURNSTILE_REJECTED', errorCodes: result['error-codes'] },
        401,
      );
    }

    await next();
  };
};
