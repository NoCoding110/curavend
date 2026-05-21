/**
 * Encounter workflow (Assessment + Delivery sections).
 * NKP-19, NKP-20, NKP-21.
 *
 * Mounted under /api/orders/:orderId/encounter/* from the orders router.
 */
import { Hono } from 'hono';
import { eq, and, sql, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orders, orderItems, orderHistory, inventoryItems } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { assertOrderAccess } from './orders';
import type { Env } from '../lib/env';
import { InvoiceService } from '../services/invoiceService';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
// Reads: any scoped tenant member with READ on `orders` may view the encounter.
// Mutations: require WRITE on `orders`, tenant access to the specific order,
// AND the user must not be a hospital user (hospitals see the vendor's
// encounter read-only until submission).
const tenantGuard = async (c: any, next: any) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!user) return c.json({ error: 'Not authenticated', code: 'UNAUTHORIZED' }, 401);
  const { orderId } = c.req.param();
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!rows.length) return c.json({ error: 'Order not found', code: 'NOT_FOUND' }, 404);
  assertOrderAccess(user, rows[0] as any, c.req.method === 'GET');
  if (c.req.method !== 'GET' && user.userType === 'HOSPITAL') {
    throw new ForbiddenError('Hospital users may view but not modify the vendor encounter');
  }
  await next();
};
app.use('/:orderId/encounter', tenantGuard);
app.use('/:orderId/encounter/*', tenantGuard);

app.use('/:orderId/encounter', requirePermission('orders', 'READ'));
app.use('/:orderId/encounter/pdf', requirePermission('orders', 'READ'));
app.use('/:orderId/encounter/:section/items', requirePermission('orders', 'WRITE'));
app.use('/:orderId/encounter/:section/items/:itemId', requirePermission('orders', 'WRITE'));
app.use('/:orderId/encounter/:section/confirm', requirePermission('orders', 'WRITE'));
app.use('/:orderId/encounter/pod', requirePermission('orders', 'WRITE'));
app.use('/:orderId/encounter/submit', requirePermission('orders', 'WRITE'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureOrder(db: ReturnType<typeof getDb>, orderId: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!rows.length) throw new NotFoundError('Order not found');
  return rows[0];
}

async function logAudit(
  db: ReturnType<typeof getDb>,
  opts: { orderId: string; section: string; action: string; userId: string; payload?: any },
) {
  await db.run(sql`
    INSERT INTO encounter_audit_logs (id, order_id, section, action, changed_by_user_id, payload, created_at)
    VALUES (${crypto.randomUUID()}, ${opts.orderId}, ${opts.section}, ${opts.action}, ${opts.userId}, ${opts.payload ? JSON.stringify(opts.payload) : null}, ${new Date().toISOString()})
  `);
}

async function lookupMedicareFee(
  db: ReturnType<typeof getDb>,
  hcpcCode: string,
  stateCode?: string | null,
): Promise<number | null> {
  // Prefer state-specific rate when stateCode is provided
  if (stateCode) {
    const stateRows: any = await db.run(sql`
      SELECT rate FROM state_rate_schedule_items
      WHERE hcpc_code = ${hcpcCode} AND state_code = ${stateCode}
        AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= ${new Date().toISOString().slice(0, 10)})
      ORDER BY effective_date DESC LIMIT 1
    `);
    const stateRate = stateRows.results?.[0]?.rate ?? stateRows[0]?.rate;
    if (stateRate != null) return stateRate;
  }
  // Fall back to national Medicare rate
  const rows: any = await db.run(sql`
    SELECT non_rural_rate FROM medicare_fee_schedule_items WHERE hcpc_code = ${hcpcCode} LIMIT 1
  `);
  const result = rows.results?.[0] ?? rows[0];
  return result?.non_rural_rate ?? null;
}

/**
 * Resolve an inventory_lots row (by lot_number) to its parent SKU.
 * Used by the legacy "scan-only" add-item path. Returns the lot id,
 * SKU id, HCPC, description, and on-hand qty so callers can enforce
 * stock rules and stamp the right metadata.
 */
async function resolveItemFromLot(
  db: ReturnType<typeof getDb>,
  lotNumber: string,
): Promise<{
  lotId: string;
  inventoryItemId: string;
  itemType: string;
  hcpcCode: string | null;
  description: string | null;
  quantityOnHand: number;
} | null> {
  const raw: any = await db.run(sql`
    SELECT l.id AS lot_id, l.inventory_item_id, l.quantity_on_hand,
           i.item_type, i.hcpc_code, i.description
    FROM inventory_lots l
    JOIN inventory_items i ON i.id = l.inventory_item_id
    WHERE l.lot_number = ${lotNumber}
    LIMIT 1
  `);
  const r = raw.results?.[0] ?? raw[0];
  if (!r) return null;
  return {
    lotId: r.lot_id,
    inventoryItemId: r.inventory_item_id,
    itemType: r.item_type ?? 'NON_LOT',
    hcpcCode: r.hcpc_code ?? null,
    description: r.description ?? null,
    quantityOnHand: Number(r.quantity_on_hand ?? 0),
  };
}

/**
 * Fetch the SKU row for a given inventoryItemId. Used when the client
 * picks from the search results (preferred catalog-driven path).
 */
async function loadInventoryItem(
  db: ReturnType<typeof getDb>,
  inventoryItemId: string,
): Promise<{
  id: string;
  itemType: string;
  hcpcCode: string | null;
  description: string | null;
  bundleHcpcCodes: string | null;
} | null> {
  const raw: any = await db.run(sql`
    SELECT id, item_type, hcpc_code, description, bundle_hcpc_codes
    FROM inventory_items WHERE id = ${inventoryItemId} LIMIT 1
  `);
  const r = raw.results?.[0] ?? raw[0];
  if (!r) return null;
  return {
    id: r.id,
    itemType: r.item_type ?? 'NON_LOT',
    hcpcCode: r.hcpc_code ?? null,
    description: r.description ?? null,
    bundleHcpcCodes: r.bundle_hcpc_codes ?? null,
  };
}

/**
 * Find a lot row under a specific SKU by lot number. Returns null if no
 * match. Used when the client supplies both inventoryItemId and lotNumber
 * so we lock the decrement to the right lot.
 */
async function findLotForItem(
  db: ReturnType<typeof getDb>,
  inventoryItemId: string,
  lotNumber: string,
): Promise<{ id: string; quantityOnHand: number } | null> {
  const raw: any = await db.run(sql`
    SELECT id, quantity_on_hand FROM inventory_lots
    WHERE inventory_item_id = ${inventoryItemId} AND lot_number = ${lotNumber}
    LIMIT 1
  `);
  const r = raw.results?.[0] ?? raw[0];
  if (!r) return null;
  return { id: r.id, quantityOnHand: Number(r.quantity_on_hand ?? 0) };
}

// ---------------------------------------------------------------------------
// GET /:orderId/encounter — whole encounter (items by section + pod + history)
// ---------------------------------------------------------------------------
app.get('/:orderId/encounter', async (c) => {
  const db = getDb(c.env.DB);
  const { orderId } = c.req.param();

  // Raw select to include new encounter columns
  const rawOrder: any = await db.run(sql`
    SELECT assessment_confirmed_at, delivery_confirmed_at, encounter_submitted_at,
           pod_file_key, pod_signature_data_url,
           delivered_by, delivery_guarantor_name, delivery_date_time, delivery_accepted_by,
           order_sub_status
    FROM orders WHERE id = ${orderId} LIMIT 1
  `);
  const orderRow = rawOrder.results?.[0];
  if (!orderRow) throw new NotFoundError('Order not found');

  // Raw select for items (includes new columns not in Drizzle schema)
  const itemsRaw: any = await db.run(sql`SELECT * FROM order_items WHERE order_id = ${orderId}`);
  const allItems = itemsRaw.results ?? [];
  const assessment = allItems.filter((i: any) => (i.section ?? 'ASSESSMENT') === 'ASSESSMENT');
  const delivery = allItems.filter((i: any) => i.section === 'DELIVERY');

  const auditRaw: any = await db.run(sql`
    SELECT * FROM encounter_audit_logs WHERE order_id = ${orderId} ORDER BY created_at DESC
  `);

  return c.json({
    orderId,
    assessment,
    delivery,
    pod: {
      fileKey: orderRow.pod_file_key ?? null,
      signatureDataUrl: orderRow.pod_signature_data_url ?? null,
      deliveredBy: orderRow.delivered_by ?? null,
      deliveryGuarantorName: orderRow.delivery_guarantor_name ?? null,
      deliveryDateTime: orderRow.delivery_date_time ?? null,
      deliveryAcceptedBy: orderRow.delivery_accepted_by ?? null,
    },
    orderSubStatus: orderRow.order_sub_status ?? null,
    timestamps: {
      assessmentConfirmedAt: orderRow.assessment_confirmed_at ?? null,
      deliveryConfirmedAt: orderRow.delivery_confirmed_at ?? null,
      encounterSubmittedAt: orderRow.encounter_submitted_at ?? null,
    },
    auditLog: auditRaw.results ?? [],
  });
});

// ---------------------------------------------------------------------------
// POST /:orderId/encounter/:section/items — add item(s)
// ---------------------------------------------------------------------------
app.post('/:orderId/encounter/:section/items', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId, section } = c.req.param();
  if (!['ASSESSMENT', 'DELIVERY'].includes(section)) {
    throw new ValidationError('section must be ASSESSMENT or DELIVERY');
  }
  await ensureOrder(db, orderId);

  const body = await c.req.json();
  const {
    inventoryItemId,
    hcpcCode: bodyHcpc,
    lotNumber: bodyLot,
    quantity: rawQty = 1,
    description: bodyDesc,
  } = body;

  const quantity = Number(rawQty);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ValidationError('quantity must be a positive number');
  }

  const now = new Date().toISOString();
  const addedIds: string[] = [];

  // ---- Resolve catalog SKU + lot using three-tier resolution order --------
  let resolvedItemType: 'LOT' | 'NON_LOT' = 'NON_LOT';
  let resolvedHcpc: string | null = bodyHcpc ?? null;
  let resolvedDesc: string | null = bodyDesc ?? null;
  let resolvedLotNumber: string | null = null;
  let resolvedLotId: string | null = null;
  let resolvedLotQtyOnHand = 0;
  let resolvedInventoryItemId: string | null = null;
  let resolvedBundleChildren: string[] = [];

  if (inventoryItemId) {
    // Path 1: catalog-driven (preferred)
    const item = await loadInventoryItem(db, inventoryItemId);
    if (!item) throw new ValidationError('inventoryItemId not found in catalog');
    resolvedInventoryItemId = item.id;
    resolvedItemType = (item.itemType === 'LOT' ? 'LOT' : 'NON_LOT');
    resolvedHcpc = item.hcpcCode ?? resolvedHcpc;
    resolvedDesc = bodyDesc ?? item.description ?? null;
    if (item.bundleHcpcCodes) {
      try {
        const parsed = JSON.parse(item.bundleHcpcCodes);
        if (Array.isArray(parsed)) resolvedBundleChildren = parsed;
      } catch { /* empty */ }
    }
    if (resolvedItemType === 'LOT') {
      if (!bodyLot) throw new ValidationError('lotNumber is required for lot-tracked items');
      const lot = await findLotForItem(db, item.id, bodyLot);
      if (!lot) throw new ValidationError(`Lot "${bodyLot}" not found for this SKU`);
      if (lot.quantityOnHand < quantity) {
        throw new ValidationError(
          `Insufficient stock: lot "${bodyLot}" has ${lot.quantityOnHand} on hand, requested ${quantity}`,
        );
      }
      resolvedLotNumber = bodyLot;
      resolvedLotId = lot.id;
      resolvedLotQtyOnHand = lot.quantityOnHand;
    }
  } else if (bodyLot) {
    // Path 2: legacy lot-scan — derive SKU from the lot number
    const fromLot = await resolveItemFromLot(db, bodyLot);
    if (!fromLot) throw new ValidationError(`Lot "${bodyLot}" not found`);
    resolvedInventoryItemId = fromLot.inventoryItemId;
    resolvedItemType = 'LOT';
    resolvedHcpc = fromLot.hcpcCode ?? resolvedHcpc;
    resolvedDesc = bodyDesc ?? fromLot.description ?? null;
    resolvedLotId = fromLot.lotId;
    resolvedLotNumber = bodyLot;
    resolvedLotQtyOnHand = fromLot.quantityOnHand;
    if (fromLot.quantityOnHand < quantity) {
      throw new ValidationError(
        `Insufficient stock: lot "${bodyLot}" has ${fromLot.quantityOnHand} on hand, requested ${quantity}`,
      );
    }
    // Also pull bundle children for the resolved SKU
    const sku = await loadInventoryItem(db, fromLot.inventoryItemId);
    if (sku?.bundleHcpcCodes) {
      try {
        const parsed = JSON.parse(sku.bundleHcpcCodes);
        if (Array.isArray(parsed)) resolvedBundleChildren = parsed;
      } catch { /* empty */ }
    }
  } else if (bodyHcpc) {
    // Path 3: ad-hoc HCPC (NON_LOT only). Reject if HCPC is a LOT-typed catalog entry.
    const invRaw: any = await db.run(sql`
      SELECT id, item_type, bundle_hcpc_codes FROM inventory_items
      WHERE hcpc_code = ${bodyHcpc} LIMIT 1
    `);
    const invItem = invRaw.results?.[0];
    if (invItem && invItem.item_type === 'LOT') {
      throw new ValidationError(
        `HCPC ${bodyHcpc} is a lot-tracked item; scan or select a specific lot.`,
      );
    }
    resolvedItemType = 'NON_LOT';
    resolvedHcpc = bodyHcpc;
    resolvedInventoryItemId = invItem?.id ?? null;
    if (invItem?.bundle_hcpc_codes) {
      try {
        const parsed = JSON.parse(invItem.bundle_hcpc_codes);
        if (Array.isArray(parsed)) resolvedBundleChildren = parsed;
      } catch { /* empty */ }
    }
  } else {
    throw new ValidationError('One of inventoryItemId, lotNumber, or hcpcCode is required');
  }

  // NON_LOT: ignore any stray lotNumber silently
  if (resolvedItemType === 'NON_LOT') {
    resolvedLotNumber = null;
    resolvedLotId = null;
  }

  // Resolve hospital state for state-rate preference
  const orderStateRow: any = await db.run(sql`
    SELECT h.state FROM orders o LEFT JOIN hospitals h ON h.id = o.hospital_id WHERE o.id = ${orderId} LIMIT 1
  `);
  const hospitalState: string | null = orderStateRow.results?.[0]?.state ?? null;

  const medicareFee = resolvedHcpc ? await lookupMedicareFee(db, resolvedHcpc, hospitalState) : null;

  // ---- Decrement lot stock (LOT only) -------------------------------------
  if (resolvedItemType === 'LOT' && resolvedLotId) {
    const dec: any = await db.run(sql`
      UPDATE inventory_lots
      SET quantity_on_hand = quantity_on_hand - ${quantity},
          updated_at = ${now}
      WHERE id = ${resolvedLotId} AND quantity_on_hand >= ${quantity}
    `);
    const changed = dec.meta?.changes ?? dec.changes ?? 0;
    if (!changed) {
      throw new ValidationError(
        `Insufficient stock: lot "${resolvedLotNumber}" no longer has ${quantity} on hand`,
      );
    }
  }

  // Primary row — vendor-initiated items always tagged 'VENDOR'
  const primaryId = crypto.randomUUID();
  await db.run(sql`
    INSERT INTO order_items (id, order_id, code, quantity, description, section, item_type, lot_number, hcpc_code, medicare_fee, unit_price, is_bundle, bundle_parent_id, added_by, created_at)
    VALUES (${primaryId}, ${orderId}, ${resolvedHcpc ?? ''}, ${quantity}, ${resolvedDesc}, ${section}, ${resolvedItemType}, ${resolvedLotNumber}, ${resolvedHcpc}, ${medicareFee}, ${medicareFee}, ${resolvedBundleChildren.length > 0 ? 1 : 0}, ${null}, 'VENDOR', ${now})
  `);
  addedIds.push(primaryId);

  // Bundle children (5-item bundle per spec) — children inherit 'VENDOR' from parent
  for (const childCode of resolvedBundleChildren) {
    const childFee = await lookupMedicareFee(db, childCode, hospitalState);
    const childId = crypto.randomUUID();
    await db.run(sql`
      INSERT INTO order_items (id, order_id, code, quantity, description, section, item_type, hcpc_code, medicare_fee, unit_price, is_bundle, bundle_parent_id, added_by, created_at)
      VALUES (${childId}, ${orderId}, ${childCode}, ${quantity}, ${`Bundle child of ${resolvedHcpc}`}, ${section}, 'NON_LOT', ${childCode}, ${childFee}, ${childFee}, 0, ${primaryId}, 'VENDOR', ${now})
    `);
    addedIds.push(childId);
  }

  await logAudit(db, {
    orderId,
    section,
    action: 'ADD_ITEM',
    userId: user.id,
    payload: {
      itemType: resolvedItemType,
      hcpcCode: resolvedHcpc,
      lotNumber: resolvedLotNumber,
      lotId: resolvedLotId,
      inventoryItemId: resolvedInventoryItemId,
      quantity,
      addedIds,
    },
  });

  return c.json({ success: true, ids: addedIds }, 201);
});

// ---------------------------------------------------------------------------
// PUT /:orderId/encounter/:section/items/:itemId — edit item
// ---------------------------------------------------------------------------
app.put('/:orderId/encounter/:section/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId, section, itemId } = c.req.param();
  const order = await ensureOrder(db, orderId);
  const body = await c.req.json();
  const now = new Date().toISOString();

  const isPostConfirm =
    (section === 'ASSESSMENT' && (order as any).assessment_confirmed_at) ||
    (section === 'DELIVERY' && (order as any).delivery_confirmed_at);

  const setters: string[] = [];
  if (body.quantity !== undefined) setters.push(`quantity = ${Number(body.quantity)}`);
  if (body.unitPrice !== undefined) setters.push(`unit_price = ${Number(body.unitPrice)}`);
  if (body.description !== undefined) {
    const d = String(body.description).replace(/'/g, "''");
    setters.push(`description = '${d}'`);
  }
  if (!setters.length) throw new ValidationError('no updatable fields provided');

  await db.run(
    sql.raw(`UPDATE order_items SET ${setters.join(', ')} WHERE id = '${itemId}' AND order_id = '${orderId}'`),
  );

  await logAudit(db, {
    orderId,
    section,
    action: isPostConfirm ? 'EDIT_AFTER_CONFIRM' : 'EDIT_ITEM',
    userId: user.id,
    payload: { itemId, changes: body },
  });

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// DELETE /:orderId/encounter/:section/items/:itemId
// ---------------------------------------------------------------------------
app.delete('/:orderId/encounter/:section/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId, section, itemId } = c.req.param();

  // Look up the row so we can restore lot qty_on_hand if applicable.
  const targetRaw: any = await db.run(sql`
    SELECT item_type, lot_number, quantity FROM order_items
    WHERE id = ${itemId} AND order_id = ${orderId} LIMIT 1
  `);
  const target = targetRaw.results?.[0];

  await db.run(sql`DELETE FROM order_items WHERE id = ${itemId} AND order_id = ${orderId}`);
  await db.run(sql`DELETE FROM order_items WHERE bundle_parent_id = ${itemId}`);

  // Restore lot stock for LOT rows (open-encounter reversal).
  if (target && target.item_type === 'LOT' && target.lot_number) {
    const nowIso = new Date().toISOString();
    await db.run(sql`
      UPDATE inventory_lots
      SET quantity_on_hand = quantity_on_hand + ${Number(target.quantity ?? 0)},
          updated_at = ${nowIso}
      WHERE lot_number = ${target.lot_number}
    `);
  }

  await logAudit(db, {
    orderId,
    section,
    action: 'DELETE_ITEM',
    userId: user.id,
    payload: { itemId },
  });

  return c.json({ success: true });
});

// ---------------------------------------------------------------------------
// POST /:orderId/encounter/:section/confirm
// ---------------------------------------------------------------------------
app.post('/:orderId/encounter/:section/confirm', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId, section } = c.req.param();
  if (!['ASSESSMENT', 'DELIVERY'].includes(section)) {
    throw new ValidationError('section must be ASSESSMENT or DELIVERY');
  }
  const now = new Date().toISOString();

  // Pull current encounter-relevant fields via raw SQL (not all are in Drizzle schema)
  const raw: any = await db.run(sql`
    SELECT assessment_confirmed_at, delivery_confirmed_at,
           order_sub_status, order_sub_status_history
    FROM orders WHERE id = ${orderId} LIMIT 1
  `);
  const row = raw.results?.[0];
  if (!row) throw new NotFoundError('Order not found');

  const column = section === 'ASSESSMENT' ? 'assessment_confirmed_at' : 'delivery_confirmed_at';
  const existingTs = section === 'ASSESSMENT' ? row.assessment_confirmed_at : row.delivery_confirmed_at;

  // Idempotency — if already confirmed, return existing timestamp untouched.
  if (existingTs) {
    return c.json({ success: true, confirmedAt: existingTs, alreadyConfirmed: true });
  }

  // Decide next sub-status, if any.
  const current = row.order_sub_status as string | null;
  let nextSub: string | null = null;
  if (section === 'ASSESSMENT') {
    if (current === 'VENDOR_ASSIGNED' || current === 'VENDOR_CONFIRMED_RECEIPT') {
      nextSub = 'PATIENT_VISITED_AND_ASSESSED';
    }
  } else if (section === 'DELIVERY') {
    if (current === 'PATIENT_VISITED_AND_ASSESSED') {
      nextSub = 'DELIVERED';
    }
  }

  const esc = (s: string) => String(s).replace(/'/g, "''");
  const assigns: string[] = [`${column} = '${now}'`, `updated_at = '${now}'`];
  if (nextSub) {
    let history: any[] = [];
    try {
      history = JSON.parse(row.order_sub_status_history || '[]');
    } catch {
      /* empty */
    }
    history.push({ status: nextSub, timestamp: now });
    assigns.push(`order_sub_status = '${nextSub}'`);
    assigns.push(`order_sub_status_history = '${esc(JSON.stringify(history))}'`);
    assigns.push(`changed_by_user_id = '${esc(user.id)}'`);
  }
  await db.run(sql.raw(`UPDATE orders SET ${assigns.join(', ')} WHERE id = '${esc(orderId)}'`));

  if (nextSub) {
    await db.insert(orderHistory).values({
      id: crypto.randomUUID(),
      orderId,
      description: section === 'ASSESSMENT'
        ? 'Assessment confirmed — patient visited and assessed'
        : 'Delivery confirmed',
      changedByUserId: user.id,
      createdAt: now,
    });
    try {
      await c.env.EVENTS_QUEUE.send({
        type: 'order.status_changed',
        payload: {
          orderId,
          newStatus: 'IN_PROGRESS',
          newSubStatus: nextSub,
          oldStatus: current ?? 'UNKNOWN',
          changedByUserId: user.id,
        },
      });
    } catch { /* empty */ }
  }

  await logAudit(db, { orderId, section, action: 'CONFIRM', userId: user.id, payload: { nextSub } });
  return c.json({ success: true, confirmedAt: now, nextSubStatus: nextSub });
});

// ---------------------------------------------------------------------------
// POST /:orderId/encounter/pod — upload proof-of-delivery
// Accepts { fileKey?: string, signatureDataUrl?: string }
// (The actual file upload should go through /api/uploads first, then pass the key here.)
// ---------------------------------------------------------------------------
app.post('/:orderId/encounter/pod', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();

  if (!body.fileKey && !body.signatureDataUrl) {
    throw new ValidationError('fileKey or signatureDataUrl required');
  }

  // Pull current state for transition decision
  const raw: any = await db.run(sql`
    SELECT order_sub_status, order_sub_status_history
    FROM orders WHERE id = ${orderId} LIMIT 1
  `);
  const row = raw.results?.[0];
  if (!row) throw new NotFoundError('Order not found');

  const esc = (s: string) => String(s).replace(/'/g, "''");
  const assigns: string[] = [`updated_at = '${esc(now)}'`];
  if (body.fileKey) assigns.push(`pod_file_key = '${esc(body.fileKey)}'`);
  if (body.signatureDataUrl) assigns.push(`pod_signature_data_url = '${esc(body.signatureDataUrl)}'`);
  if (body.deliveredBy) assigns.push(`delivered_by = '${esc(body.deliveredBy)}'`);
  if (body.deliveryGuarantorName) assigns.push(`delivery_guarantor_name = '${esc(body.deliveryGuarantorName)}'`);
  if (body.deliveryDateTime) assigns.push(`delivery_date_time = '${esc(body.deliveryDateTime)}'`);
  if (body.deliveryAcceptedBy) assigns.push(`delivery_accepted_by = '${esc(body.deliveryAcceptedBy)}'`);

  // Transition DELIVERED → PROOF_UPLOADED
  const current = row.order_sub_status as string | null;
  let nextSub: string | null = null;
  if (current === 'DELIVERED') {
    nextSub = 'PROOF_UPLOADED';
    let history: any[] = [];
    try {
      history = JSON.parse(row.order_sub_status_history || '[]');
    } catch { /* empty */ }
    history.push({ status: nextSub, timestamp: now });
    assigns.push(`order_sub_status = '${nextSub}'`);
    assigns.push(`order_sub_status_history = '${esc(JSON.stringify(history))}'`);
    assigns.push(`changed_by_user_id = '${esc(user.id)}'`);
  }

  await db.run(sql.raw(`UPDATE orders SET ${assigns.join(', ')} WHERE id = '${esc(orderId)}'`));

  if (nextSub) {
    await db.insert(orderHistory).values({
      id: crypto.randomUUID(),
      orderId,
      description: 'Proof of delivery uploaded',
      changedByUserId: user.id,
      createdAt: now,
    });
    try {
      await c.env.EVENTS_QUEUE.send({
        type: 'order.status_changed',
        payload: {
          orderId,
          newStatus: 'IN_PROGRESS',
          newSubStatus: nextSub,
          oldStatus: current ?? 'UNKNOWN',
          changedByUserId: user.id,
        },
      });
    } catch { /* empty */ }
  }

  await logAudit(db, {
    orderId,
    section: 'DELIVERY',
    action: 'UPLOAD_POD',
    userId: user.id,
    payload: {
      fileKey: body.fileKey,
      hasSignature: !!body.signatureDataUrl,
      deliveredBy: body.deliveredBy,
      deliveryAcceptedBy: body.deliveryAcceptedBy,
      nextSub,
    },
  });

  return c.json({ success: true, nextSubStatus: nextSub });
});

// ---------------------------------------------------------------------------
// POST /:orderId/encounter/submit — complete encounter
// ---------------------------------------------------------------------------
app.post('/:orderId/encounter/submit', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { orderId } = c.req.param();
  const now = new Date().toISOString();

  // Raw select to include new columns not in Drizzle schema
  const raw: any = await db.run(sql`
    SELECT id, hospital_id, vendor_id, provider_id, super_vendor_id, identifier,
           order_sub_status, order_sub_status_history,
           assessment_confirmed_at, delivery_confirmed_at,
           pod_file_key, pod_signature_data_url
    FROM orders WHERE id = ${orderId} LIMIT 1
  `);
  const order = raw.results?.[0];
  if (!order) throw new NotFoundError('Order not found');

  const hasAssess = order.assessment_confirmed_at;
  const hasDeliv = order.delivery_confirmed_at;
  const hasPod = order.pod_file_key || order.pod_signature_data_url;

  if (!hasAssess) throw new ValidationError('Assessment must be confirmed before submitting');
  if (!hasDeliv) throw new ValidationError('Delivery must be confirmed before submitting');
  if (!hasPod) throw new ValidationError('Proof of delivery is required before submitting');

  // Transition to ORDER_COMPLETED
  let history: any[] = [];
  try {
    history = JSON.parse(order.order_sub_status_history || '[]');
  } catch {
    /* empty */
  }
  history.push({ status: 'ORDER_COMPLETED', timestamp: now });

  await db.run(sql.raw(`UPDATE orders SET status='COMPLETED', order_sub_status='ORDER_COMPLETED', order_sub_status_history='${JSON.stringify(history).replace(/'/g, "''")}', encounter_submitted_at='${now}', changed_by_user_id='${user.id}', updated_at='${now}' WHERE id='${orderId}'`));

  await db.insert(orderHistory).values({
    id: crypto.randomUUID(),
    orderId,
    description: 'Encounter submitted — order completed',
    changedByUserId: user.id,
    createdAt: now,
  });

  // Auto-create invoice
  const invoiceService = new InvoiceService(c.env.DB);
  await invoiceService.createInvoiceForOrder({
    id: orderId,
    hospitalId: order.hospital_id,
    vendorId: order.vendor_id,
    providerId: order.provider_id,
    superVendorId: order.super_vendor_id,
    identifier: order.identifier,
  });

  await logAudit(db, { orderId, section: 'DELIVERY', action: 'SUBMIT', userId: user.id });

  // Enqueue status-changed event
  try {
    await c.env.EVENTS_QUEUE.send({
      type: 'order.status_changed',
      payload: {
        orderId,
        newStatus: 'COMPLETED',
        newSubStatus: 'ORDER_COMPLETED',
        oldStatus: order.order_sub_status ?? 'UNKNOWN',
        changedByUserId: user.id,
      },
    });
  } catch {
    /* empty */
  }

  return c.json({ success: true, orderId });
});

// ---------------------------------------------------------------------------
// GET /:orderId/encounter/pdf — return structured data for client-side PDF
// ---------------------------------------------------------------------------
app.get('/:orderId/encounter/pdf', async (c) => {
  const db = getDb(c.env.DB);
  const { orderId } = c.req.param();
  const order = await ensureOrder(db, orderId);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  return c.json({
    order: {
      identifier: (order as any).identifier,
      patientName: `${(order as any).patientName ?? ''} ${(order as any).patientLastName ?? ''}`.trim(),
      diagnosis: (order as any).diagnosis,
      icd10: (order as any).icd10,
      signDateTime: (order as any).signDateTime,
      assessmentConfirmedAt: (order as any).assessment_confirmed_at,
      deliveryConfirmedAt: (order as any).delivery_confirmed_at,
      encounterSubmittedAt: (order as any).encounter_submitted_at,
    },
    assessment: items.filter((i: any) => (i.section ?? 'ASSESSMENT') === 'ASSESSMENT'),
    delivery: items.filter((i: any) => i.section === 'DELIVERY'),
    pod: {
      fileKey: (order as any).pod_file_key,
      signatureDataUrl: (order as any).pod_signature_data_url,
    },
  });
});

export default app;
