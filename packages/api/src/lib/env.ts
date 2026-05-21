// Type definitions for Cloudflare Worker bindings
export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  EVENTS_QUEUE: Queue;
  CHAT_ROOM: DurableObjectNamespace;
  AI: Ai;
  /**
   * Cloudflare Browser Rendering binding. Used by pdfService for HTML→PDF.
   * Optional — when absent, pdfService falls back to pdf-lib-only output.
   */
  BROWSER?: Fetcher;

  // Secrets (set via wrangler secret put)
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_WEBHOOK_SECRET?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ENCRYPTION_KEY: string;
  EPIC_CLIENT_ID?: string;
  EPIC_CLIENT_SECRET?: string;
  EPIC_FHIR_BASE_URL?: string;
  /**
   * Cloudflare Turnstile secret key for bot-protection on auth endpoints.
   * If unset, the turnstile middleware silently no-ops (useful for local dev).
   * Set via: `wrangler secret put TURNSTILE_SECRET_KEY`
   */
  TURNSTILE_SECRET_KEY?: string;
  /** R2 S3-compatible API credentials for presigned URLs. Optional — without them, /utility/presigned-url returns 503. */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;

  // ── At-home APIs parity (0004 migration) ────────────────────────────────
  /** 32-byte URL-safe-base64 Fernet key for application-layer payload encryption. */
  FERNET_KEY?: string;
  /** Shared secret for external fulfillment vendor HMAC webhook auth. */
  EXTERNAL_FULFILLMENT_HMAC_SECRET?: string;
  /** Optional API key sent in `X-API-Key` header when polling the external kit-letter catalog. */
  KIT_LETTERS_API_KEY?: string;
  /** URL of the external kit-letter catalog endpoint (returns JSON array). */
  KIT_LETTERS_URL?: string;
  /** Comma-separated hostnames whose outbound calls are short-circuited in non-prod. */
  DISABLE_OUTBOUND_HOSTS?: string;

  // Vars
  ENVIRONMENT: string;
  FRONTEND_URL: string;
  SENTRY_DSN?: string;
}
