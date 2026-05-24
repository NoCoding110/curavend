/**
 * Lab replenishment + forecasting service.
 *
 * Two distinct concerns:
 *
 * 1) Usage-based forecasting (consumption-driven). Walks `lab_test_consumables`
 *    (per-test consumable map) + recent `lab_orders` to estimate 30-day demand
 *    per consumable per site. The model is intentionally simple: average
 *    daily consumption over the trailing 60 days, multiplied by 30, gives
 *    a 30-day projected demand. Tests with no map row contribute zero.
 *
 * 2) Auto-replenishment. Walks `getReorderCandidates()` results; for each item
 *    whose on-hand ≤ reorder_point, creates a requisition (one per
 *    distinct preferred-vendor batch) routed through the existing approval
 *    rules engine.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  labConsumables,
  labInventoryLots,
  labTestConsumables,
  labOrders,
  labKitSites,
  requisitions,
  requisitionItems,
  requisitionHistory,
} from '@curavend/db';
import type { Env } from '../lib/env';
import { getReorderCandidates } from './labInventoryService';
import { getNextValue, ensureSequenceTable } from './sequenceService';
import { pickPrimaryApprover } from './approvalRuleEngine';

export interface ForecastRow {
  consumableId: string;
  itemCode: string;
  description: string;
  siteId: string | null;
  testsInPeriod: number;
  consumedInPeriod: number;
  avgDailyConsumption: number;
  projected30Day: number;
  currentOnHand: number;
  daysOfSupply: number | null;       // null when avgDaily is 0
  reorderPoint: number | null;
  suggestedOrderQty: number;
}

/**
 * Compute a 30-day forecast per consumable using lab_orders × test_consumables
 * mapping, scaled by avg daily consumption over the trailing 60 days.
 */
export async function forecastDemand(env: Env, opts: { siteId?: string; labGroupId?: string } = {}): Promise<ForecastRow[]> {
  const db = getDb(env.DB);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Pull recent lab orders (test runs). lab_orders schema varies; we read
  // testCode and createdAt + labSiteId where available.
  const filters: any[] = [gte(labOrders.createdAt, sixtyDaysAgo)];
  if (opts.siteId) filters.push(eq((labOrders as any).kitSiteId, opts.siteId));
  const orders = await db.select().from(labOrders).where(and(...filters)).limit(20000);

  // Group test counts by (testCode, siteId)
  const testCountMap = new Map<string, number>(); // key = `${testCode}|${siteId}`
  for (const o of orders as any[]) {
    const key = `${o.testCode ?? o.testType ?? 'UNKNOWN'}|${o.kitSiteId ?? o.siteId ?? ''}`;
    testCountMap.set(key, (testCountMap.get(key) ?? 0) + 1);
  }

  // Pull test→consumable map (optionally filtered by labGroupId)
  const mapRows = opts.labGroupId
    ? await db.select().from(labTestConsumables).where(eq(labTestConsumables.labGroupId, opts.labGroupId))
    : await db.select().from(labTestConsumables);

  // Project consumption: for each (testCode, siteId), sum qtyPerTest × count
  // Group by consumableId+siteId.
  const consumptionMap = new Map<string, { qty: number; tests: number }>();
  for (const m of mapRows) {
    for (const [key, count] of testCountMap.entries()) {
      const [testCode, siteId] = key.split('|');
      if (m.testCode !== testCode) continue;
      const ckey = `${m.consumableId}|${siteId}`;
      const prev = consumptionMap.get(ckey) ?? { qty: 0, tests: 0 };
      consumptionMap.set(ckey, {
        qty: prev.qty + count * m.quantityPerTest,
        tests: prev.tests + count,
      });
    }
  }

  // Pull current on-hand per (consumableId, siteId) — aggregate ACTIVE lots
  const lots = await db.select().from(labInventoryLots).where(eq(labInventoryLots.status, 'ACTIVE'));
  const onHandMap = new Map<string, number>();
  for (const l of lots) {
    const k = `${l.consumableId}|${l.siteId}`;
    onHandMap.set(k, (onHandMap.get(k) ?? 0) + (l.quantityOnHand ?? 0));
  }

  // Pull consumable catalog rows we care about
  const consumableIds = Array.from(new Set(Array.from(consumptionMap.keys()).map((k) => k.split('|')[0])));
  const catalog = consumableIds.length
    ? await db.select().from(labConsumables).where(inArray(labConsumables.id, consumableIds))
    : [];
  const catalogMap = new Map(catalog.map((c) => [c.id, c]));

  const out: ForecastRow[] = [];
  for (const [key, { qty, tests }] of consumptionMap.entries()) {
    const [consumableId, siteId] = key.split('|');
    const c = catalogMap.get(consumableId);
    if (!c) continue;
    const avgDaily = qty / 60;
    const projected30 = Math.ceil(avgDaily * 30);
    const onHand = onHandMap.get(key) ?? 0;
    const daysOfSupply = avgDaily > 0 ? Math.floor(onHand / avgDaily) : null;
    let suggested = 0;
    if (c.reorderPoint != null && onHand <= c.reorderPoint) {
      // Order enough to reach maxThreshold (or 2× reorderPoint as fallback)
      const target = c.maxThreshold ?? c.reorderPoint * 2;
      suggested = Math.max(0, target - onHand);
      if (c.reorderQuantity && suggested < c.reorderQuantity) suggested = c.reorderQuantity;
    }
    out.push({
      consumableId,
      itemCode: c.itemCode,
      description: c.description,
      siteId: siteId || null,
      testsInPeriod: tests,
      consumedInPeriod: qty,
      avgDailyConsumption: Math.round(avgDaily * 100) / 100,
      projected30Day: projected30,
      currentOnHand: onHand,
      daysOfSupply,
      reorderPoint: c.reorderPoint,
      suggestedOrderQty: suggested,
    });
  }

  return out.sort((a, b) => (a.daysOfSupply ?? 9999) - (b.daysOfSupply ?? 9999));
}

/**
 * Cron: walk reorder candidates and auto-create requisitions.
 *
 * For each lab_group_id (or per-hospital), group items by preferredVendorId
 * and create one requisition per (hospital × vendor) batch. Routes through
 * the existing approval rules engine to pick an approver.
 *
 * Idempotency: a requisition with title `Auto-replen YYYY-MM-DD [<group>]`
 * already created today is skipped (prevents daily-cron double-spawn).
 */
export async function handleLabAutoReplenishment(env: Env): Promise<{
  itemsConsidered: number;
  requisitionsCreated: number;
  skippedExisting: number;
  errors: number;
}> {
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);

  // Pull all reorder candidates across all sites
  const candidates = await getReorderCandidates(env.DB, {});
  let itemsConsidered = candidates.length;
  let requisitionsCreated = 0;
  let skippedExisting = 0;
  let errors = 0;

  // Need to know the hospital for each site. lab_kit_sites carries a labGroupId,
  // and lab_groups carries hospitalId. Pull both.
  const siteIds = Array.from(new Set(candidates.map((c) => c.siteId).filter(Boolean)));
  if (siteIds.length === 0) return { itemsConsidered, requisitionsCreated, skippedExisting, errors };

  const sites = await db.select().from(labKitSites).where(inArray(labKitSites.id, siteIds));
  const siteHospitalMap = new Map<string, string | null>();
  for (const s of sites as any[]) {
    siteHospitalMap.set(s.id, s.hospitalId ?? s.labGroupId ?? null);
  }

  // Pull catalog rows for preferred-vendor lookup
  const consumableIds = Array.from(new Set(candidates.map((c) => c.consumableId)));
  const catalog = consumableIds.length
    ? await db.select().from(labConsumables).where(inArray(labConsumables.id, consumableIds))
    : [];
  const catalogMap = new Map(catalog.map((c) => [c.id, c]));

  // Group: (hospitalId, vendorId) -> [{consumable, qty}, ...]
  const batches = new Map<string, { hospitalId: string; vendorId: string | null; items: any[] }>();
  for (const c of candidates) {
    const hospitalId = siteHospitalMap.get(c.siteId);
    if (!hospitalId) continue;
    const cat = catalogMap.get(c.consumableId);
    const vendorId = cat?.preferredVendorId ?? null;
    const targetQty = (cat?.maxThreshold ?? (c.reorderPoint ?? 0) * 2) - c.totalOnHand;
    const orderQty = Math.max(cat?.reorderQuantity ?? 0, targetQty);
    if (orderQty <= 0) continue;
    const key = `${hospitalId}|${vendorId ?? 'NONE'}`;
    if (!batches.has(key)) batches.set(key, { hospitalId, vendorId, items: [] });
    batches.get(key)!.items.push({ catalog: cat, summary: c, orderQty });
  }

  await ensureSequenceTable(db);

  for (const [batchKey, batch] of batches) {
    if (batch.items.length === 0) continue;

    // Idempotency: skip if a same-day auto-replen requisition exists for this hospital
    const todayTitle = `Auto-replen ${today} [${batchKey.split('|')[0].slice(0, 8)}…]`;
    const existing = await db
      .select()
      .from(requisitions)
      .where(
        and(
          eq(requisitions.hospitalId, batch.hospitalId),
          eq(requisitions.title, todayTitle),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      skippedExisting++;
      continue;
    }

    try {
      const seq = await getNextValue(db, `requisition_${batch.hospitalId}`);
      const year = new Date().getFullYear();
      const reqNumber = `REQ-${year}-${String(seq).padStart(5, '0')}`;
      const reqId = crypto.randomUUID();
      const now = new Date().toISOString();

      let total = 0;
      const itemsToInsert: any[] = [];
      for (const it of batch.items) {
        const unitPrice = it.catalog?.defaultUnitPriceUsd ?? 0;
        total += unitPrice * it.orderQty;
        itemsToInsert.push({
          id: crypto.randomUUID(),
          requisitionId: reqId,
          hcpcCode: it.catalog?.itemCode ?? 'LAB',
          description: it.catalog?.description ?? 'Lab consumable',
          quantity: it.orderQty,
          estimatedUnitPriceUsd: unitPrice,
          preferredVendorId: batch.vendorId,
          justification: `Auto-replen: on-hand ${it.summary.totalOnHand} below reorder point ${it.summary.reorderPoint ?? '?'}`,
          substitutesAllowed: 1,
          approvalStatus: 'PENDING',
          isOffFormulary: 1,
          requiresPriorAuth: 0,
          createdAt: now,
        });
      }

      // Pick an approver via the rules engine (REQUISITION trigger)
      const approver = await pickPrimaryApprover(env.DB, 'REQUISITION', {
        hospitalId: batch.hospitalId,
        amountUsd: total,
        priority: 'NORMAL',
        containsOffFormulary: true,
      });
      const approverUserId = approver?.type === 'USER' ? approver.id : null;

      await db.insert(requisitions).values({
        id: reqId,
        requisitionNumber: reqNumber,
        hospitalId: batch.hospitalId,
        requestedByUserId: 'system-auto-replen',
        title: todayTitle,
        justification: `Auto-replenishment generated by daily cron on ${today}`,
        status: 'SUBMITTED',
        priority: 'NORMAL',
        estimatedTotalUsd: total,
        approverUserId,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(requisitionItems).values(itemsToInsert);
      await db.insert(requisitionHistory).values({
        id: crypto.randomUUID(),
        requisitionId: reqId,
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'SUBMITTED',
        byUserId: 'system-auto-replen',
        comment: `Auto-created by lab replenishment cron — ${batch.items.length} item(s)`,
        createdAt: now,
      });

      requisitionsCreated++;
    } catch (err) {
      console.error('[lab-replen] batch failed', batchKey, err);
      errors++;
    }
  }

  return { itemsConsidered, requisitionsCreated, skippedExisting, errors };
}

/**
 * Cron: mark expired lots, fire notifications for lots expiring in 30/60/90 days.
 */
export async function handleLabExpiration(env: Env): Promise<{
  expired: number;
  expiringIn30: number;
  expiringIn60: number;
  expiringIn90: number;
}> {
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Mark expired
  const expiredRows = await (db as any).all(sql.raw(`
    SELECT id FROM lab_inventory_lots
    WHERE status = 'ACTIVE' AND expiration_date IS NOT NULL AND expiration_date < '${today}'
  `));
  const expiredIds: string[] = (expiredRows.results ?? []).map((r: any) => r.id);
  if (expiredIds.length > 0) {
    await (db as any).run(sql.raw(`
      UPDATE lab_inventory_lots SET status = 'EXPIRED', updated_at = '${new Date().toISOString()}'
      WHERE id IN (${expiredIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})
    `));
    // Log movements
    for (const id of expiredIds) {
      try {
        await (db as any).run(sql.raw(`
          INSERT INTO lab_stock_movements (id, lot_id, consumable_id, site_id, movement_type, quantity, quantity_after, reason, occurred_at)
          SELECT '${crypto.randomUUID()}', id, consumable_id, site_id, 'EXPIRE', 0, quantity_on_hand, 'Auto-expired by cron', '${new Date().toISOString()}'
          FROM lab_inventory_lots WHERE id = '${id.replace(/'/g, "''")}'
        `));
      } catch { /* noop */ }
    }
  }

  // Count windows for reporting
  const cnt = async (cutoff: string) => {
    const r = await (db as any).all(sql.raw(`
      SELECT COUNT(*) AS n FROM lab_inventory_lots
      WHERE status = 'ACTIVE' AND expiration_date IS NOT NULL
      AND expiration_date <= '${cutoff}' AND expiration_date >= '${today}'
    `));
    return Number(r.results?.[0]?.n ?? 0);
  };
  return {
    expired: expiredIds.length,
    expiringIn30: await cnt(in30),
    expiringIn60: await cnt(in60),
    expiringIn90: await cnt(in90),
  };
}
