/**
 * /api/lab-movements — search across all stock movements with filters.
 *
 * The /api/lab-inventory routes expose movements scoped to one lot or one
 * site; this route supports the audit page which needs multi-filter search:
 * site + consumable + movement type + date range.
 *
 * TENANT SCOPING:
 *   - Admin (ACCOUNT_MANAGER / _USER): unrestricted.
 *   - Lab persona (LAB_ACCOUNT_MANAGER / _USER) with labGroupId on JWT:
 *       movements are restricted via JOIN lab_kit_sites → lab_group_id.
 *   - Vendor persona with vendorId on JWT: restricted via JOIN
 *       lab_kit_sites → lab_groups → vendor_id (labs are vendor-owned).
 *   - Any other persona (hospital, provider, etc): forbidden (403).
 *
 * This protects against cross-tenant data leakage between independent labs.
 */
import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { labStockMovements, labKitSites, labGroups, MOVEMENT_TYPES } from '@curavend/db';
import { ForbiddenError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}
function isLabRole(u: AuthUser): boolean {
  return u.role === 'LAB_ACCOUNT_MANAGER' || u.role === 'LAB_ACCOUNT_MANAGER_USER';
}

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { siteId, consumableId, movementType, fromDate, toDate, limit } = c.req.query();

  // Determine tenant filter
  const admin = isAdmin(user);
  const labScope = !admin && isLabRole(user) && user.labGroupId ? user.labGroupId : null;
  const vendorScope = !admin && !labScope && user.vendorId ? user.vendorId : null;

  if (!admin && !labScope && !vendorScope) {
    // Persona has no lab/vendor scope on JWT — deny rather than leak.
    throw new ForbiddenError('Lab stock movements are restricted to lab and vendor personas');
  }

  const conds: any[] = [];
  if (siteId) conds.push(eq(labStockMovements.siteId, siteId));
  if (consumableId) conds.push(eq(labStockMovements.consumableId, consumableId));
  if (movementType && (MOVEMENT_TYPES as readonly string[]).includes(movementType)) {
    conds.push(eq(labStockMovements.movementType, movementType));
  }
  if (fromDate) conds.push(gte(labStockMovements.occurredAt, fromDate));
  if (toDate) conds.push(lte(labStockMovements.occurredAt, toDate));

  const cap = Math.min(Number(limit) || 500, 2000);

  // Admin → simple query.
  if (admin) {
    const rows = await db
      .select()
      .from(labStockMovements)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(labStockMovements.occurredAt))
      .limit(cap);
    return c.json({ items: rows });
  }

  // Lab/vendor scoped → JOIN through lab_kit_sites (and lab_groups for vendor).
  if (labScope) {
    conds.push(eq(labKitSites.labGroupId, labScope));
    const rows = await db
      .select({
        id: labStockMovements.id,
        lotId: labStockMovements.lotId,
        consumableId: labStockMovements.consumableId,
        siteId: labStockMovements.siteId,
        movementType: labStockMovements.movementType,
        quantity: labStockMovements.quantity,
        quantityAfter: labStockMovements.quantityAfter,
        relatedOrderId: labStockMovements.relatedOrderId,
        relatedLabOrderId: labStockMovements.relatedLabOrderId,
        relatedTransferId: labStockMovements.relatedTransferId,
        reason: labStockMovements.reason,
        performedByUserId: labStockMovements.performedByUserId,
        occurredAt: labStockMovements.occurredAt,
      })
      .from(labStockMovements)
      .innerJoin(labKitSites, eq(labKitSites.id, labStockMovements.siteId))
      .where(and(...conds))
      .orderBy(desc(labStockMovements.occurredAt))
      .limit(cap);
    return c.json({ items: rows });
  }

  // Vendor scope: JOIN sites → groups → vendor.
  conds.push(eq(labGroups.vendorId, vendorScope!));
  const rows = await db
    .select({
      id: labStockMovements.id,
      lotId: labStockMovements.lotId,
      consumableId: labStockMovements.consumableId,
      siteId: labStockMovements.siteId,
      movementType: labStockMovements.movementType,
      quantity: labStockMovements.quantity,
      quantityAfter: labStockMovements.quantityAfter,
      relatedOrderId: labStockMovements.relatedOrderId,
      relatedLabOrderId: labStockMovements.relatedLabOrderId,
      relatedTransferId: labStockMovements.relatedTransferId,
      reason: labStockMovements.reason,
      performedByUserId: labStockMovements.performedByUserId,
      occurredAt: labStockMovements.occurredAt,
    })
    .from(labStockMovements)
    .innerJoin(labKitSites, eq(labKitSites.id, labStockMovements.siteId))
    .innerJoin(labGroups, eq(labGroups.id, labKitSites.labGroupId))
    .where(and(...conds))
    .orderBy(desc(labStockMovements.occurredAt))
    .limit(cap);
  return c.json({ items: rows });
});

export default app;
