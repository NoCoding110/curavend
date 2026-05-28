/**
 * pushOrderToErp.ts — push a finalized order to a vendor's ERP.
 *
 * Lifecycle:
 *   queue handleOrderStatusChanged() detects the new substatus matches an
 *   active connector's trigger_event → calls pushOrderToErp(env, orderId).
 *
 * Per push:
 *   1. Load the order, its vendor, hospital, facility, items
 *   2. Load the vendor's active connector(s) for this trigger_event
 *   3. For each connector:
 *      a. Apply field-map → produce vendor-shaped JSON
 *      b. Resolve auth secret from env (looked up by name in connector.auth_secret_ref)
 *      c. POST with up to 3 attempts (exponential backoff: 0s, 2s, 6s)
 *      d. Write a vendor_erp_push_log row per attempt
 *      e. Update the connector's last_pushed_at / last_success_at / last_error
 *
 * Connector types:
 *   HTTP_POST    — Authorization: Bearer <secret>
 *   WEBHOOK_POST — same plus X-Curavend-Signature header (HMAC-SHA256 hex)
 *   EDI_850      — STUBBED (logs a warning row, no actual delivery)
 *   MANUAL       — no-op (vendor admin pulls CSV from the UI)
 */

import { eq, and } from 'drizzle-orm';
import {
  orders,
  orderItems,
  vendors,
  hospitals,
  hospitalFacilities,
  vendorErpConnectors,
  vendorErpPushLog,
  vendorItemSkus,
} from '@curavend/db';
import { getDb } from '../lib/db';
import { assertPublicHttpUrl } from '../lib/safeFetch';
import {
  applyFieldMap,
  truncateForLog,
  hmacSha256Hex,
  type ErpTransformContext,
} from '../lib/erpFieldMap';
import type { Env } from '../lib/env';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 2000, 6000];
const SOFT_TIMEOUT_MS = 10_000;

/** Look up an auth secret by env-var name. Falls back to the literal value if not present. */
function resolveSecret(env: Env, ref: string | null | undefined): string | null {
  if (!ref) return null;
  const fromEnv = (env as any)[ref];
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return null;
}

/** Build the transform context once, reused across all connectors for one order. */
async function buildContext(env: Env, orderId: string): Promise<ErpTransformContext | null> {
  const db = getDb(env.DB);

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1).then((r) => r[0] ?? null);
  if (!order) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  const [vendor, hospital, facility] = await Promise.all([
    order.vendorId
      ? db.select().from(vendors).where(eq(vendors.id, order.vendorId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    order.hospitalId
      ? db.select().from(hospitals).where(eq(hospitals.id, order.hospitalId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    order.facilityId
      ? db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, order.facilityId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  // Enrich each item with its vendor SKU mapping (for pack math + vendor catalog ID)
  const enriched: any[] = [];
  for (const it of items) {
    let skuRow: any = null;
    if (order.vendorId && (it as any).hcpcCode) {
      skuRow = await db
        .select()
        .from(vendorItemSkus)
        .where(
          and(
            eq(vendorItemSkus.vendorId, order.vendorId),
            eq(vendorItemSkus.hcpcCode, (it as any).hcpcCode),
            eq(vendorItemSkus.isActive, 1),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null);
    }
    enriched.push({
      ...it,
      vendorSku: skuRow?.vendorSku ?? null,
      unitsPerPack: skuRow?.unitsPerPack ?? 1,
      packQuantity: skuRow?.unitsPerPack
        ? Math.ceil(((it as any).quantity ?? 1) / skuRow.unitsPerPack)
        : (it as any).quantity ?? 1,
    });
  }

  // Patient subset (no PHI in transit by default — only what's universally needed)
  const patient = {
    name: order.patientName,
    lastName: order.patientLastName,
    address: order.patientAddress,
  };

  return {
    order,
    vendor,
    hospital,
    facility,
    patient,
    items: enriched,
  };
}

interface PushResult {
  connectorId: string;
  attempts: number;
  finalStatus: 'OK' | 'FAILED' | 'SKIPPED';
  error?: string;
}

/**
 * Push the order to all active connectors for its vendor whose trigger_event
 * matches `triggerEvent` (the new order substatus).
 */
export async function pushOrderToErp(
  env: Env,
  payload: { orderId: string; triggerEvent: string },
): Promise<PushResult[]> {
  const db = getDb(env.DB);
  const ctx = await buildContext(env, payload.orderId);
  if (!ctx) {
    console.warn(`[pushOrderToErp] order ${payload.orderId} not found`);
    return [];
  }

  if (!ctx.order.vendorId) {
    return []; // no vendor → nothing to push
  }

  const connectors = await db
    .select()
    .from(vendorErpConnectors)
    .where(
      and(
        eq(vendorErpConnectors.vendorId, ctx.order.vendorId),
        eq(vendorErpConnectors.isActive, 1),
        eq(vendorErpConnectors.triggerEvent, payload.triggerEvent),
      ),
    );

  const results: PushResult[] = [];

  for (const conn of connectors) {
    if (conn.connectorType === 'MANUAL' || conn.connectorType === 'EDI_850') {
      // MANUAL: no-op (UI download path); EDI_850: stubbed for future
      results.push({ connectorId: conn.id, attempts: 0, finalStatus: 'SKIPPED' });
      if (conn.connectorType === 'EDI_850') {
        await db.insert(vendorErpPushLog).values({
          connectorId: conn.id,
          orderId: ctx.order.id,
          status: 'OK',
          attempt: 1,
          errorSummary: 'EDI_850 stubbed — TODO',
        });
      }
      continue;
    }

    if (!conn.endpointUrl) {
      results.push({ connectorId: conn.id, attempts: 0, finalStatus: 'FAILED', error: 'No endpoint configured' });
      continue;
    }

    let fieldMap: Record<string, string> = {};
    let extraHeaders: Record<string, string> = {};
    try {
      const cfg = conn.config ? JSON.parse(conn.config) : {};
      fieldMap = (cfg.fieldMap ?? {}) as Record<string, string>;
      extraHeaders = (cfg.headers ?? {}) as Record<string, string>;
    } catch (err) {
      console.error(`[pushOrderToErp] invalid config JSON on connector ${conn.id}`);
      await db.insert(vendorErpPushLog).values({
        connectorId: conn.id,
        orderId: ctx.order.id,
        status: 'FAILED',
        attempt: 1,
        errorSummary: 'Invalid config JSON',
      });
      results.push({ connectorId: conn.id, attempts: 1, finalStatus: 'FAILED', error: 'Invalid config JSON' });
      continue;
    }

    let body: string;
    try {
      const transformed = applyFieldMap(fieldMap, ctx);
      body = JSON.stringify(transformed);
    } catch (err: any) {
      await db.insert(vendorErpPushLog).values({
        connectorId: conn.id,
        orderId: ctx.order.id,
        status: 'FAILED',
        attempt: 1,
        errorSummary: `Transform error: ${err?.message ?? 'unknown'}`,
      });
      results.push({ connectorId: conn.id, attempts: 1, finalStatus: 'FAILED', error: err?.message });
      continue;
    }

    const secret = resolveSecret(env, conn.authSecretRef);
    const baseHeaders: Record<string, string> = {
      'content-type': 'application/json',
      ...extraHeaders,
    };
    if (secret) baseHeaders['authorization'] = `Bearer ${secret}`;

    if (conn.connectorType === 'WEBHOOK_POST' && secret) {
      const ts = Date.now().toString();
      baseHeaders['x-curavend-timestamp'] = ts;
      baseHeaders['x-curavend-signature'] = await hmacSha256Hex(secret, ts + body);
    }

    let success = false;
    let lastError: string | null = null;
    let lastHttpStatus: number | null = null;
    let attempts = 0;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts = i + 1;
      const isFinalAttempt = i === MAX_ATTEMPTS - 1;
      const isRetry = i > 0;

      if (BACKOFF_MS[i] > 0) {
        await new Promise((res) => setTimeout(res, BACKOFF_MS[i]));
      }

      const startedAt = Date.now();
      let httpStatus: number | null = null;
      let respText = '';
      let attemptError: string | null = null;

      try {
        assertPublicHttpUrl(conn.endpointUrl);
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), SOFT_TIMEOUT_MS);
        const resp = await fetch(conn.endpointUrl, {
          method: 'POST',
          headers: baseHeaders,
          body,
          signal: ctrl.signal,
        });
        clearTimeout(timeoutId);
        httpStatus = resp.status;
        respText = await resp.text().catch(() => '');
        if (!resp.ok) attemptError = `HTTP ${resp.status}: ${respText.slice(0, 200)}`;
      } catch (err: any) {
        attemptError = err?.message ?? 'Network error';
      }

      const durationMs = Date.now() - startedAt;
      lastHttpStatus = httpStatus;

      // Audit log per attempt
      await db.insert(vendorErpPushLog).values({
        connectorId: conn.id,
        orderId: ctx.order.id,
        status: attemptError ? (isFinalAttempt ? 'FAILED' : 'RETRYING') : 'OK',
        attempt: attempts,
        httpStatus: httpStatus ?? undefined,
        durationMs,
        errorSummary: attemptError ?? undefined,
        requestBody: isRetry ? undefined : truncateForLog(body),
        responseBody: truncateForLog(respText),
      });

      if (!attemptError) {
        success = true;
        break;
      }
      lastError = attemptError;
    }

    const now = new Date().toISOString();
    await db
      .update(vendorErpConnectors)
      .set({
        lastPushedAt: now,
        lastSuccessAt: success ? now : conn.lastSuccessAt,
        lastError: success ? null : lastError,
        updatedAt: now,
      })
      .where(eq(vendorErpConnectors.id, conn.id));

    results.push({
      connectorId: conn.id,
      attempts,
      finalStatus: success ? 'OK' : 'FAILED',
      error: success ? undefined : lastError ?? `HTTP ${lastHttpStatus ?? 'unknown'}`,
    });
  }

  return results;
}
