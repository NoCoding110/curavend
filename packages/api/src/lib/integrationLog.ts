/**
 * Outbound integration call logger + retry framework.
 *
 * Wrap every third-party HTTP call (Stripe, Resend, Fishbowl, Avalara, …)
 * with `integrationLog.wrap()`. The wrapper:
 *   1. Inserts a PENDING row with the request payload.
 *   2. Invokes the call.
 *   3. On success → SUCCESS + response stamped.
 *   4. On failure → RETRYING with exponential-backoff nextRetryAt.
 *   5. After `maxAttempts` (default 5) → DEAD_LETTER.
 *   6. Idempotency: if a SUCCESS row with the same `idempotencyKey` exists,
 *      returns the cached response without re-invoking.
 *
 * The retry cron picks up RETRYING rows past their `nextRetryAt` and re-fires.
 */
import { sql, eq, and, lte } from 'drizzle-orm';
import { getDb } from './db';
import { integrationLog } from '@curavend/db';
import type { D1Database } from '@cloudflare/workers-types';

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60, 360]; // 1m, 5m, 15m, 1h, 6h

export interface WrapOptions<T> {
  d1: D1Database;
  connectorType: string;
  connectorId?: string | null;
  entityType: string;
  entityId: string;
  idempotencyKey: string;
  httpMethod?: string;
  url?: string;
  requestPayload?: any;
  triggeredByUserId?: string | null;
  /** The actual call. Must return JSON-serializable result (cached for idempotent re-runs). */
  call: () => Promise<T>;
}

export interface WrappedResult<T> {
  ok: boolean;
  result?: T;
  cached?: boolean;
  status: 'SUCCESS' | 'RETRYING' | 'DEAD_LETTER';
  logId: string;
  error?: string;
}

function backoffNextRetry(attempt: number): string {
  const minutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length - 1)];
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `... [truncated, original length ${s.length}]`;
}

export async function wrapIntegrationCall<T>(opts: WrapOptions<T>): Promise<WrappedResult<T>> {
  const db = getDb(opts.d1);

  // Idempotency check — is there a SUCCESS row with this idempotency key?
  const existing = await db
    .select()
    .from(integrationLog)
    .where(eq(integrationLog.idempotencyKey, opts.idempotencyKey))
    .limit(1);
  if (existing.length && existing[0].status === 'SUCCESS') {
    let cachedResult: T | undefined;
    try {
      cachedResult = existing[0].responseBody ? JSON.parse(existing[0].responseBody) : undefined;
    } catch { /* ignore */ }
    return { ok: true, result: cachedResult, cached: true, status: 'SUCCESS', logId: existing[0].id };
  }

  const id = existing[0]?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const requestStr = opts.requestPayload != null ? JSON.stringify(opts.requestPayload) : null;
  const attempt = (existing[0]?.attemptCount ?? 0) + 1;

  // Upsert PENDING row
  if (existing[0]) {
    await db
      .update(integrationLog)
      .set({
        status: 'PENDING',
        attemptCount: attempt,
        updatedAt: now,
      })
      .where(eq(integrationLog.id, id));
  } else {
    await db.insert(integrationLog).values({
      id,
      connectorType: opts.connectorType,
      connectorId: opts.connectorId ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId,
      direction: 'OUTBOUND',
      httpMethod: opts.httpMethod ?? null,
      url: opts.url ?? null,
      requestPayload: requestStr ? truncate(requestStr, 100_000) : null,
      status: 'PENDING',
      attemptCount: attempt,
      idempotencyKey: opts.idempotencyKey,
      triggeredByUserId: opts.triggeredByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Execute call
  try {
    const result = await opts.call();
    const responseStr = result != null ? JSON.stringify(result) : null;
    await db
      .update(integrationLog)
      .set({
        status: 'SUCCESS',
        responseStatus: 200,
        responseBody: responseStr ? truncate(responseStr, 10_000) : null,
        nextRetryAt: null,
        lastErrorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationLog.id, id));
    return { ok: true, result, status: 'SUCCESS', logId: id };
  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const isDeadLetter = attempt >= MAX_ATTEMPTS;
    const nextRetryAt = isDeadLetter ? null : backoffNextRetry(attempt);
    await db
      .update(integrationLog)
      .set({
        status: isDeadLetter ? 'DEAD_LETTER' : 'RETRYING',
        responseStatus: err?.status ?? null,
        lastErrorMessage: truncate(errMsg, 2_000),
        nextRetryAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrationLog.id, id));
    return {
      ok: false,
      status: isDeadLetter ? 'DEAD_LETTER' : 'RETRYING',
      logId: id,
      error: errMsg,
    };
  }
}

/** Find RETRYING rows whose `nextRetryAt` is past — used by the retry cron. */
export async function findDueRetries(d1: D1Database, limit: number = 50): Promise<typeof integrationLog.$inferSelect[]> {
  const db = getDb(d1);
  const now = new Date().toISOString();
  return db
    .select()
    .from(integrationLog)
    .where(and(eq(integrationLog.status, 'RETRYING'), lte(integrationLog.nextRetryAt, now)))
    .limit(limit);
}

/** Mark a row as TERMINAL_FAILURE (admin action — no more retries). */
export async function abortIntegrationCall(d1: D1Database, id: string, reason?: string): Promise<void> {
  const db = getDb(d1);
  await db
    .update(integrationLog)
    .set({
      status: 'TERMINAL_FAILURE',
      lastErrorMessage: reason ?? 'Aborted by admin',
      nextRetryAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrationLog.id, id));
}
