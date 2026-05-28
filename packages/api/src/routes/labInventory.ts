/**
 * /api/lab-inventory — lab consumable + lot CRUD + stock movements.
 *
 * Item master:
 *   GET    /consumables                 — list (filter by category / labGroupId)
 *   POST   /consumables                 — create
 *   PUT    /consumables/:id             — update item master fields
 *   DELETE /consumables/:id             — soft-disable (is_active=0)
 *
 * Lots + stock:
 *   GET    /lots                        — list with filters (siteId, consumableId, status)
 *   POST   /lots/receive                — record a receipt (creates/tops up lot)
 *   POST   /lots/:id/adjust             — manual qty adjustment (admin)
 *   POST   /lots/:id/quarantine         — pull from active
 *   POST   /lots/:id/recall             — recall by manufacturer
 *
 * Summary + dashboards:
 *   GET    /summary                     — per-site, per-consumable on-hand + flags
 *   GET    /reorder-candidates          — items needing replenishment
 *   GET    /expiring?days=30            — lots expiring soon
 *
 * Issuance + transfers:
 *   POST   /issue                       — FEFO consume by (consumableId, siteId, qty)
 *   POST   /transfer                    — inter-site move
 *
 * Audit:
 *   GET    /movements/lot/:lotId        — history for a specific lot
 *   GET    /movements/site/:siteId      — history for a site
 *
 * Test→consumable map:
 *   GET    /test-consumables            — list
 *   POST   /test-consumables            — upsert
 *   DELETE /test-consumables/:id
 */
import { Hono } from 'hono';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  labConsumables,
  labInventoryLots,
  labStockMovements,
  labTestConsumables,
  labKitSites,
  labGroups,
  LAB_CONSUMABLE_CATEGORIES,
  HAZARD_CLASSES,
  LOT_STATUSES,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import {
  recordMovement,
  issueConsumable,
  receiveLot,
  transferStock,
  getSiteSummary,
  getReorderCandidates,
  getExpiringLots,
} from '../services/labInventoryService';
import { forecastDemand } from '../services/labReplenishmentService';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}
function isLab(u: AuthUser): boolean {
  return (
    u.role === 'LAB_ACCOUNT_MANAGER' ||
    u.role === 'LAB_ACCOUNT_MANAGER_USER' ||
    isAdmin(u)
  );
}

/**
 * Resolves the lab_group_id(s) the caller can see. Returns:
 *   - `null` for admins (no restriction).
 *   - An array of group IDs for lab and vendor personas.
 *   - Throws ForbiddenError for personas with no lab/vendor scope.
 *
 * Vendor personas may own multiple lab groups (lab_groups.vendor_id), so
 * we resolve all groups for the vendor.
 */
async function tenantLabGroups(
  d1: D1Database,
  u: AuthUser,
): Promise<string[] | null> {
  if (isAdmin(u)) return null;
  if (u.labGroupId) return [u.labGroupId];
  if (u.vendorId) {
    const db = getDb(d1);
    const rows = await db
      .select({ id: labGroups.id })
      .from(labGroups)
      .where(eq(labGroups.vendorId, u.vendorId));
    return rows.map((r) => r.id);
  }
  throw new ForbiddenError('Lab inventory is restricted to lab and vendor personas');
}

/** Verify a kit site belongs to one of the caller's lab groups. */
async function assertSiteInTenant(d1: D1Database, u: AuthUser, siteId: string) {
  const allowed = await tenantLabGroups(d1, u);
  if (allowed === null) return; // admin
  const db = getDb(d1);
  const [site] = await db
    .select({ labGroupId: labKitSites.labGroupId })
    .from(labKitSites)
    .where(eq(labKitSites.id, siteId))
    .limit(1);
  if (!site) throw new NotFoundError('Site not found');
  if (!allowed.includes(site.labGroupId)) {
    throw new ForbiddenError('Site belongs to a different tenant');
  }
}

/** Verify a lot's site belongs to one of the caller's lab groups. */
async function assertLotInTenant(d1: D1Database, u: AuthUser, lotId: string) {
  const allowed = await tenantLabGroups(d1, u);
  if (allowed === null) return; // admin
  const db = getDb(d1);
  const [row] = await db
    .select({ labGroupId: labKitSites.labGroupId })
    .from(labInventoryLots)
    .innerJoin(labKitSites, eq(labKitSites.id, labInventoryLots.siteId))
    .where(eq(labInventoryLots.id, lotId))
    .limit(1);
  if (!row) throw new NotFoundError('Lot not found');
  if (!allowed.includes(row.labGroupId)) {
    throw new ForbiddenError('Lot belongs to a different tenant');
  }
}

// ─── Item master ──────────────────────────────────────────────────────────
app.get('/consumables', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const { category, labGroupId, isActive } = c.req.query();
  const conds: any[] = [];
  if (category) conds.push(eq(labConsumables.category, category));
  if (isActive !== '0') conds.push(eq(labConsumables.isActive, 1));
  if (allowed === null) {
    // admin — honor optional client filter
    if (labGroupId) conds.push(eq(labConsumables.labGroupId, labGroupId));
  } else {
    // Tenant — restrict to caller's groups OR platform-wide (null labGroupId).
    // Platform-wide consumables (seeded master items) are visible to all labs.
    if (allowed.length === 0) {
      // Vendor with zero lab groups — only platform-wide items.
      conds.push(isNull(labConsumables.labGroupId));
    } else {
      conds.push(
        or(
          isNull(labConsumables.labGroupId),
          inArray(labConsumables.labGroupId, allowed),
        )!,
      );
    }
    // Honor optional intra-tenant filter (must be one of the allowed groups).
    if (labGroupId && !allowed.includes(labGroupId)) {
      throw new ForbiddenError('labGroupId is outside your tenant');
    }
    if (labGroupId) conds.push(eq(labConsumables.labGroupId, labGroupId));
  }
  const rows = await db.select().from(labConsumables).where(conds.length ? and(...conds) : undefined);
  return c.json({ items: rows });
});

app.post('/consumables', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const body = (await c.req.json()) as any;
  if (!body.itemCode?.trim() || !body.description?.trim() || !body.category) {
    throw new ValidationError('itemCode, description, category required');
  }
  // Non-admins can only create items within their own lab group(s).
  // A null body.labGroupId would create a platform-wide item — admin only.
  const allowed = await tenantLabGroups(c.env.DB, user);
  if (allowed !== null) {
    if (!body.labGroupId) {
      throw new ForbiddenError('labGroupId required (only admin can create platform-wide items)');
    }
    if (!allowed.includes(body.labGroupId)) {
      throw new ForbiddenError('labGroupId is outside your tenant');
    }
  }
  if (!(LAB_CONSUMABLE_CATEGORIES as readonly string[]).includes(body.category)) {
    throw new ValidationError(`category must be one of ${LAB_CONSUMABLE_CATEGORIES.join(', ')}`);
  }
  if (body.hazardClass && !(HAZARD_CLASSES as readonly string[]).includes(body.hazardClass)) {
    throw new ValidationError(`hazardClass must be one of ${HAZARD_CLASSES.join(', ')}`);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.insert(labConsumables).values({
      id,
      labGroupId: body.labGroupId ?? null,
      itemCode: body.itemCode.trim(),
      description: body.description.trim(),
      category: body.category,
      manufacturer: body.manufacturer ?? null,
      manufacturerCatalog: body.manufacturerCatalog ?? null,
      storageTempMinC: body.storageTempMinC ?? null,
      storageTempMaxC: body.storageTempMaxC ?? null,
      storageInstructions: body.storageInstructions ?? null,
      hazardClass: body.hazardClass ?? 'NONE',
      usageUom: body.usageUom ?? 'each',
      unitsPerCase: body.unitsPerCase ?? null,
      minThreshold: body.minThreshold ?? null,
      maxThreshold: body.maxThreshold ?? null,
      reorderPoint: body.reorderPoint ?? null,
      reorderQuantity: body.reorderQuantity ?? null,
      requiresLotTracking: body.requiresLotTracking === false ? 0 : 1,
      preferredVendorId: body.preferredVendorId ?? null,
      defaultUnitPriceUsd: body.defaultUnitPriceUsd ?? null,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      throw new ConflictError('Item with this code already exists for this lab');
    }
    throw err;
  }
  return c.json({ id }, 201);
});

app.put('/consumables/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const { id } = c.req.param();
  // Tenant check: lab/vendor personas may only edit their own group's items.
  const allowed = await tenantLabGroups(c.env.DB, user);
  if (allowed !== null) {
    const [item] = await db
      .select({ labGroupId: labConsumables.labGroupId })
      .from(labConsumables)
      .where(eq(labConsumables.id, id))
      .limit(1);
    if (!item) throw new NotFoundError('Consumable not found');
    if (item.labGroupId === null || !allowed.includes(item.labGroupId)) {
      throw new ForbiddenError('Consumable belongs to a different tenant (or is platform-wide and admin-only)');
    }
  }
  const body = (await c.req.json()) as any;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of [
    'description', 'manufacturer', 'manufacturerCatalog', 'storageTempMinC',
    'storageTempMaxC', 'storageInstructions', 'hazardClass', 'usageUom',
    'unitsPerCase', 'minThreshold', 'maxThreshold', 'reorderPoint',
    'reorderQuantity', 'preferredVendorId', 'defaultUnitPriceUsd', 'category',
  ]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.requiresLotTracking !== undefined) patch.requiresLotTracking = body.requiresLotTracking ? 1 : 0;
  await db.update(labConsumables).set(patch).where(eq(labConsumables.id, id));
  return c.json({ id, updated: true });
});

app.delete('/consumables/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const { id } = c.req.param();
  const allowed = await tenantLabGroups(c.env.DB, user);
  if (allowed !== null) {
    const [item] = await db
      .select({ labGroupId: labConsumables.labGroupId })
      .from(labConsumables)
      .where(eq(labConsumables.id, id))
      .limit(1);
    if (!item) throw new NotFoundError('Consumable not found');
    if (item.labGroupId === null || !allowed.includes(item.labGroupId)) {
      throw new ForbiddenError('Consumable belongs to a different tenant (or is platform-wide and admin-only)');
    }
  }
  await db
    .update(labConsumables)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(labConsumables.id, id));
  return c.json({ id, deactivated: true });
});

// ─── Lots ─────────────────────────────────────────────────────────────────
app.get('/lots', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const { siteId, consumableId, status } = c.req.query();
  const conds: any[] = [];
  if (siteId) {
    if (allowed) await assertSiteInTenant(c.env.DB, user, siteId);
    conds.push(eq(labInventoryLots.siteId, siteId));
  }
  if (consumableId) conds.push(eq(labInventoryLots.consumableId, consumableId));
  if (status) conds.push(eq(labInventoryLots.status, status));

  if (allowed === null) {
    const rows = await db
      .select()
      .from(labInventoryLots)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(labInventoryLots.createdAt))
      .limit(500);
    return c.json({ items: rows });
  }
  if (allowed.length === 0) return c.json({ items: [] });
  conds.push(inArray(labKitSites.labGroupId, allowed));
  const rows = await db
    .select({
      id: labInventoryLots.id,
      consumableId: labInventoryLots.consumableId,
      siteId: labInventoryLots.siteId,
      lotNumber: labInventoryLots.lotNumber,
      serialNumber: labInventoryLots.serialNumber,
      expirationDate: labInventoryLots.expirationDate,
      quantityOnHand: labInventoryLots.quantityOnHand,
      quantityReserved: labInventoryLots.quantityReserved,
      status: labInventoryLots.status,
      unitPriceUsd: labInventoryLots.unitPriceUsd,
      receivedFromOrderId: labInventoryLots.receivedFromOrderId,
      receivedFromGrnId: labInventoryLots.receivedFromGrnId,
      receivedAt: labInventoryLots.receivedAt,
      notes: labInventoryLots.notes,
      createdAt: labInventoryLots.createdAt,
      updatedAt: labInventoryLots.updatedAt,
    })
    .from(labInventoryLots)
    .innerJoin(labKitSites, eq(labKitSites.id, labInventoryLots.siteId))
    .where(and(...conds))
    .orderBy(desc(labInventoryLots.createdAt))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/lots/receive', async (c) => {
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const body = (await c.req.json()) as any;
  if (!body.consumableId || !body.siteId || !body.lotNumber || !body.quantity) {
    throw new ValidationError('consumableId, siteId, lotNumber, quantity required');
  }
  await assertSiteInTenant(c.env.DB, user, body.siteId);
  const r = await receiveLot(c.env.DB, {
    consumableId: body.consumableId,
    siteId: body.siteId,
    lotNumber: body.lotNumber,
    quantity: Number(body.quantity),
    expirationDate: body.expirationDate ?? null,
    unitPriceUsd: body.unitPriceUsd ?? null,
    receivedFromOrderId: body.receivedFromOrderId ?? null,
    receivedFromGrnId: body.receivedFromGrnId ?? null,
    performedByUserId: user.id,
  });
  return c.json(r);
});

app.post('/lots/:id/adjust', async (c) => {
  const user = c.get('user');
  if (!isAdmin(user) && user.role !== 'LAB_ACCOUNT_MANAGER') {
    throw new ConflictError('Manual adjustments require lab admin');
  }
  const { id } = c.req.param();
  await assertLotInTenant(c.env.DB, user, id);
  const body = (await c.req.json()) as { quantity: number; reason?: string };
  if (typeof body.quantity !== 'number') throw new ValidationError('quantity required');
  if (!body.reason?.trim()) throw new ValidationError('reason required for manual adjustment');
  const r = await recordMovement(c.env.DB, {
    lotId: id,
    movementType: 'ADJUST',
    quantity: body.quantity,
    reason: body.reason.trim(),
    performedByUserId: user.id,
  });
  return c.json(r);
});

app.post('/lots/:id/quarantine', async (c) => {
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  await assertLotInTenant(c.env.DB, user, id);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  await db
    .update(labInventoryLots)
    .set({ status: 'QUARANTINED', notes: body.reason ?? null, updatedAt: new Date().toISOString() })
    .where(eq(labInventoryLots.id, id));
  await recordMovement(c.env.DB, {
    lotId: id,
    movementType: 'QUARANTINE',
    quantity: 0,
    reason: body.reason ?? null,
    performedByUserId: user.id,
  });
  return c.json({ id, status: 'QUARANTINED' });
});

app.post('/lots/:id/recall', async (c) => {
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  await assertLotInTenant(c.env.DB, user, id);
  const body = (await c.req.json()) as { reason: string };
  if (!body.reason?.trim()) throw new ValidationError('reason required for recall');
  await db
    .update(labInventoryLots)
    .set({ status: 'RECALLED', notes: body.reason, updatedAt: new Date().toISOString() })
    .where(eq(labInventoryLots.id, id));
  await recordMovement(c.env.DB, {
    lotId: id,
    movementType: 'RECALL',
    quantity: 0,
    reason: body.reason,
    performedByUserId: user.id,
  });
  return c.json({ id, status: 'RECALLED' });
});

// ─── Issuance + transfers ─────────────────────────────────────────────────
app.post('/issue', async (c) => {
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const body = (await c.req.json()) as any;
  if (!body.consumableId || !body.siteId || !body.quantity) {
    throw new ValidationError('consumableId, siteId, quantity required');
  }
  await assertSiteInTenant(c.env.DB, user, body.siteId);
  try {
    const r = await issueConsumable(c.env.DB, {
      consumableId: body.consumableId,
      siteId: body.siteId,
      quantity: Number(body.quantity),
      relatedLabOrderId: body.relatedLabOrderId,
      reason: body.reason,
      performedByUserId: user.id,
    });
    return c.json(r);
  } catch (err: any) {
    if (err?.message?.includes('Insufficient')) {
      throw new ConflictError(err.message);
    }
    throw err;
  }
});

app.post('/transfer', async (c) => {
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const body = (await c.req.json()) as any;
  if (!body.consumableId || !body.fromLotId || !body.toSiteId || !body.quantity) {
    throw new ValidationError('consumableId, fromLotId, toSiteId, quantity required');
  }
  // BOTH endpoints of the transfer must belong to the caller's tenant —
  // we don't allow cross-tenant stock movement.
  await assertLotInTenant(c.env.DB, user, body.fromLotId);
  await assertSiteInTenant(c.env.DB, user, body.toSiteId);
  const r = await transferStock(c.env.DB, {
    consumableId: body.consumableId,
    fromLotId: body.fromLotId,
    toSiteId: body.toSiteId,
    quantity: Number(body.quantity),
    performedByUserId: user.id,
    reason: body.reason,
  });
  return c.json(r);
});

// ─── Summary + dashboards ─────────────────────────────────────────────────
//
// For all 4 endpoints below, tenant rules are:
//   - Admin: client args honored unfiltered.
//   - Lab persona (single labGroupId): args.labGroupId forced to caller's.
//   - Vendor persona (multiple labGroupIds): we iterate per group and merge
//     results.  Per-site filters that escape tenant get rejected.
//
// `siteId` overrides — when provided we validate it belongs to the tenant.
app.get('/summary', async (c) => {
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const { siteId, labGroupId, category } = c.req.query();
  if (siteId && allowed) await assertSiteInTenant(c.env.DB, user, siteId);
  if (allowed === null) {
    const rows = await getSiteSummary(c.env.DB, { siteId, labGroupId, category });
    return c.json({ items: rows });
  }
  if (labGroupId && !allowed.includes(labGroupId)) {
    throw new ForbiddenError('labGroupId is outside your tenant');
  }
  if (allowed.length === 0) return c.json({ items: [] });
  const groups = labGroupId ? [labGroupId] : allowed;
  const all = await Promise.all(
    groups.map((g) => getSiteSummary(c.env.DB, { siteId, labGroupId: g, category })),
  );
  return c.json({ items: all.flat() });
});

app.get('/reorder-candidates', async (c) => {
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const { siteId, labGroupId } = c.req.query();
  if (siteId && allowed) await assertSiteInTenant(c.env.DB, user, siteId);
  if (allowed === null) {
    const rows = await getReorderCandidates(c.env.DB, { siteId, labGroupId });
    return c.json({ items: rows });
  }
  if (labGroupId && !allowed.includes(labGroupId)) {
    throw new ForbiddenError('labGroupId is outside your tenant');
  }
  if (allowed.length === 0) return c.json({ items: [] });
  const groups = labGroupId ? [labGroupId] : allowed;
  const all = await Promise.all(
    groups.map((g) => getReorderCandidates(c.env.DB, { siteId, labGroupId: g })),
  );
  return c.json({ items: all.flat() });
});

app.get('/expiring', async (c) => {
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const days = Number(c.req.query('days') ?? '30');
  const rows = await getExpiringLots(c.env.DB, days);
  if (allowed === null) return c.json({ days, items: rows });
  if (allowed.length === 0) return c.json({ days, items: [] });
  // getExpiringLots returns site-level rows; filter by joining sites in-mem.
  const db = getDb(c.env.DB);
  const sites = await db
    .select({ id: labKitSites.id, labGroupId: labKitSites.labGroupId })
    .from(labKitSites)
    .where(inArray(labKitSites.labGroupId, allowed));
  const siteIds = new Set(sites.map((s) => s.id));
  return c.json({ days, items: rows.filter((r: any) => siteIds.has(r.siteId)) });
});

// ─── GET /forecast ─────────────────────────────────────────────────────────
// Usage-based 30-day demand forecast per consumable per site.
app.get('/forecast', async (c) => {
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const { siteId, labGroupId } = c.req.query();
  if (siteId && allowed) await assertSiteInTenant(c.env.DB, user, siteId);
  if (allowed === null) {
    const rows = await forecastDemand(c.env, { siteId, labGroupId });
    return c.json({ items: rows });
  }
  if (labGroupId && !allowed.includes(labGroupId)) {
    throw new ForbiddenError('labGroupId is outside your tenant');
  }
  if (allowed.length === 0) return c.json({ items: [] });
  const groups = labGroupId ? [labGroupId] : allowed;
  const all = await Promise.all(
    groups.map((g) => forecastDemand(c.env, { siteId, labGroupId: g })),
  );
  return c.json({ items: all.flat() });
});

// ─── Movement audit ───────────────────────────────────────────────────────
app.get('/movements/lot/:lotId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { lotId } = c.req.param();
  await assertLotInTenant(c.env.DB, user, lotId);
  const rows = await db
    .select()
    .from(labStockMovements)
    .where(eq(labStockMovements.lotId, lotId))
    .orderBy(desc(labStockMovements.occurredAt))
    .limit(200);
  return c.json({ items: rows });
});

app.get('/movements/site/:siteId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { siteId } = c.req.param();
  await assertSiteInTenant(c.env.DB, user, siteId);
  const rows = await db
    .select()
    .from(labStockMovements)
    .where(eq(labStockMovements.siteId, siteId))
    .orderBy(desc(labStockMovements.occurredAt))
    .limit(200);
  return c.json({ items: rows });
});

// ─── Test → consumable map ────────────────────────────────────────────────
//
// Visibility rules match consumables: platform-wide (null labGroupId) +
// tenant-specific entries. Mutation requires admin (for platform-wide) or
// matching tenant.
app.get('/test-consumables', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const allowed = await tenantLabGroups(c.env.DB, user);
  const { testCode, consumableId } = c.req.query();
  const conds: any[] = [];
  if (testCode) conds.push(eq(labTestConsumables.testCode, testCode));
  if (consumableId) conds.push(eq(labTestConsumables.consumableId, consumableId));
  if (allowed !== null) {
    if (allowed.length === 0) {
      conds.push(isNull(labTestConsumables.labGroupId));
    } else {
      conds.push(
        or(
          isNull(labTestConsumables.labGroupId),
          inArray(labTestConsumables.labGroupId, allowed),
        )!,
      );
    }
  }
  const rows = await db
    .select()
    .from(labTestConsumables)
    .where(conds.length ? and(...conds) : undefined);
  return c.json({ items: rows });
});

app.post('/test-consumables', async (c) => {
  const user = c.get('user');
  if (!isLab(user)) throw new ConflictError('Not authorized');
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as any;
  if (!body.testCode || !body.consumableId || body.quantityPerTest == null) {
    throw new ValidationError('testCode, consumableId, quantityPerTest required');
  }
  const allowed = await tenantLabGroups(c.env.DB, user);
  if (allowed !== null) {
    if (!body.labGroupId) {
      throw new ForbiddenError('labGroupId required (only admin can create platform-wide mappings)');
    }
    if (!allowed.includes(body.labGroupId)) {
      throw new ForbiddenError('labGroupId is outside your tenant');
    }
  }
  const id = crypto.randomUUID();
  try {
    await db.insert(labTestConsumables).values({
      id,
      labGroupId: body.labGroupId ?? null,
      testCode: body.testCode,
      testDescription: body.testDescription ?? null,
      consumableId: body.consumableId,
      quantityPerTest: Number(body.quantityPerTest),
      isCritical: body.isCritical ? 1 : 0,
      notes: body.notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      throw new ConflictError('Mapping already exists for this test/consumable');
    }
    throw err;
  }
  return c.json({ id }, 201);
});

app.delete('/test-consumables/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const allowed = await tenantLabGroups(c.env.DB, user);
  if (allowed !== null) {
    const [m] = await db
      .select({ labGroupId: labTestConsumables.labGroupId })
      .from(labTestConsumables)
      .where(eq(labTestConsumables.id, id))
      .limit(1);
    if (!m) throw new NotFoundError('Mapping not found');
    if (m.labGroupId === null || !allowed.includes(m.labGroupId)) {
      throw new ForbiddenError('Mapping belongs to a different tenant (or is platform-wide and admin-only)');
    }
  }
  await db.delete(labTestConsumables).where(eq(labTestConsumables.id, id));
  return c.json({ id, deleted: true });
});

// ─── POST /backfill — historical consumption backfill ─────────────────────
//
// Walks the last N days of lab_orders that were created BEFORE the
// auto-consume hook was wired up and applies consumption retroactively.
//
//   ?dryRun=1   (default)  — return what WOULD be consumed
//   ?commit=1              — actually run autoConsumeForLabOrder for each
//   ?days=N                — lookback window (default 30)
//
// Idempotent: a marker movement (movementType=ADJUST, reason starting with
// "BACKFILL:") is written so re-running won't double-consume orders that
// already have inventory tied to them via auto-consume.
//
// Admin-only.
app.post('/backfill', async (c) => {
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Backfill is admin-only');
  const db = getDb(c.env.DB);
  const { dryRun, commit, days } = c.req.query();
  const commitMode = commit === '1' || commit === 'true';
  const lookbackDays = Number(days) || 30;
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Find candidate lab_orders within window that have no related
  // lab_stock_movements (i.e., never auto-consumed). We approximate
  // "no consumption" via NOT EXISTS in the movements table.
  const candidates = await db.run(sql.raw(`
    SELECT lo.id, lo.kit_site_id, lo.lab_group_id, lo.created_at
    FROM lab_orders lo
    WHERE lo.created_at >= '${cutoff.replace(/'/g, "''")}'
      AND lo.kit_site_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM lab_stock_movements m
        WHERE m.related_lab_order_id = lo.id
      )
    ORDER BY lo.created_at ASC
    LIMIT 500
  `));
  const rows: any[] = candidates.results ?? [];

  if (!commitMode) {
    return c.json({
      mode: 'dry-run',
      lookbackDays,
      candidateCount: rows.length,
      candidates: rows.slice(0, 100),
      message: 'Re-run with ?commit=1 to apply.',
    });
  }

  // COMMIT mode — import the service lazily to avoid top-of-file coupling.
  const { autoConsumeForLabOrder } = await import('../services/labInventoryService');

  const results: Array<{ labOrderId: string; ok: boolean; attempted: number; fullyIssued: number; shortages: number; error?: string }> = [];
  for (const row of rows) {
    try {
      const items = await db.run(sql.raw(`
        SELECT test_code, quantity FROM lab_order_items
        WHERE lab_order_id = '${row.id.replace(/'/g, "''")}'
          AND test_code IS NOT NULL
      `));
      const r = await autoConsumeForLabOrder(c.env.DB, {
        labOrderId: row.id,
        siteId: row.kit_site_id,
        labGroupId: row.lab_group_id,
        items: (items.results ?? []).map((i: any) => ({ testCode: i.test_code, quantity: Number(i.quantity) })),
        performedByUserId: user.id,
      });
      results.push({
        labOrderId: row.id,
        ok: true,
        attempted: r.attempted,
        fullyIssued: r.fullyIssued,
        shortages: r.shortages.length,
      });
    } catch (err: any) {
      results.push({
        labOrderId: row.id,
        ok: false,
        attempted: 0,
        fullyIssued: 0,
        shortages: 0,
        error: String(err?.message ?? err),
      });
    }
  }

  return c.json({
    mode: 'commit',
    lookbackDays,
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    totalShortages: results.reduce((s, r) => s + r.shortages, 0),
    results,
  });
});

export default app;
