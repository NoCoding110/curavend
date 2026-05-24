import { MiddlewareHandler } from 'hono';
import * as jose from 'jose';
import type { Env } from '../lib/env';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  userType: string;
  providerId?: string;
  hospitalId?: string;
  vendorId?: string;
  superVendorId?: string;
  labGroupId?: string;
  hasAgreedToPHIAccess?: number;
}

// Public routes that do not require authentication
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/refresh',
  '/api/auth/mfa/verify',
  '/api/auth/mfa/init-setup',
  '/api/auth/select-membership',
  '/api/auth/unlock-account',
  '/api/auth/email-otp/send',
  '/api/auth/email-otp/verify',
  '/api/health',
  '/api/docs',
  '/api/openapi.json',
];

const PUBLIC_PREFIXES = [
  '/api/external/fulfillment/', // HMAC-protected webhooks
];

/** Patterns that bypass auth — used for paths with dynamic segments. */
const PUBLIC_PATTERNS: RegExp[] = [
  // EHR ingest webhooks: /api/ehr/:connectionId/ingest — HMAC-protected per-connection
  /^\/api\/ehr\/[A-Za-z0-9-]+\/ingest$/,
];

export const authMiddleware = (): MiddlewareHandler<{
  Bindings: Env;
  Variables: { user: AuthUser };
}> => {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip auth for public routes
    if (
      PUBLIC_PATHS.some((p) => path === p || path.startsWith('/cds-services')) ||
      PUBLIC_PREFIXES.some((p) => path.startsWith(p)) ||
      PUBLIC_PATTERNS.some((re) => re.test(path))
    ) {
      await next();
      return;
    }

    // For WebSocket upgrade requests, accept token from query string
    const isWsUpgrade = c.req.header('upgrade')?.toLowerCase() === 'websocket';
    let token: string;
    if (isWsUpgrade) {
      const url = new URL(c.req.url);
      const queryToken = url.searchParams.get('token');
      if (!queryToken) {
        return c.json({ error: 'Missing token', code: 'UNAUTHORIZED' }, 401);
      }
      token = queryToken;
    } else {
      const authHeader = c.req.header('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Missing authorization header', code: 'UNAUTHORIZED' }, 401);
      }
      token = authHeader.slice(7);
    }

    try {
      const secret = new TextEncoder().encode(c.env.JWT_SECRET);
      const { payload } = await jose.jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });

      if (!payload.sub || !payload.email || !payload.role || !payload.userType) {
        return c.json({ error: 'Malformed token payload', code: 'UNAUTHORIZED' }, 401);
      }

      c.set('user', {
        id: payload.sub as string,
        email: payload.email as string,
        role: payload.role as string,
        userType: payload.userType as string,
        providerId: payload.providerId as string | undefined,
        hospitalId: payload.hospitalId as string | undefined,
        vendorId: payload.vendorId as string | undefined,
        superVendorId: payload.superVendorId as string | undefined,
        labGroupId: payload.labGroupId as string | undefined,
        hasAgreedToPHIAccess: payload.hasAgreedToPHIAccess as number | undefined,
      });

      await next();
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        return c.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, 401);
      }
      return c.json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401);
    }
  };
};
