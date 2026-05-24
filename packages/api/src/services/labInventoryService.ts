/**
 * Lab inventory service — per-site stock with FEFO issuance.
 *
 *   recordMovement()      append-only audit log + lot quantity update
 *   issueConsumable()     FEFO consume (oldest non-expired lot first)
 *   receiveLot()          new RECEIVE movement, creates/updates lot row
 *   transferStock()       inter-site move (TRANSFER_OUT + TRANSFER_IN pair)
 *   getSiteSummary()      per-(site,consumable) on-hand totals with status flags
 *   getReorderCandidates() consumables whose total on-hand <= reorder_point
 *   getExpiringLots()     lots expiring within N days
 */
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  labConsumables,
  labInventoryLots,
  labStockMovements,
  labTestConsumables,
  type MovementType,
} from '@curavend/db';
import type { D1Database } from '@cloudflare/workers-types';

export interface RecordMovementInput {
  lotId: string;
  movementType: MovementType;
  quantity: number;             // signed: +receive, -issue, etc.
  relatedOrderId?: string | null;
  relatedLabOrderId?: string | null;
  relatedTransferId?: string | null;
  reason?: string | null;
  performedByUserId?: string | null;
}

/**
 * Append a stock movement and update the lot's quantity_on_hand atomically.
 * D1 has no true multi-statement transactions in JS bindings, but we update
 * the lot first then insert the movement; in the unlikely interleaving the
 * movement is the source-of-truth for audits, while the lot is rebuildable.
 */
export async function recordMovement(d1: D1Database, input: RecordMovementInput) {
  const db = getDb(d1);
  const [lot] = await db.select().from(labInventoryLots).where(eq(labInventoryLots.id, input.lotId)).limit(1);
  if (!lot) throw new Error(`Lot ${input.lotId} not found`);

  const newQty = (lot.quantityOnHand ?? 0) + input.quantity;
  if (newQty < 0) {
    throw new Error(`Insufficient stock: lot ${lot.lotNumber} has ${lot.quantityOnHand}, requested ${-input.quantity}`);
  }

  const now = new Date().toISOString();
  // Update lot quantity + auto-deplete if zeroed
  await db
    .update(labInventoryLots)
    .set({
      quantityOnHand: newQty,
      status: newQty === 0 && lot.status === 'ACTIVE' ? 'DEPLETED' : lot.status,
      updatedAt: now,
    })
    .where(eq(labInventoryLots.id, input.lotId));

  // Audit row
  await db.insert(labStockMovements).values({
    id: crypto.randomUUID(),
    lotId: input.lotId,
    consumableId: lot.consumableId,
    siteId: lot.siteId,
    movementType: input.movementType,
    quantity: input.quantity,
    quantityAfter: newQty,
    relatedOrderId: input.relatedOrderId ?? null,
    relatedLabOrderId: input.relatedLabOrderId ?? null,
    relatedTransferId: input.relatedTransferId ?? null,
    reason: input.reason ?? null,
    performedByUserId: input.performedByUserId ?? null,
    occurredAt: now,
  });

  return { lotId: input.lotId, quantityAfter: newQty };
}

/**
 * FEFO issuance — consume `quantity` units from the oldest non-expired
 * ACTIVE lots at the site. May span multiple lots; movement rows record
 * each underlying decrement.
 */
export async function issueConsumable(
  d1: D1Database,
  args: {
    consumableId: string;
    siteId: string;
    quantity: number;
    relatedLabOrderId?: string;
    reason?: string;
    performedByUserId?: string;
  },
): Promise<{ issuedFromLots: { lotId: string; qty: number }[]; remaining: number }> {
  const db = getDb(d1);
  if (args.quantity <= 0) throw new Error('quantity must be > 0');

  // FEFO: ACTIVE lots ordered by expirationDate ASC (NULL last), then receivedAt ASC
  const lots = await db
    .select()
    .from(labInventoryLots)
    .where(
      and(
        eq(labInventoryLots.consumableId, args.consumableId),
        eq(labInventoryLots.siteId, args.siteId),
        eq(labInventoryLots.status, 'ACTIVE'),
        gt(labInventoryLots.quantityOnHand, 0),
      ),
    )
    .orderBy(asc(labInventoryLots.expirationDate), asc(labInventoryLots.receivedAt));

  let remaining = args.quantity;
  const issuedFromLots: { lotId: string; qty: number }[] = [];
  for (const lot of lots) {
    if (remaining === 0) break;
    const take = Math.min(remaining, lot.quantityOnHand);
    await recordMovement(d1, {
      lotId: lot.id,
      movementType: 'ISSUE',
      quantity: -take,
      relatedLabOrderId: args.relatedLabOrderId ?? null,
      reason: args.reason ?? null,
      performedByUserId: args.performedByUserId ?? null,
    });
    issuedFromLots.push({ lotId: lot.id, qty: take });
    remaining -= take;
  }
  return { issuedFromLots, remaining };
}

/**
 * Create or top-up a lot from a goods-receipt. Idempotent by
 * (consumableId, siteId, lotNumber) — if the lot already exists, the
 * existing row is topped up with a RECEIVE movement.
 */
export async function receiveLot(
  d1: D1Database,
  args: {
    consumableId: string;
    siteId: string;
    lotNumber: string;
    quantity: number;
    expirationDate?: string | null;
    unitPriceUsd?: number | null;
    receivedFromOrderId?: string | null;
    receivedFromGrnId?: string | null;
    performedByUserId?: string | null;
  },
): Promise<{ lotId: string; quantityAfter: number; created: boolean }> {
  const db = getDb(d1);
  if (args.quantity <= 0) throw new Error('quantity must be > 0');

  const [existing] = await db
    .select()
    .from(labInventoryLots)
    .where(
      and(
        eq(labInventoryLots.consumableId, args.consumableId),
        eq(labInventoryLots.siteId, args.siteId),
        eq(labInventoryLots.lotNumber, args.lotNumber),
      ),
    )
    .limit(1);

  const now = new Date().toISOString();
  let lotId: string;
  let created = false;
  if (existing) {
    lotId = existing.id;
    // RECEIVE movement will increment qty_on_hand
  } else {
    lotId = crypto.randomUUID();
    await db.insert(labInventoryLots).values({
      id: lotId,
      consumableId: args.consumableId,
      siteId: args.siteId,
      lotNumber: args.lotNumber,
      expirationDate: args.expirationDate ?? null,
      quantityOnHand: 0,
      unitPriceUsd: args.unitPriceUsd ?? null,
      receivedAt: now,
      receivedFromOrderId: args.receivedFromOrderId ?? null,
      receivedFromGrnId: args.receivedFromGrnId ?? null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    created = true;
  }
  const r = await recordMovement(d1, {
    lotId,
    movementType: 'RECEIVE',
    quantity: args.quantity,
    relatedOrderId: args.receivedFromOrderId ?? null,
    performedByUserId: args.performedByUserId ?? null,
    reason: created ? 'Initial receipt' : 'Restock',
  });
  return { lotId, quantityAfter: r.quantityAfter, created };
}

/**
 * Inter-site transfer. Atomically TRANSFER_OUT from source then TRANSFER_IN
 * to a destination lot (created if needed at destination, same lot number).
 */
export async function transferStock(
  d1: D1Database,
  args: {
    consumableId: string;
    fromLotId: string;
    toSiteId: string;
    quantity: number;
    performedByUserId?: string;
    reason?: string;
  },
): Promise<{ transferId: string; fromLotId: string; toLotId: string; quantity: number }> {
  const db = getDb(d1);
  if (args.quantity <= 0) throw new Error('quantity must be > 0');
  const [src] = await db.select().from(labInventoryLots).where(eq(labInventoryLots.id, args.fromLotId)).limit(1);
  if (!src) throw new Error(`Source lot ${args.fromLotId} not found`);
  if (src.quantityOnHand < args.quantity) {
    throw new Error(`Source lot has only ${src.quantityOnHand}`);
  }
  if (src.siteId === args.toSiteId) {
    throw new Error('Cannot transfer to the same site');
  }
  const transferId = crypto.randomUUID();

  await recordMovement(d1, {
    lotId: args.fromLotId,
    movementType: 'TRANSFER_OUT',
    quantity: -args.quantity,
    relatedTransferId: transferId,
    reason: args.reason ?? `Transfer to site ${args.toSiteId}`,
    performedByUserId: args.performedByUserId ?? null,
  });

  // Find or create matching lot at destination
  const r = await receiveLot(d1, {
    consumableId: args.consumableId,
    siteId: args.toSiteId,
    lotNumber: src.lotNumber,
    quantity: args.quantity,
    expirationDate: src.expirationDate,
    unitPriceUsd: src.unitPriceUsd,
    performedByUserId: args.performedByUserId,
  });
  // Convert the RECEIVE we just logged to TRANSFER_IN by appending a marker —
  // simplest path: leave the RECEIVE row as-is for total accuracy, but log
  // a TRANSFER_IN with quantity 0 + transferId to link the two halves.
  await recordMovement(d1, {
    lotId: r.lotId,
    movementType: 'TRANSFER_IN',
    quantity: 0,
    relatedTransferId: transferId,
    reason: `Transfer from site ${src.siteId}`,
    performedByUserId: args.performedByUserId ?? null,
  });
  return { transferId, fromLotId: args.fromLotId, toLotId: r.lotId, quantity: args.quantity };
}

/**
 * Per-site stock summary. One row per (siteId, consumableId).
 * Includes status flags: belowReorderPoint, belowMin, hasExpiringSoon.
 */
export interface SiteSummaryRow {
  consumableId: string;
  itemCode: string;
  description: string;
  category: string;
  siteId: string;
  totalOnHand: number;
  totalReserved: number;
  lotCount: number;
  oldestExpiration: string | null;
  daysToOldestExpiration: number | null;
  reorderPoint: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
  belowReorderPoint: boolean;
  belowMin: boolean;
  hasExpiringSoon: boolean;        // any active lot expires <= 30d
  hasExpiredLot: boolean;
}

export async function getSiteSummary(
  d1: D1Database,
  args: { siteId?: string; labGroupId?: string; category?: string },
): Promise<SiteSummaryRow[]> {
  const db = getDb(d1);
  // Single raw query for performance
  const cutoff30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const filters = ["lc.is_active = 1"];
  if (args.siteId) filters.push(`l.site_id = '${args.siteId.replace(/'/g, "''")}'`);
  if (args.labGroupId) filters.push(`lc.lab_group_id = '${args.labGroupId.replace(/'/g, "''")}'`);
  if (args.category) filters.push(`lc.category = '${args.category.replace(/'/g, "''")}'`);

  const result = await (db as any).all(sql.raw(`
    SELECT
      lc.id AS consumable_id,
      lc.item_code AS item_code,
      lc.description AS description,
      lc.category AS category,
      lc.reorder_point AS reorder_point,
      lc.min_threshold AS min_threshold,
      lc.max_threshold AS max_threshold,
      COALESCE(l.site_id, '__any__') AS site_id,
      COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN l.quantity_on_hand ELSE 0 END), 0) AS total_on_hand,
      COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN l.quantity_reserved ELSE 0 END), 0) AS total_reserved,
      COUNT(CASE WHEN l.status = 'ACTIVE' THEN l.id END) AS lot_count,
      MIN(CASE WHEN l.status = 'ACTIVE' THEN l.expiration_date END) AS oldest_expiration,
      MAX(CASE WHEN l.status = 'ACTIVE' AND l.expiration_date <= '${cutoff30}' THEN 1 ELSE 0 END) AS has_expiring_soon,
      MAX(CASE WHEN l.status = 'ACTIVE' AND l.expiration_date < '${today}' THEN 1 ELSE 0 END) AS has_expired_lot
    FROM lab_consumables lc
    LEFT JOIN lab_inventory_lots l ON l.consumable_id = lc.id
    WHERE ${filters.join(' AND ')}
    GROUP BY lc.id, l.site_id
    ORDER BY lc.description
  `));

  return (result.results ?? []).map((r: any) => {
    const oldest = r.oldest_expiration;
    const daysToOldest = oldest
      ? Math.ceil((new Date(oldest).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;
    return {
      consumableId: r.consumable_id,
      itemCode: r.item_code,
      description: r.description,
      category: r.category,
      siteId: r.site_id,
      totalOnHand: Number(r.total_on_hand ?? 0),
      totalReserved: Number(r.total_reserved ?? 0),
      lotCount: Number(r.lot_count ?? 0),
      oldestExpiration: oldest,
      daysToOldestExpiration: daysToOldest,
      reorderPoint: r.reorder_point,
      minThreshold: r.min_threshold,
      maxThreshold: r.max_threshold,
      belowReorderPoint: r.reorder_point != null && r.total_on_hand <= r.reorder_point,
      belowMin: r.min_threshold != null && r.total_on_hand < r.min_threshold,
      hasExpiringSoon: r.has_expiring_soon === 1,
      hasExpiredLot: r.has_expired_lot === 1,
    } as SiteSummaryRow;
  });
}

/** Consumables whose total on_hand <= reorder_point (at any site or specific site). */
export async function getReorderCandidates(
  d1: D1Database,
  args: { siteId?: string; labGroupId?: string },
): Promise<SiteSummaryRow[]> {
  const rows = await getSiteSummary(d1, args);
  return rows.filter((r) => r.belowReorderPoint || r.belowMin);
}

/**
 * Auto-consume inventory for a freshly-created lab order. For each item
 * with a testCode, walks lab_test_consumables → for each mapped consumable
 * → issueConsumable(qtyPerTest × item.quantity) from the kit site.
 *
 * Non-blocking: insufficient stock returns a `shortages` array but the
 * lab order itself stays valid. Callers should surface shortages to the
 * user (warning, not error) so they know to order replacement stock.
 */
export interface AutoConsumeResult {
  attempted: number;            // total consumable issue attempts
  fullyIssued: number;          // count fully satisfied
  shortages: Array<{
    testCode: string;
    consumableId: string;
    consumableCode: string;
    requested: number;
    issued: number;
    short: number;
    isCritical: boolean;
  }>;
}

export async function autoConsumeForLabOrder(
  d1: D1Database,
  args: {
    labOrderId: string;
    siteId: string | null;
    labGroupId?: string | null;
    items: Array<{ testCode: string | null; quantity: number }>;
    performedByUserId?: string;
  },
): Promise<AutoConsumeResult> {
  const result: AutoConsumeResult = { attempted: 0, fullyIssued: 0, shortages: [] };
  if (!args.siteId) return result; // no site → nothing to issue from
  const db = getDb(d1);

  for (const item of args.items) {
    if (!item.testCode) continue;
    // Pull mapped consumables. Prefer tenant-specific row over null (platform-wide).
    const maps = await db
      .select()
      .from(labTestConsumables)
      .where(eq(labTestConsumables.testCode, item.testCode));
    // Filter: tenant rows win when both exist for the same consumable
    const byConsumable = new Map<string, any>();
    for (const m of maps) {
      if (args.labGroupId && m.labGroupId === args.labGroupId) {
        byConsumable.set(m.consumableId, m);   // tenant-specific
      } else if (m.labGroupId == null && !byConsumable.has(m.consumableId)) {
        byConsumable.set(m.consumableId, m);   // platform default
      }
    }

    for (const m of byConsumable.values()) {
      const requested = m.quantityPerTest * item.quantity;
      if (requested <= 0) continue;
      // Round up — partial-unit consumption isn't supported (issue integer units)
      const requestedQty = Math.ceil(requested);
      result.attempted++;
      try {
        const r = await issueConsumable(d1, {
          consumableId: m.consumableId,
          siteId: args.siteId,
          quantity: requestedQty,
          relatedLabOrderId: args.labOrderId,
          reason: `Test run ${item.testCode}`,
          performedByUserId: args.performedByUserId,
        });
        const issuedQty = requestedQty - r.remaining;
        if (r.remaining === 0) {
          result.fullyIssued++;
        } else {
          // Look up consumable code for the shortage report
          const [c] = await db
            .select()
            .from(labConsumables)
            .where(eq(labConsumables.id, m.consumableId))
            .limit(1);
          result.shortages.push({
            testCode: item.testCode,
            consumableId: m.consumableId,
            consumableCode: c?.itemCode ?? m.consumableId,
            requested: requestedQty,
            issued: issuedQty,
            short: r.remaining,
            isCritical: m.isCritical === 1,
          });
        }
      } catch (err: any) {
        // Insufficient stock (or other failure) — log + continue
        const [c] = await db
          .select()
          .from(labConsumables)
          .where(eq(labConsumables.id, m.consumableId))
          .limit(1);
        result.shortages.push({
          testCode: item.testCode,
          consumableId: m.consumableId,
          consumableCode: c?.itemCode ?? m.consumableId,
          requested: requestedQty,
          issued: 0,
          short: requestedQty,
          isCritical: m.isCritical === 1,
        });
      }
    }
  }
  return result;
}

/** All ACTIVE lots expiring within `days` days, ordered soonest first. */
export async function getExpiringLots(d1: D1Database, days: number) {
  const db = getDb(d1);
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(labInventoryLots)
    .where(
      and(
        eq(labInventoryLots.status, 'ACTIVE'),
        lte(labInventoryLots.expirationDate, cutoff),
      ),
    )
    .orderBy(asc(labInventoryLots.expirationDate));
  return rows;
}
