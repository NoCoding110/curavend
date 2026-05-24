/**
 * /api/reporting/cross-site-inventory — one row per (consumable × site)
 * for every site in the hospital/vendor tenant, plus a roll-up of
 * total-on-hand across all sites.
 *
 * Source: lab_inventory_lots + lab_kit_sites + lab_consumables.
 *
 * Filters:
 *   ?category=     — lab consumable category
 *   ?belowReorder=1 — only items with at least one site below reorder point
 *   ?hospitalId=   — admin only
 *
 * Returns shape:
 *   {
 *     items: [
 *       { consumableId, itemCode, description, totalOnHand,
 *         sites: [{ siteId, siteName, onHand, status }] },
 *     ],
 *     sitesIndex: [{ id, name }],
 *   }
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { labConsumables, labInventoryLots, labKitSites, labGroups } from '@curavend/db';
import { ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

app.get('/', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { category, belowReorder } = c.req.query();

  // Determine which kit sites are in scope.
  let siteRows;
  if (isAdmin(user)) {
    siteRows = await db.select().from(labKitSites).limit(1000);
  } else if (user.labGroupId) {
    siteRows = await db.select().from(labKitSites).where(eq(labKitSites.labGroupId, user.labGroupId));
  } else if (user.vendorId) {
    const grps = await db.select({ id: labGroups.id }).from(labGroups).where(eq(labGroups.vendorId, user.vendorId));
    const groupIds = grps.map((g) => g.id);
    if (groupIds.length === 0) return c.json({ items: [], sitesIndex: [] });
    siteRows = await db.select().from(labKitSites).where(inArray(labKitSites.labGroupId, groupIds));
  } else {
    throw new ForbiddenError('Cross-site inventory requires lab or vendor scope');
  }

  if (siteRows.length === 0) return c.json({ items: [], sitesIndex: [] });

  const sitesIndex = siteRows.map((s) => ({ id: s.id, name: s.siteName }));
  const siteIds = sitesIndex.map((s) => s.id);

  // Build aggregate (consumableId × siteId).
  const conds: any[] = [
    eq(labConsumables.isActive, 1),
    eq(labInventoryLots.status, 'ACTIVE'),
    inArray(labInventoryLots.siteId, siteIds),
  ];
  if (category) conds.push(eq(labConsumables.category, category));

  const rows = await db
    .select({
      consumableId: labConsumables.id,
      itemCode: labConsumables.itemCode,
      description: labConsumables.description,
      category: labConsumables.category,
      reorderPoint: labConsumables.reorderPoint,
      minThreshold: labConsumables.minThreshold,
      siteId: labInventoryLots.siteId,
      onHand: sql<number>`COALESCE(SUM(${labInventoryLots.quantityOnHand}), 0)`,
    })
    .from(labConsumables)
    .innerJoin(labInventoryLots, eq(labInventoryLots.consumableId, labConsumables.id))
    .where(and(...conds))
    .groupBy(labConsumables.id, labInventoryLots.siteId);

  // Pivot into a per-consumable row with sites array + total.
  const consumables = new Map<string, any>();
  for (const r of rows) {
    if (!consumables.has(r.consumableId)) {
      consumables.set(r.consumableId, {
        consumableId: r.consumableId,
        itemCode: r.itemCode,
        description: r.description,
        category: r.category,
        reorderPoint: r.reorderPoint,
        minThreshold: r.minThreshold,
        totalOnHand: 0,
        sites: [] as any[],
      });
    }
    const c = consumables.get(r.consumableId)!;
    const onHand = Number(r.onHand) || 0;
    c.totalOnHand += onHand;
    const status = r.reorderPoint != null && onHand <= r.reorderPoint
      ? (r.minThreshold != null && onHand < r.minThreshold ? 'CRITICAL' : 'LOW')
      : 'OK';
    c.sites.push({ siteId: r.siteId, onHand, status });
  }

  let items = Array.from(consumables.values());
  if (belowReorder === '1') {
    items = items.filter((c: any) => c.sites.some((s: any) => s.status !== 'OK'));
  }
  items.sort((a: any, b: any) => a.description.localeCompare(b.description));

  return c.json({ items, sitesIndex });
});

export default app;
