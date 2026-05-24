/**
 * /api/goods-receipts — Goods Receipt Notes.
 *
 * Endpoints:
 *   GET    /                — list receipts (filterable by orderId, hospitalId, status)
 *   POST   /                — create DRAFT receipt with lines
 *   GET    /:id             — detail + lines
 *   PUT    /:id             — patch header
 *   POST   /:id/lines       — add line
 *   PUT    /:id/lines/:lid  — update line
 *   DELETE /:id/lines/:lid  — remove line
 *   POST   /:id/post        — DRAFT → POSTED (locks the receipt)
 *   POST   /:id/cancel      — DRAFT only
 */
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  goodsReceipts,
  goodsReceiptLines,
  GRN_STATUSES,
  RECEIPT_CONDITIONS,
  orderItems,
  orderBackorders,
  labConsumables,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { getNextValue, ensureSequenceTable } from '../services/sequenceService';
import { requirePermission } from '../middleware/requirePermission';
import { receiveLot } from '../services/labInventoryService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

async function loadReceipt(db: any, user: AuthUser, id: string) {
  const [row] = await db.select().from(goodsReceipts).where(eq(goodsReceipts.id, id)).limit(1);
  if (!row) throw new NotFoundError('Receipt not found');
  if (!isAdmin(user)) {
    if (user.hospitalId && row.hospitalId !== user.hospitalId) {
      // Vendors can see receipts for orders against them
      if (!user.vendorId || row.vendorId !== user.vendorId) {
        throw new ConflictError('Not authorized');
      }
    }
  }
  return row;
}

// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', requirePermission('goods-receipts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId, status, vendorId, hospitalId } = c.req.query();
  const conds: any[] = [];
  if (orderId) conds.push(eq(goodsReceipts.orderId, orderId));
  if (status) conds.push(eq(goodsReceipts.status, status));
  if (isAdmin(user) && hospitalId) conds.push(eq(goodsReceipts.hospitalId, hospitalId));
  else if (user.hospitalId) conds.push(eq(goodsReceipts.hospitalId, user.hospitalId));
  if (vendorId) conds.push(eq(goodsReceipts.vendorId, vendorId));
  else if (user.vendorId && !user.hospitalId) conds.push(eq(goodsReceipts.vendorId, user.vendorId));
  const rows = await db
    .select()
    .from(goodsReceipts)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(goodsReceipts.receivedAt))
    .limit(500);
  return c.json({ items: rows });
});

// ─── POST / ────────────────────────────────────────────────────────────────
app.post('/', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  if (!body.orderId && !body.purchaseOrderId) {
    throw new ValidationError('orderId or purchaseOrderId is required');
  }
  const hospitalId = isAdmin(user) && body.hospitalId ? body.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');

  await ensureSequenceTable(db);
  const seq = await getNextValue(db, `grn_${hospitalId}`);
  const year = new Date().getFullYear();
  const receiptNumber = `GRN-${year}-${String(seq).padStart(5, '0')}`;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(goodsReceipts).values({
    id,
    receiptNumber,
    orderId: body.orderId ?? null,
    purchaseOrderId: body.purchaseOrderId ?? null,
    hospitalId,
    vendorId: body.vendorId ?? null,
    facilityId: body.facilityId ?? null,
    receivedAt: body.receivedAt ?? now,
    receivedByUserId: user.id,
    carrier: body.carrier ?? null,
    trackingNumber: body.trackingNumber ?? null,
    packingSlipNumber: body.packingSlipNumber ?? null,
    status: 'DRAFT',
    notes: body.notes ?? null,
    photoBlobKeys: body.photoBlobKeys ? JSON.stringify(body.photoBlobKeys) : null,
    createdAt: now,
    updatedAt: now,
  });

  // If orderId provided and no lines passed, auto-seed lines from order items
  let linesToInsert: any[] = [];
  if (Array.isArray(body.lines) && body.lines.length > 0) {
    linesToInsert = body.lines;
  } else if (body.orderId) {
    const oItems = await db.select().from(orderItems).where(eq(orderItems.orderId, body.orderId));
    linesToInsert = oItems.map((o: any) => ({
      orderItemId: o.id,
      hcpcCode: o.code,
      description: o.description,
      quantityOrdered: o.quantity,
      quantityReceived: o.quantity ?? 0,
      condition: 'GOOD',
    }));
  }
  for (const ln of linesToInsert) {
    if (!ln.hcpcCode || ln.quantityReceived == null) continue;
    await db.insert(goodsReceiptLines).values({
      id: crypto.randomUUID(),
      receiptId: id,
      orderItemId: ln.orderItemId ?? null,
      hcpcCode: String(ln.hcpcCode).toUpperCase(),
      description: ln.description ?? null,
      quantityOrdered: ln.quantityOrdered ?? null,
      quantityReceived: ln.quantityReceived,
      quantityRejected: ln.quantityRejected ?? 0,
      condition: ln.condition ?? 'GOOD',
      lotNumber: ln.lotNumber ?? null,
      serialNumber: ln.serialNumber ?? null,
      expirationDate: ln.expirationDate ?? null,
      notes: ln.notes ?? null,
      createdAt: now,
    });
  }
  return c.json({ id, receiptNumber }, 201);
});

// ─── GET /:id ──────────────────────────────────────────────────────────────
app.get('/:id', requirePermission('goods-receipts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadReceipt(db, user, id);
  const lines = await db
    .select()
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.receiptId, id));
  return c.json({
    ...row,
    photoBlobKeys: row.photoBlobKeys ? JSON.parse(row.photoBlobKeys) : [],
    lines,
  });
});

// ─── PUT /:id ──────────────────────────────────────────────────────────────
app.put('/:id', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadReceipt(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be edited');
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ['carrier', 'trackingNumber', 'packingSlipNumber', 'notes', 'receivedAt', 'facilityId']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.photoBlobKeys !== undefined) patch.photoBlobKeys = JSON.stringify(body.photoBlobKeys);
  await db.update(goodsReceipts).set(patch).where(eq(goodsReceipts.id, id));
  return c.json({ id, updated: true });
});

// ─── POST /:id/lines ───────────────────────────────────────────────────────
app.post('/:id/lines', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadReceipt(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be edited');
  const body = (await c.req.json()) as any;
  if (!body.hcpcCode || body.quantityReceived == null) {
    throw new ValidationError('hcpcCode and quantityReceived required');
  }
  if (body.condition && !(RECEIPT_CONDITIONS as readonly string[]).includes(body.condition)) {
    throw new ValidationError(`condition must be one of ${RECEIPT_CONDITIONS.join(', ')}`);
  }
  const lineId = crypto.randomUUID();
  await db.insert(goodsReceiptLines).values({
    id: lineId,
    receiptId: id,
    orderItemId: body.orderItemId ?? null,
    hcpcCode: String(body.hcpcCode).toUpperCase(),
    description: body.description ?? null,
    quantityOrdered: body.quantityOrdered ?? null,
    quantityReceived: body.quantityReceived,
    quantityRejected: body.quantityRejected ?? 0,
    condition: body.condition ?? 'GOOD',
    lotNumber: body.lotNumber ?? null,
    serialNumber: body.serialNumber ?? null,
    expirationDate: body.expirationDate ?? null,
    notes: body.notes ?? null,
    createdAt: new Date().toISOString(),
  });
  return c.json({ id: lineId }, 201);
});

// ─── PUT /:id/lines/:lid ──────────────────────────────────────────────────
app.put('/:id/lines/:lid', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, lid } = c.req.param();
  const row = await loadReceipt(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be edited');
  const body = (await c.req.json()) as any;
  if (body.condition && !(RECEIPT_CONDITIONS as readonly string[]).includes(body.condition)) {
    throw new ValidationError(`condition must be one of ${RECEIPT_CONDITIONS.join(', ')}`);
  }
  const patch: Record<string, unknown> = {};
  for (const k of ['description', 'quantityReceived', 'quantityRejected', 'condition', 'lotNumber', 'serialNumber', 'expirationDate', 'notes']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  await db
    .update(goodsReceiptLines)
    .set(patch)
    .where(and(eq(goodsReceiptLines.id, lid), eq(goodsReceiptLines.receiptId, id)));
  return c.json({ id: lid, updated: true });
});

// ─── DELETE /:id/lines/:lid ────────────────────────────────────────────────
app.delete('/:id/lines/:lid', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, lid } = c.req.param();
  const row = await loadReceipt(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be edited');
  await db
    .delete(goodsReceiptLines)
    .where(and(eq(goodsReceiptLines.id, lid), eq(goodsReceiptLines.receiptId, id)));
  return c.json({ id: lid, deleted: true });
});

// ─── POST /:id/post ────────────────────────────────────────────────────────
app.post('/:id/post', requirePermission('goods-receipts', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadReceipt(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be posted');
  const lines = await db
    .select()
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.receiptId, id));
  if (lines.length === 0) throw new ValidationError('Cannot post empty receipt');
  const now = new Date().toISOString();
  await db
    .update(goodsReceipts)
    .set({ status: 'POSTED', postedAt: now, postedByUserId: user.id, updatedAt: now })
    .where(eq(goodsReceipts.id, id));

  // ── Auto-create backorder rows for any partial fills ────────────────────
  // For each receipt line where quantityReceived < quantityOrdered, spawn a
  // backorder line on the parent order with the remaining quantity.
  let backordersCreated = 0;
  for (const ln of lines) {
    if (ln.quantityOrdered != null && ln.quantityReceived < ln.quantityOrdered) {
      const remaining = ln.quantityOrdered - ln.quantityReceived;
      try {
        await db.insert(orderBackorders).values({
          id: crypto.randomUUID(),
          orderId: row.orderId ?? '',
          originalOrderItemId: ln.orderItemId ?? null,
          hcpcCode: ln.hcpcCode,
          itemCode: ln.hcpcCode,
          description: ln.description,
          quantityOrdered: ln.quantityOrdered,
          quantityReceived: ln.quantityReceived,
          quantityRemaining: remaining,
          status: 'OPEN',
          vendorReference: row.trackingNumber ?? null,
          notes: `Auto-created from GRN ${row.receiptNumber}; condition=${ln.condition}`,
          createdAt: now,
          updatedAt: now,
        });
        backordersCreated++;
      } catch (err) {
        console.error('[grn-post] backorder insert failed', err);
      }
    }
  }

  // ── Auto-create lab_inventory_lots rows for lines whose hcpc matches a
  //    lab_consumables item_code. Lot # comes from the GRN line. ─────────
  let lotsCreated = 0;
  for (const ln of lines) {
    if (!ln.lotNumber || ln.quantityReceived <= 0) continue;
    if (ln.condition !== 'GOOD' && ln.condition !== null) continue;
    try {
      const [consumable] = await db
        .select()
        .from(labConsumables)
        .where(eq(labConsumables.itemCode, ln.hcpcCode))
        .limit(1);
      if (!consumable) continue;
      // Default site: use the receipt's facilityId — for non-lab receipts skip
      const siteId = row.facilityId;
      if (!siteId) continue;
      await receiveLot(c.env.DB, {
        consumableId: consumable.id,
        siteId,
        lotNumber: ln.lotNumber,
        quantity: ln.quantityReceived,
        expirationDate: ln.expirationDate ?? null,
        receivedFromOrderId: row.orderId ?? null,
        receivedFromGrnId: id,
        performedByUserId: user.id,
      });
      lotsCreated++;
    } catch (err) {
      console.error('[grn-post] lab lot creation failed', err);
    }
  }

  // ── GL hook (gap 6): post the GR_RECEIPT journal. Best-effort. ─────────
  // GR lines don't carry unit price directly; we source it from the parent
  // orderItem.unitPrice (joined by orderItemId). Missing prices contribute 0.
  let glTxnId: string | null = null;
  try {
    let grTotal = 0;
    if (row.orderId) {
      const oi = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, row.orderId));
      const priceByItem = new Map(oi.map((i) => [i.id, i.unitPrice ?? 0]));
      grTotal = lines.reduce((s, l) => {
        const unit = (l.orderItemId && priceByItem.get(l.orderItemId)) || 0;
        return s + ((l.quantityReceived ?? 0) * unit);
      }, 0);
    }
    if (grTotal > 0 && row.hospitalId) {
      const { postGrReceipt } = await import('../services/glService');
      glTxnId = await postGrReceipt(c.env.DB, {
        hospitalId: row.hospitalId,
        grId: id,
        poId: row.orderId ?? undefined,
        amountUsd: grTotal,
        memo: `GR ${row.receiptNumber} posted`,
        postedByUserId: user.id,
      });
    }
  } catch (err) {
    console.error('[grn-post] GL post failed', err);
  }

  // ── RMA auto-spawn (gap D): DAMAGED + WRONG_ITEM lines spawn one DRAFT
  //    RMA per (vendor, condition) bucket so the operator can review + send.
  let rmasCreated = 0;
  try {
    const damaged = lines.filter((l) => l.condition === 'DAMAGED' || (l as any).condition === 'WRONG_ITEM');
    if (damaged.length > 0 && row.orderId) {
      // We need vendorId — fetch from parent order.
      const { orders: ordersTbl } = await import('@curavend/db');
      const { vendorRmas, vendorRmaLines } = await import('@curavend/db');
      const { getNextValue, ensureSequenceTable } = await import('../services/sequenceService');
      const [parentOrder] = await db
        .select({ vendorId: ordersTbl.vendorId, hospitalId: ordersTbl.hospitalId })
        .from(ordersTbl)
        .where(eq(ordersTbl.id, row.orderId))
        .limit(1);
      if (parentOrder?.vendorId) {
        await ensureSequenceTable(db);
        // Bucket by condition so the operator gets a DAMAGED RMA + a
        // WRONG_ITEM RMA separately (real-world they're handled differently).
        const buckets = new Map<string, typeof damaged>();
        for (const l of damaged) {
          const k = String(l.condition);
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k)!.push(l);
        }
        for (const [condition, bucket] of buckets.entries()) {
          const seq = await getNextValue(db, 'vendor_rmas');
          const rmaId = crypto.randomUUID();
          const rmaNumber = `RMA-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
          await db.insert(vendorRmas).values({
            id: rmaId, rmaNumber,
            vendorId: parentOrder.vendorId,
            hospitalId: parentOrder.hospitalId,
            sourceGrnId: id,
            sourceOrderId: row.orderId,
            state: 'DRAFT',
            reason: condition === 'WRONG_ITEM' ? 'WRONG_ITEM' : 'DAMAGED',
            reasonDetail: `Auto-spawned from GRN ${row.receiptNumber} (${bucket.length} line${bucket.length === 1 ? '' : 's'})`,
            notes: null,
            createdByUserId: user.id,
            createdAt: now, updatedAt: now,
          });
          for (const ln of bucket) {
            await db.insert(vendorRmaLines).values({
              id: crypto.randomUUID(),
              rmaId,
              grnLineId: ln.id,
              hcpcCode: ln.hcpcCode,
              description: ln.description,
              quantity: ln.quantityRejected || ln.quantityReceived,
              condition,
              createdAt: now,
            });
          }
          rmasCreated++;
        }
      }
    }
  } catch (err) {
    console.error('[grn-post] RMA auto-spawn failed', err);
  }

  return c.json({
    id,
    status: 'POSTED',
    backordersCreated,
    labLotsCreated: lotsCreated,
    rmasCreated,
    glTransactionId: glTxnId,
  });
});

// ─── POST /:id/cancel ─────────────────────────────────────────────────────
app.post('/:id/cancel', requirePermission('goods-receipts', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const row = await loadReceipt(db, user, id);
  if (row.status !== 'DRAFT') throw new ConflictError('Only DRAFT can be cancelled');
  await db
    .update(goodsReceipts)
    .set({ status: 'CANCELLED', updatedAt: new Date().toISOString() })
    .where(eq(goodsReceipts.id, id));
  return c.json({ id, status: 'CANCELLED' });
});

export default app;
