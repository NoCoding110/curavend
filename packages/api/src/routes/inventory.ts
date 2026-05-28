import { Hono } from 'hono';
import { eq, desc, and, or, like, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { inventory, inventoryItems, inventoryLots, vendors } from '@curavend/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import { stripImmutableFields } from '../lib/sanitizeBody';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Smart default for a SKU's item_type based on HCPC prefix. Used when the
 * client omits item_type on create. Keep in sync with migration 0007's
 * backfill rule so the system stays self-consistent.
 */
function inferItemTypeFromHcpc(hcpc: string | null | undefined): 'LOT' | 'NON_LOT' {
  if (!hcpc) return 'NON_LOT';
  const upper = hcpc.toUpperCase();
  if (/^[LCK]/.test(upper)) return 'LOT';
  if (upper.startsWith('A42') || upper.startsWith('Q4')) return 'LOT';
  return 'NON_LOT';
}

function normalizeItemType(value: any): 'LOT' | 'NON_LOT' | null {
  if (value == null) return null;
  const upper = String(value).toUpperCase();
  if (upper === 'LOT' || upper === 'NON_LOT') return upper;
  if (upper === 'NONLOT') return 'NON_LOT';
  return null;
}

// ── Inventory catalog CRUD ─────────────────────────────────────────────────

// GET /inventory - List inventory records with vendor name + item count
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const { search, limit = '50', offset = '0' } = c.req.query();

  let conditions: any[] = [];

  if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(inventory.vendorId, user.vendorId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select({
      id: inventory.id,
      vendorId: inventory.vendorId,
      vendorName: vendors.name,
      vendorEmail: vendors.email,
      s3key: inventory.s3key,
      itemCount: sql<number>`(SELECT COUNT(*) FROM inventory_items WHERE inventory_id = ${inventory.id})`,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .leftJoin(vendors, eq(inventory.vendorId, vendors.id))
    .where(whereClause)
    .orderBy(desc(inventory.createdAt))
    .limit(parseInt(limit))
    .offset(parseInt(offset));

  return c.json({ items: results });
});

// POST /inventory - Create inventory record
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  // Vendors auto-assign to themselves; admin must supply vendorId
  const vendorId = body.vendorId || (user.userType === 'VENDOR' ? user.vendorId : null);
  if (!vendorId) {
    throw new ValidationError('vendorId is required');
  }
  body.vendorId = vendorId;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(inventory).values({
    id,
    vendorId: body.vendorId,
    s3key: body.s3key || null,
    createdAt: now,
    updatedAt: now,
  });

  const result = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// ── Unified search (place BEFORE /:id routes so Hono doesn't match "search" as :id)

/**
 * GET /inventory/search?q=...&vendorId=...
 *
 * Used by the encounter "Add Item" modal. Matches inventory items by
 * HCPC code, description, manufacturer item number, OR lot number.
 * Returns at most 25 rows, each with a `lots` array if the SKU is LOT.
 */
app.get('/search', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { q = '', vendorId: vendorIdParam } = c.req.query();

  const term = q.trim();
  if (!term) return c.json({ items: [] });

  // Scope to vendor for VENDOR users; admins / hospital can pass vendorId
  const vendorId =
    user.userType === 'VENDOR' ? user.vendorId : vendorIdParam || null;

  const likeTerm = `%${term}%`;

  // Match by direct fields OR lot number (via EXISTS subquery).
  const conditions: any[] = [
    or(
      like(inventoryItems.hcpcCode, likeTerm),
      like(inventoryItems.description, likeTerm),
      like(inventoryItems.manufacturerItemNumber, likeTerm),
      sql`EXISTS (SELECT 1 FROM inventory_lots l WHERE l.inventory_item_id = ${inventoryItems.id} AND l.lot_number LIKE ${likeTerm})`,
    ),
  ];

  if (vendorId) {
    conditions.push(
      sql`${inventoryItems.inventoryId} IN (SELECT id FROM inventory WHERE vendor_id = ${vendorId})`,
    );
  }

  const items = await db
    .select({
      id: inventoryItems.id,
      inventoryId: inventoryItems.inventoryId,
      hcpcCode: inventoryItems.hcpcCode,
      description: inventoryItems.description,
      manufacturerItemNumber: inventoryItems.manufacturerItemNumber,
      manufacturerName: inventoryItems.manufacturerName,
      itemType: inventoryItems.itemType,
      bundleHcpcCodes: inventoryItems.bundleHcpcCodes,
    })
    .from(inventoryItems)
    .where(and(...conditions))
    .limit(25);

  // Attach lot summary for each LOT item
  const enriched = await Promise.all(
    items.map(async (item) => {
      if (item.itemType !== 'LOT') return { ...item, lots: [] };
      const lots = await db
        .select({
          id: inventoryLots.id,
          lotNumber: inventoryLots.lotNumber,
          quantityOnHand: inventoryLots.quantityOnHand,
          expirationDate: inventoryLots.expirationDate,
        })
        .from(inventoryLots)
        .where(eq(inventoryLots.inventoryItemId, item.id))
        .orderBy(desc(inventoryLots.createdAt));
      return { ...item, lots };
    }),
  );

  return c.json({ items: enriched });
});

// GET /inventory/:id - Get single inventory with vendor name + items
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const result = await db
    .select({
      id: inventory.id,
      vendorId: inventory.vendorId,
      vendorName: vendors.name,
      s3key: inventory.s3key,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    })
    .from(inventory)
    .leftJoin(vendors, eq(inventory.vendorId, vendors.id))
    .where(eq(inventory.id, id))
    .limit(1);

  if (!result.length) {
    throw new NotFoundError('Inventory not found');
  }

  const items = await fetchItemsWithLotRollup(db, id);

  return c.json({ ...result[0], items });
});

// PUT /inventory/:id - Update inventory record
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Inventory not found');
  }

  await db
    .update(inventory)
    .set({ ...stripImmutableFields(body), updatedAt: new Date().toISOString() })
    .where(eq(inventory.id, id));

  const result = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, id))
    .limit(1);

  return c.json(result[0]);
});

// ── Inventory items (SKU) CRUD ─────────────────────────────────────────────

// GET /inventory/:id/items - List items for an inventory with lot rollup
app.get('/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const inv = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, id))
    .limit(1);

  if (!inv.length) {
    throw new NotFoundError('Inventory not found');
  }

  const items = await fetchItemsWithLotRollup(db, id);
  return c.json({ items });
});

/**
 * Fetch items for an inventory catalog and attach a rollup of lot stats.
 * For NON-LOT items, lotCount/totalOnHand are 0.
 */
async function fetchItemsWithLotRollup(db: any, inventoryId: string) {
  const items = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.inventoryId, inventoryId))
    .orderBy(desc(inventoryItems.createdAt));

  // Single aggregate query, then merge client-side
  const rollup = await db
    .select({
      inventoryItemId: inventoryLots.inventoryItemId,
      lotCount: sql<number>`count(*)`,
      totalOnHand: sql<number>`COALESCE(sum(${inventoryLots.quantityOnHand}), 0)`,
    })
    .from(inventoryLots)
    .where(
      sql`${inventoryLots.inventoryItemId} IN (SELECT id FROM inventory_items WHERE inventory_id = ${inventoryId})`,
    )
    .groupBy(inventoryLots.inventoryItemId);

  const rollupByItem = new Map<string, { lotCount: number; totalOnHand: number }>();
  for (const r of rollup) {
    rollupByItem.set(r.inventoryItemId, {
      lotCount: Number(r.lotCount) || 0,
      totalOnHand: Number(r.totalOnHand) || 0,
    });
  }

  return items.map((item: any) => ({
    ...item,
    lotCount: rollupByItem.get(item.id)?.lotCount ?? 0,
    totalOnHand: rollupByItem.get(item.id)?.totalOnHand ?? 0,
  }));
}

// POST /inventory/:id/items - Add item (SKU) to inventory
app.post('/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();

  const inv = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, id))
    .limit(1);

  if (!inv.length) {
    throw new NotFoundError('Inventory not found');
  }

  if (!body.hcpcCode) {
    throw new ValidationError('hcpcCode is required');
  }

  // Client can pick item_type explicitly; otherwise infer from HCPC prefix.
  const providedType = normalizeItemType(body.itemType);
  const itemType = providedType ?? inferItemTypeFromHcpc(body.hcpcCode);

  const itemId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(inventoryItems).values({
    id: itemId,
    inventoryId: id,
    hcpcCode: body.hcpcCode,
    description: body.description || null,
    manufacturerItemNumber: body.manufacturerItemNumber || null,
    manufacturerName: body.manufacturerName || null,
    unitOfMeasurement: body.unitOfMeasurement || null,
    isCustomFit: body.isCustomFit ?? 0,
    itemType,
    bundleHcpcCodes: body.bundleHcpcCodes || null,
    createdAt: now,
  });

  const result = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .limit(1);

  return c.json({ ...result[0], lotCount: 0, totalOnHand: 0 }, 201);
});

// PUT /inventory/:id/items/:itemId - Update an inventory item (SKU)
app.put('/:id/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const { id, itemId } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.inventoryId, id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Inventory item not found');
  }

  // Sanitize item_type; block switching LOT→NON_LOT while lots exist (would
  // orphan stock). Switching NON_LOT→LOT is always fine.
  const updates: any = { ...stripImmutableFields(body) };
  const providedType = normalizeItemType(body.itemType);
  if (providedType) {
    updates.itemType = providedType;
    if (existing[0].itemType === 'LOT' && providedType === 'NON_LOT') {
      const anyLots = await db
        .select({ id: inventoryLots.id })
        .from(inventoryLots)
        .where(eq(inventoryLots.inventoryItemId, itemId))
        .limit(1);
      if (anyLots.length > 0) {
        throw new ValidationError(
          'Cannot switch item to NON_LOT while it still has lots. Delete the lots first.',
        );
      }
    }
  } else {
    delete updates.itemType;
  }

  await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, itemId));

  const result = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .limit(1);

  return c.json(result[0]);
});

// DELETE /inventory/:id/items/:itemId - Delete an inventory item (SKU)
app.delete('/:id/items/:itemId', async (c) => {
  const db = getDb(c.env.DB);
  const { id, itemId } = c.req.param();

  const existing = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.inventoryId, id)))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Inventory item not found');
  }

  // inventory_lots has ON DELETE CASCADE, so lots go with the SKU.
  await db.delete(inventoryItems).where(eq(inventoryItems.id, itemId));

  return c.json({ success: true });
});

// ── Inventory lots CRUD (per-SKU) ──────────────────────────────────────────

// GET /inventory/:id/items/:itemId/lots
app.get('/:id/items/:itemId/lots', async (c) => {
  const db = getDb(c.env.DB);
  const { id, itemId } = c.req.param();

  const item = await assertItemInInventory(db, id, itemId);

  const lots = await db
    .select()
    .from(inventoryLots)
    .where(eq(inventoryLots.inventoryItemId, itemId))
    .orderBy(desc(inventoryLots.createdAt));

  return c.json({ item, lots });
});

// POST /inventory/:id/items/:itemId/lots
app.post('/:id/items/:itemId/lots', async (c) => {
  const db = getDb(c.env.DB);
  const { id, itemId } = c.req.param();
  const body = await c.req.json();

  const item = await assertItemInInventory(db, id, itemId);

  if (item.itemType !== 'LOT') {
    throw new ValidationError(
      'Lots can only be added to LOT-typed inventory items. Change the item type first.',
    );
  }

  if (!body.lotNumber) {
    throw new ValidationError('lotNumber is required');
  }

  const qty = Number(body.quantityOnHand ?? 0);
  if (!Number.isFinite(qty) || qty < 0) {
    throw new ValidationError('quantityOnHand must be a non-negative number');
  }

  const lotId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await db.insert(inventoryLots).values({
      id: lotId,
      inventoryItemId: itemId,
      lotNumber: String(body.lotNumber).trim(),
      quantityOnHand: qty,
      expirationDate: body.expirationDate || null,
      manufacturerDate: body.manufacturerDate || null,
      receivedAt: body.receivedAt || now,
      notes: body.notes || null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    // Unique index on (inventory_item_id, lot_number)
    if (String(err?.message || '').includes('UNIQUE')) {
      throw new ValidationError('A lot with this number already exists for this item');
    }
    throw err;
  }

  const result = await db
    .select()
    .from(inventoryLots)
    .where(eq(inventoryLots.id, lotId))
    .limit(1);

  return c.json(result[0], 201);
});

// PUT /inventory/:id/items/:itemId/lots/:lotId
app.put('/:id/items/:itemId/lots/:lotId', async (c) => {
  const db = getDb(c.env.DB);
  const { id, itemId, lotId } = c.req.param();
  const body = await c.req.json();

  await assertItemInInventory(db, id, itemId);

  const existing = await db
    .select()
    .from(inventoryLots)
    .where(
      and(eq(inventoryLots.id, lotId), eq(inventoryLots.inventoryItemId, itemId)),
    )
    .limit(1);

  if (!existing.length) throw new NotFoundError('Lot not found');

  const updates: any = { updatedAt: new Date().toISOString() };
  if (body.lotNumber !== undefined) updates.lotNumber = String(body.lotNumber).trim();
  if (body.quantityOnHand !== undefined) {
    const qty = Number(body.quantityOnHand);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new ValidationError('quantityOnHand must be a non-negative number');
    }
    updates.quantityOnHand = qty;
  }
  if (body.expirationDate !== undefined) updates.expirationDate = body.expirationDate || null;
  if (body.manufacturerDate !== undefined) updates.manufacturerDate = body.manufacturerDate || null;
  if (body.receivedAt !== undefined) updates.receivedAt = body.receivedAt || null;
  if (body.notes !== undefined) updates.notes = body.notes || null;

  await db.update(inventoryLots).set(updates).where(eq(inventoryLots.id, lotId));

  const result = await db
    .select()
    .from(inventoryLots)
    .where(eq(inventoryLots.id, lotId))
    .limit(1);

  return c.json(result[0]);
});

// DELETE /inventory/:id/items/:itemId/lots/:lotId
app.delete('/:id/items/:itemId/lots/:lotId', async (c) => {
  const db = getDb(c.env.DB);
  const { id, itemId, lotId } = c.req.param();

  await assertItemInInventory(db, id, itemId);

  const existing = await db
    .select()
    .from(inventoryLots)
    .where(
      and(eq(inventoryLots.id, lotId), eq(inventoryLots.inventoryItemId, itemId)),
    )
    .limit(1);

  if (!existing.length) throw new NotFoundError('Lot not found');

  // Block deletion of a lot with stock-on-hand to preserve audit trail;
  // the vendor must zero it out first (PUT with quantityOnHand: 0).
  if ((existing[0].quantityOnHand ?? 0) > 0) {
    throw new ValidationError(
      'Cannot delete a lot with stock on hand. Zero out the quantity first.',
    );
  }

  await db.delete(inventoryLots).where(eq(inventoryLots.id, lotId));
  return c.json({ success: true });
});

async function assertItemInInventory(db: any, inventoryId: string, itemId: string) {
  const item = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.inventoryId, inventoryId)))
    .limit(1);
  if (!item.length) throw new NotFoundError('Inventory item not found');
  return item[0];
}

// DELETE /inventory/:id - Delete inventory catalog (+ its items + lots)
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const existing = await db.select().from(inventory).where(eq(inventory.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Inventory catalog not found');
  // inventory_lots cascades via FK when items are deleted
  await db.delete(inventoryItems).where(eq(inventoryItems.inventoryId, id));
  await db.delete(inventory).where(eq(inventory.id, id));
  return c.json({ success: true });
});

export default app;
