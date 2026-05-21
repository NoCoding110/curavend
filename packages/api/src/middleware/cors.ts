import { cors } from 'hono/cors';

export const corsMiddleware = (frontendUrl: string) =>
  cors({
    origin: (origin) => {
      // Always allow the configured production URL and local dev
      const allowed = [
        frontendUrl,
        'http://localhost:3000',
        'http://localhost:5173',
      ];
      if (!origin) return frontendUrl;
      if (allowed.includes(origin)) return origin;
      // Allow any Cloudflare Pages preview deployment for this project
      if (origin.endsWith('.curavend-web.pages.dev')) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'cf-turnstile-token',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'X-Webhook-Signature',
      'X-Webhook-Timestamp',
    ],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: true,
  });
