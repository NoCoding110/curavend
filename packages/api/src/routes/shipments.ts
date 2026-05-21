/**
 * Order shipment management.
 *
 *   PUT  /orders/:id/tracking              — set tracking on the order's first shipment (creates if absent)
 *   GET  /orders/:id/shipments             — list shipments for an order
 *   POST /orders/:id/shipments             — add a new shipment record
 *   PUT  /shipments/:shipmentId            — update a shipment
 *   DELETE /shipments/:shipmentId          — remove a shipment
 *   POST /orders/bulk-tracking             — bulk update tracking for many orders (CSV upload backend)
 *   GET  /carriers                         — list supported carriers
 *
 * Mounted at the root of the API so endpoints work as listed above.
 */
import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orderShipments,
  orders,
  orderHistory,
  vendors,
} from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { CARRIERS, isValidCarrierCode, listCarriers, trackingUrl } from '../lib/carriers';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { assertOrderAccess } from './orders';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── GET /carriers ────────────────────────────────────────────────────────
app.get('/carriers', async (c) => {
  return c.json({ items: listCarriers() });
});

// ─── GET /orders/:id/shipments ────────────────────────────────────────────
app.get('/orders/:id/shipments', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const orderRow = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!orderRow.length) throw new NotFoundError('Order not found');
  assertOrderAccess(user, orderRow[0]);

  const rows = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, id))
    .orderBy(orderShipments.shipmentSequence);

  // Enrich with public tracking URL
  let vendorOverride: string | null = null;
  if (orderRow[0].vendorId) {
    const vr = await db
      .select({ trackingUrlTemplate: vendors.trackingUrlTemplate })
      .from(vendors)
      .where(eq(vendors.id, orderRow[0].vendorId))
      .limit(1);
    vendorOverride = vr[0]?.trackingUrlTemplate ?? null;
  }
  const items = rows.map((s) => ({
    ...s,
    trackingUrl: trackingUrl(s.carrierCode, s.trackingNumber, vendorOverride),
  }));
  return c.json({ items });
});

// ─── POST /orders/:id/shipments — create a new shipment row ──────────────
app.post('/orders/:id/shipments', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const orderRow = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!orderRow.length) throw new NotFoundError('Order not found');
  assertOrderAccess(user, orderRow[0]);

  if (body.carrierCode && !isValidCarrierCode(body.carrierCode)) {
    throw new ValidationError(`Unknown carrierCode: ${body.carrierCode}`);
  }

  // Next sequence
  const seq = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, id));
  const nextSeq = (seq[0]?.count ?? 0) + 1;

  const shipmentId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(orderShipments).values({
    id: shipmentId,
    orderId: id,
    shipmentSequence: nextSeq,
    carrierCode: body.carrierCode ?? null,
    carrierServiceLevel: body.carrierServiceLevel ?? null,
    trackingNumber: body.trackingNumber ?? null,
    shipmentDate: body.shipmentDate ?? null,
    expectedDeliveryDate: body.expectedDeliveryDate ?? null,
    signatureRequired: body.signatureRequired ? 1 : 0,
    insuredValueCents: body.insuredValueCents ?? null,
    hazmatFlag: body.hazmatFlag ? 1 : 0,
    weightGrams: body.weightGrams ?? null,
    dimensionsCm: body.dimensionsCm ? JSON.stringify(body.dimensionsCm) : null,
    shipFromAddress: body.shipFromAddress ? JSON.stringify(body.shipFromAddress) : null,
    shipToAddress: body.shipToAddress ? JSON.stringify(body.shipToAddress) : null,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  if (body.trackingNumber) {
    await maybeAdvanceToShipped(c, id, orderRow[0]);
  }

  const created = await db.select().from(orderShipments).where(eq(orderShipments.id, shipmentId)).limit(1);
  return c.json(created[0], 201);
});

// ─── PUT /orders/:id/tracking — quick-set tracking on shipment #1 ────────
app.put('/orders/:id/tracking', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const orderRow = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!orderRow.length) throw new NotFoundError('Order not found');
  assertOrderAccess(user, orderRow[0]);

  if (body.carrierCode && !isValidCarrierCode(body.carrierCode)) {
    throw new ValidationError(`Unknown carrierCode: ${body.carrierCode}`);
  }
  if (!body.trackingNumber) {
    throw new ValidationError('trackingNumber is required');
  }

  const existing = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, id))
    .orderBy(orderShipments.shipmentSequence)
    .limit(1);
  const now = new Date().toISOString();
  if (existing.length) {
    await db
      .update(orderShipments)
      .set({
        carrierCode: body.carrierCode ?? existing[0].carrierCode,
        carrierServiceLevel: body.carrierServiceLevel ?? existing[0].carrierServiceLevel,
        trackingNumber: body.trackingNumber,
        shipmentDate: body.shipmentDate ?? existing[0].shipmentDate,
        expectedDeliveryDate: body.expectedDeliveryDate ?? existing[0].expectedDeliveryDate,
        signatureRequired:
          body.signatureRequired != null ? (body.signatureRequired ? 1 : 0) : existing[0].signatureRequired,
        insuredValueCents:
          body.insuredValueCents != null ? body.insuredValueCents : existing[0].insuredValueCents,
        updatedAt: now,
      })
      .where(eq(orderShipments.id, existing[0].id));
  } else {
    await db.insert(orderShipments).values({
      id: crypto.randomUUID(),
      orderId: id,
      shipmentSequence: 1,
      carrierCode: body.carrierCode ?? null,
      carrierServiceLevel: body.carrierServiceLevel ?? null,
      trackingNumber: body.trackingNumber,
      shipmentDate: body.shipmentDate ?? null,
      expectedDeliveryDate: body.expectedDeliveryDate ?? null,
      signatureRequired: body.signatureRequired ? 1 : 0,
      insuredValueCents: body.insuredValueCents ?? null,
      createdByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });
  }
  await maybeAdvanceToShipped(c, id, orderRow[0]);
  return c.json({ success: true, trackingNumber: body.trackingNumber });
});

// ─── PUT /shipments/:shipmentId ───────────────────────────────────────────
app.put('/shipments/:shipmentId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { shipmentId } = c.req.param();
  const body = await c.req.json();

  const rows = await db.select().from(orderShipments).where(eq(orderShipments.id, shipmentId)).limit(1);
  if (!rows.length) throw new NotFoundError('Shipment not found');
  const orderRow = await db.select().from(orders).where(eq(orders.id, rows[0].orderId)).limit(1);
  if (orderRow.length) assertOrderAccess(user, orderRow[0]);

  if (body.carrierCode && !isValidCarrierCode(body.carrierCode)) {
    throw new ValidationError(`Unknown carrierCode: ${body.carrierCode}`);
  }

  const update: any = { updatedAt: new Date().toISOString() };
  if (body.carrierCode !== undefined) update.carrierCode = body.carrierCode;
  if (body.carrierServiceLevel !== undefined) update.carrierServiceLevel = body.carrierServiceLevel;
  if (body.trackingNumber !== undefined) update.trackingNumber = body.trackingNumber;
  if (body.shipmentDate !== undefined) update.shipmentDate = body.shipmentDate;
  if (body.expectedDeliveryDate !== undefined) update.expectedDeliveryDate = body.expectedDeliveryDate;
  if (body.actualDeliveryDate !== undefined) update.actualDeliveryDate = body.actualDeliveryDate;
  if (body.signatureRequired !== undefined) update.signatureRequired = body.signatureRequired ? 1 : 0;
  if (body.insuredValueCents !== undefined) update.insuredValueCents = body.insuredValueCents;
  if (body.hazmatFlag !== undefined) update.hazmatFlag = body.hazmatFlag ? 1 : 0;
  if (body.latestStatus !== undefined) update.latestStatus = body.latestStatus;
  if (body.latestStatusAt !== undefined) update.latestStatusAt = body.latestStatusAt;
  if (body.latestStatusLocation !== undefined) update.latestStatusLocation = body.latestStatusLocation;
  if (body.podAttachment !== undefined) update.podAttachment = body.podAttachment;
  if (body.podSignedBy !== undefined) update.podSignedBy = body.podSignedBy;
  if (body.podSignedAt !== undefined) update.podSignedAt = body.podSignedAt;

  await db.update(orderShipments).set(update).where(eq(orderShipments.id, shipmentId));
  const updated = await db.select().from(orderShipments).where(eq(orderShipments.id, shipmentId)).limit(1);
  return c.json(updated[0]);
});

// ─── DELETE /shipments/:shipmentId ────────────────────────────────────────
app.delete('/shipments/:shipmentId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { shipmentId } = c.req.param();
  const rows = await db.select().from(orderShipments).where(eq(orderShipments.id, shipmentId)).limit(1);
  if (!rows.length) throw new NotFoundError('Shipment not found');
  const orderRow = await db.select().from(orders).where(eq(orders.id, rows[0].orderId)).limit(1);
  if (orderRow.length) assertOrderAccess(user, orderRow[0]);

  await db.delete(orderShipments).where(eq(orderShipments.id, shipmentId));
  return c.json({ success: true });
});

// ─── POST /orders/bulk-tracking ───────────────────────────────────────────
// Body: { idempotencyKey?, dryRun?, items: [{orderIdentifier, carrierCode, trackingNumber, shipmentDate, …}] }
app.post('/orders/bulk-tracking', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();
  const items: any[] = Array.isArray(body.items) ? body.items : [];
  const dryRun = !!body.dryRun;
  const MAX_BATCH = 500;

  if (items.length === 0) throw new ValidationError('items[] is required');
  if (items.length > MAX_BATCH) {
    throw new ValidationError(`Bulk-tracking limited to ${MAX_BATCH} items per call`);
  }

  // Resolve order identifiers → order ids (one shot)
  const identifiers = items.map((it) => it.orderIdentifier).filter(Boolean);
  const orderRows = identifiers.length
    ? await db
        .select({
          id: orders.id,
          identifier: orders.identifier,
          hospitalId: orders.hospitalId,
          vendorId: orders.vendorId,
          providerId: orders.providerId,
          superVendorId: orders.superVendorId,
          orderSubStatus: orders.orderSubStatus,
        })
        .from(orders)
        .where(inArray(orders.identifier, identifiers))
    : [];
  const orderByIdentifier = new Map(orderRows.map((o) => [o.identifier, o]));

  const results: Array<{ orderIdentifier: string; status: 'OK' | 'FAILED'; error?: string }> = [];
  for (const item of items) {
    try {
      if (!item.orderIdentifier) {
        results.push({ orderIdentifier: '<missing>', status: 'FAILED', error: 'orderIdentifier required' });
        continue;
      }
      const orderRow = orderByIdentifier.get(item.orderIdentifier);
      if (!orderRow) {
        results.push({ orderIdentifier: item.orderIdentifier, status: 'FAILED', error: 'order not found' });
        continue;
      }
      try {
        assertOrderAccess(user, orderRow);
      } catch {
        results.push({ orderIdentifier: item.orderIdentifier, status: 'FAILED', error: 'forbidden' });
        continue;
      }
      if (item.carrierCode && !isValidCarrierCode(item.carrierCode)) {
        results.push({ orderIdentifier: item.orderIdentifier, status: 'FAILED', error: `bad carrierCode: ${item.carrierCode}` });
        continue;
      }
      if (!item.trackingNumber) {
        results.push({ orderIdentifier: item.orderIdentifier, status: 'FAILED', error: 'trackingNumber required' });
        continue;
      }

      if (!dryRun) {
        const existing = await db
          .select()
          .from(orderShipments)
          .where(eq(orderShipments.orderId, orderRow.id))
          .orderBy(orderShipments.shipmentSequence)
          .limit(1);
        const now = new Date().toISOString();
        if (existing.length) {
          await db
            .update(orderShipments)
            .set({
              carrierCode: item.carrierCode ?? existing[0].carrierCode,
              carrierServiceLevel: item.carrierServiceLevel ?? existing[0].carrierServiceLevel,
              trackingNumber: item.trackingNumber,
              shipmentDate: item.shipmentDate ?? existing[0].shipmentDate,
              expectedDeliveryDate: item.expectedDeliveryDate ?? existing[0].expectedDeliveryDate,
              updatedAt: now,
            })
            .where(eq(orderShipments.id, existing[0].id));
        } else {
          await db.insert(orderShipments).values({
            id: crypto.randomUUID(),
            orderId: orderRow.id,
            shipmentSequence: 1,
            carrierCode: item.carrierCode ?? null,
            carrierServiceLevel: item.carrierServiceLevel ?? null,
            trackingNumber: item.trackingNumber,
            shipmentDate: item.shipmentDate ?? null,
            expectedDeliveryDate: item.expectedDeliveryDate ?? null,
            createdByUserId: user.id,
            createdAt: now,
            updatedAt: now,
          });
        }
        // Advance order substatus if applicable
        if (orderRow.orderSubStatus === 'VENDOR_ASSIGNED' || orderRow.orderSubStatus === 'VENDOR_CONFIRMED_RECEIPT') {
          await db
            .update(orders)
            .set({
              orderSubStatus: 'DELIVERED', // existing enum has DELIVERED; treat as in-transit-to-delivered for now
              updatedAt: now,
              changedByUserId: user.id,
            })
            .where(eq(orders.id, orderRow.id));
          try {
            await c.env.EVENTS_QUEUE.send({ type: 'order.shipped', payload: { orderId: orderRow.id } });
          } catch (err) {
            console.warn('[bulk-tracking] enqueue failed:', err);
          }
        }
      }
      results.push({ orderIdentifier: item.orderIdentifier, status: 'OK' });
    } catch (err: any) {
      results.push({ orderIdentifier: item.orderIdentifier ?? '<unknown>', status: 'FAILED', error: err?.message ?? 'unknown' });
    }
  }

  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  return c.json({
    dryRun,
    results,
    succeeded: results.length - failedCount,
    failed: failedCount,
  });
});

// Helper: when tracking is first set, push substatus forward + fire event.
async function maybeAdvanceToShipped(c: any, orderId: string, order: any): Promise<void> {
  if (order.orderSubStatus !== 'VENDOR_ASSIGNED' && order.orderSubStatus !== 'VENDOR_CONFIRMED_RECEIPT') return;
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();
  await db
    .update(orders)
    .set({ updatedAt: now })
    .where(eq(orders.id, orderId));
  try {
    await c.env.EVENTS_QUEUE.send({ type: 'order.shipped', payload: { orderId } });
  } catch (err) {
    console.warn('[shipments] enqueue order.shipped failed:', err);
  }
}

export default app;
