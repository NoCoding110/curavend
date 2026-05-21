/**
 * /api/external/fulfillment/* — inbound webhooks from third-party
 * fulfillment vendors (e.g. ShopPro). HMAC-protected, idempotent, fully
 * audited.
 *
 * Endpoints:
 *   POST /status-update — vendor reports lab order moved to a new status
 *                         (batched | in_process | shipped | cancelled | on_hold)
 *   POST /qc-failure   — vendor reports a QC failure with an attempt #
 *                         and a `permanently_failed` flag.
 *
 * Authentication: `hmacAuth({secretEnv: 'EXTERNAL_FULFILLMENT_HMAC_SECRET'})`
 *
 * Idempotency: every callback is hashed (SHA-256 of canonical body) and
 * compared against `external_fulfillment_callbacks.payload_hash`. Dupes are
 * acked with 200 + `{duplicate: true}` and not re-applied.
 */
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import {
  externalFulfillmentCallbacks,
  labOrders,
} from '@curavend/db';
import { getDb } from '../lib/db';
import { hmacAuth } from '../middleware/hmacAuth';
import {
  dispatchCustomerEvent,
} from '../services/notificationRouter';
import { slaBreachTemplate } from '../services/emailService';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { rawBody: string } }>();

const ALLOWED_VENDOR_STATUSES = ['batched', 'in_process', 'shipped', 'cancelled', 'on_hold'];

const statusUpdateSchema = z.object({
  vendor_name: z.string().min(1),
  order_reference: z.string().min(1),
  status: z.enum(['batched', 'in_process', 'shipped', 'cancelled', 'on_hold']),
  timestamp: z.string().optional(),
  tracking_number: z.string().optional(),
});

const qcFailureSchema = z.object({
  vendor_name: z.string().min(1),
  order_reference: z.string().min(1),
  attempt_number: z.number().int().min(1).max(3),
  permanently_failed: z.boolean().optional().default(false),
  failure_reason: z.string().min(1),
  timestamp: z.string().optional(),
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function lookupLabOrderByRef(env: Env, vendorName: string, orderRef: string) {
  const db = getDb(env.DB);
  // Prefer match on external_order_ref (vendor's id); fall back to lab orderNumber
  const byExt = await db
    .select()
    .from(labOrders)
    .where(eq(labOrders.externalOrderRef, orderRef))
    .limit(1);
  if (byExt.length > 0) return byExt[0];
  const byNum = await db
    .select()
    .from(labOrders)
    .where(eq(labOrders.orderNumber, orderRef))
    .limit(1);
  return byNum[0] ?? null;
}

// ─── POST /status-update ──────────────────────────────────────────────────

app.post(
  '/status-update',
  hmacAuth({ secretEnv: 'EXTERNAL_FULFILLMENT_HMAC_SECRET' }),
  async (c) => {
    const rawBody = c.get('rawBody');
    let parsed: z.infer<typeof statusUpdateSchema>;
    try {
      parsed = statusUpdateSchema.parse(JSON.parse(rawBody));
    } catch (err: any) {
      return c.json({ error: err.message ?? 'invalid body', code: 'VALIDATION_ERROR' }, 400);
    }

    const db = getDb(c.env.DB);
    const hash = await sha256Hex(rawBody);

    // Dedup check
    const dupe = await db
      .select({ id: externalFulfillmentCallbacks.id })
      .from(externalFulfillmentCallbacks)
      .where(
        and(
          eq(externalFulfillmentCallbacks.payloadHash, hash),
          eq(externalFulfillmentCallbacks.callbackType, 'STATUS_UPDATE'),
        ),
      )
      .limit(1);
    if (dupe.length > 0) {
      // Still log a row for forensics so we can see retries
      await db.insert(externalFulfillmentCallbacks).values({
        id: crypto.randomUUID(),
        vendorName: parsed.vendor_name,
        callbackType: 'STATUS_UPDATE',
        orderReference: parsed.order_reference,
        relatedLabOrderId: null,
        payloadHash: hash,
        rawPayload: rawBody,
        signatureValid: 1,
        applied: 0,
        applyError: 'duplicate payload',
        ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      });
      return c.json({ ok: true, duplicate: true });
    }

    const order = await lookupLabOrderByRef(c.env, parsed.vendor_name, parsed.order_reference);
    const callbackId = crypto.randomUUID();

    if (!order) {
      await db.insert(externalFulfillmentCallbacks).values({
        id: callbackId,
        vendorName: parsed.vendor_name,
        callbackType: 'STATUS_UPDATE',
        orderReference: parsed.order_reference,
        relatedLabOrderId: null,
        payloadHash: hash,
        rawPayload: rawBody,
        signatureValid: 1,
        applied: 0,
        applyError: 'lab order not found',
        ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      });
      return c.json({ ok: true, applied: false, reason: 'order_not_found' });
    }

    // Apply
    await db
      .update(labOrders)
      .set({
        externalVendorName: parsed.vendor_name,
        externalVendorStatus: parsed.status,
        trackingNumber: parsed.tracking_number ?? order.trackingNumber,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(labOrders.id, order.id));

    await db.insert(externalFulfillmentCallbacks).values({
      id: callbackId,
      vendorName: parsed.vendor_name,
      callbackType: 'STATUS_UPDATE',
      orderReference: parsed.order_reference,
      relatedLabOrderId: order.id,
      payloadHash: hash,
      rawPayload: rawBody,
      signatureValid: 1,
      applied: 1,
      ipAddress: c.req.header('CF-Connecting-IP') ?? null,
    });

    return c.json({ ok: true, applied: true, labOrderId: order.id, status: parsed.status });
  },
);

// ─── POST /qc-failure ─────────────────────────────────────────────────────

app.post(
  '/qc-failure',
  hmacAuth({ secretEnv: 'EXTERNAL_FULFILLMENT_HMAC_SECRET' }),
  async (c) => {
    const rawBody = c.get('rawBody');
    let parsed: z.infer<typeof qcFailureSchema>;
    try {
      parsed = qcFailureSchema.parse(JSON.parse(rawBody));
    } catch (err: any) {
      return c.json({ error: err.message ?? 'invalid body', code: 'VALIDATION_ERROR' }, 400);
    }
    if (parsed.permanently_failed && parsed.attempt_number !== 3) {
      return c.json(
        { error: 'permanently_failed only allowed when attempt_number=3', code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const db = getDb(c.env.DB);
    const hash = await sha256Hex(rawBody);

    const dupe = await db
      .select({ id: externalFulfillmentCallbacks.id })
      .from(externalFulfillmentCallbacks)
      .where(
        and(
          eq(externalFulfillmentCallbacks.payloadHash, hash),
          eq(externalFulfillmentCallbacks.callbackType, 'QC_FAILURE'),
        ),
      )
      .limit(1);
    if (dupe.length > 0) {
      await db.insert(externalFulfillmentCallbacks).values({
        id: crypto.randomUUID(),
        vendorName: parsed.vendor_name,
        callbackType: 'QC_FAILURE',
        orderReference: parsed.order_reference,
        relatedLabOrderId: null,
        payloadHash: hash,
        rawPayload: rawBody,
        signatureValid: 1,
        applied: 0,
        applyError: 'duplicate payload',
        ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      });
      return c.json({ ok: true, duplicate: true });
    }

    const order = await lookupLabOrderByRef(c.env, parsed.vendor_name, parsed.order_reference);
    if (!order) {
      await db.insert(externalFulfillmentCallbacks).values({
        id: crypto.randomUUID(),
        vendorName: parsed.vendor_name,
        callbackType: 'QC_FAILURE',
        orderReference: parsed.order_reference,
        relatedLabOrderId: null,
        payloadHash: hash,
        rawPayload: rawBody,
        signatureValid: 1,
        applied: 0,
        applyError: 'lab order not found',
        ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      });
      return c.json({ ok: true, applied: false, reason: 'order_not_found' });
    }

    // Out-of-order safety: don't downgrade a permanently_failed order
    if (order.qcPermanentlyFailed === 1) {
      await db.insert(externalFulfillmentCallbacks).values({
        id: crypto.randomUUID(),
        vendorName: parsed.vendor_name,
        callbackType: 'QC_FAILURE',
        orderReference: parsed.order_reference,
        relatedLabOrderId: order.id,
        payloadHash: hash,
        rawPayload: rawBody,
        signatureValid: 1,
        applied: 0,
        applyError: 'already permanently_failed; not re-applying',
        ipAddress: c.req.header('CF-Connecting-IP') ?? null,
      });
      return c.json({ ok: true, applied: false, reason: 'already_permanently_failed' });
    }

    const isTerminal = parsed.permanently_failed || parsed.attempt_number === 3;
    const newStatus = isTerminal ? 'QC_FAILED' : order.status;
    const newQcStatus = isTerminal ? 'FAILED' : 'PENDING';

    await db
      .update(labOrders)
      .set({
        qcAttemptCount: Math.max(order.qcAttemptCount, parsed.attempt_number),
        qcPermanentlyFailed: isTerminal ? 1 : order.qcPermanentlyFailed,
        qcFailureReason: parsed.failure_reason,
        qcStatus: newQcStatus,
        status: newStatus,
        externalVendorName: parsed.vendor_name,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(labOrders.id, order.id));

    await db.insert(externalFulfillmentCallbacks).values({
      id: crypto.randomUUID(),
      vendorName: parsed.vendor_name,
      callbackType: 'QC_FAILURE',
      orderReference: parsed.order_reference,
      relatedLabOrderId: order.id,
      payloadHash: hash,
      rawPayload: rawBody,
      signatureValid: 1,
      applied: 1,
      ipAddress: c.req.header('CF-Connecting-IP') ?? null,
    });

    // Dispatch notification when terminal
    if (isTerminal) {
      const html = slaBreachTemplate(
        'Lab order QC permanently failed',
        [
          {
            identifier: order.orderNumber,
            patient: [order.patientName, order.patientLastName].filter(Boolean).join(' '),
            detail: parsed.failure_reason,
            ageHours: 0,
          },
        ],
        'Failure',
      );
      // Don't wait — dispatch in background so the webhook acks fast
      c.executionCtx.waitUntil(
        dispatchCustomerEvent(c.env, {
          eventType: 'LAB_ORDER_QC_FAILED',
          labOrderId: order.id,
          labGroupId: order.labGroupId,
          subject: `⚠️ QC failed (terminal): ${order.orderNumber}`,
          htmlBuilder: () => html,
        }).catch((err) => console.error('[ext-fulfillment] notify failed', err)),
      );
    }

    return c.json({
      ok: true,
      applied: true,
      labOrderId: order.id,
      qcStatus: newQcStatus,
      terminal: isTerminal,
    });
  },
);

export default app;
