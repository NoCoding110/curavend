/**
 * /api/reporting/* — PV3 analytics endpoints.
 *
 *   GET /charge-capture-leakage   POU events without an invoice_item_id
 *   GET /price-variance           PO line unit_price vs contract unit_price
 *   GET /clinical-consumption     rollup by encounter / procedure / dept
 *   GET /hospital-forecast        cached forecast results (run if stale)
 *   POST /hospital-forecast/run   force recompute
 *   GET /vendor-scorecard         snapshot list (filter by vendor, year, period)
 *   POST /vendor-scorecard/compute  manually trigger nightly scorecard cron
 */
import { Hono } from 'hono';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  pointOfUseEvents, orderItems, orders, contracts, contractItems,
  hospitalForecastRuns, vendorScorecardSnapshots,
} from '@curavend/db';
import { ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import { forecastHospitalDemand } from '../services/hospitalForecastService';
import { computeVendorScorecards } from '../services/vendorScorecardService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}
function scopeHospital(c: any): string {
  const u = c.get('user') as AuthUser;
  const id = isAdmin(u) ? c.req.query('hospitalId') ?? u.hospitalId : u.hospitalId;
  if (!id) throw new ForbiddenError('hospitalId required');
  return id;
}

// ─── Charge capture leakage ──────────────────────────────────────────────────
app.get('/charge-capture-leakage', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  const { fromDate, toDate } = c.req.query();
  const conds: any[] = [
    eq(pointOfUseEvents.hospitalId, hospitalId),
    isNull(pointOfUseEvents.invoiceItemId),
    eq(pointOfUseEvents.chargeStatus, 'UNCHARGED'),
  ];
  if (fromDate) conds.push(gte(pointOfUseEvents.capturedAt, fromDate));
  const rows = await db
    .select().from(pointOfUseEvents)
    .where(and(...conds))
    .orderBy(desc(pointOfUseEvents.capturedAt))
    .limit(2000);
  // Estimated $ value of leakage = sum(quantity * unitPriceUsd).
  const totalUsd = rows.reduce((s, r) => s + (r.quantity * (r.unitPriceUsd ?? 0)), 0);
  return c.json({ items: rows, count: rows.length, totalUsd });
});

// ─── Price variance ──────────────────────────────────────────────────────────
// Joins orderItems.unitPrice vs contractItems.unitPrice for matching
// (vendorId × hcpcCode). Reports per-line delta + per-vendor rollup.
app.get('/price-variance', requirePermission('contracts', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  const result = await (db as any).all(sql.raw(`
    SELECT
      o.id AS order_id,
      o.vendor_id,
      oi.code AS hcpc_code,
      oi.description,
      oi.quantity,
      oi.unit_price AS bought_price,
      ci.unit_price_cents / 100.0 AS contract_price,
      (oi.unit_price - ci.unit_price_cents / 100.0) AS delta_per_unit,
      ((oi.unit_price - ci.unit_price_cents / 100.0) * oi.quantity) AS delta_total,
      o.created_at
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    INNER JOIN contracts c ON c.vendor_id = o.vendor_id AND c.hospital_id = o.hospital_id AND c.status = 'ACTIVE'
    INNER JOIN contract_items ci ON ci.contract_id = c.id AND ci.code = oi.code
    WHERE o.hospital_id = '${hospitalId.replace(/'/g, "''")}'
      AND oi.unit_price IS NOT NULL
      AND ci.unit_price_cents IS NOT NULL
      AND ABS(oi.unit_price - ci.unit_price_cents / 100.0) > 0.01
    ORDER BY ABS((oi.unit_price - ci.unit_price_cents / 100.0) * oi.quantity) DESC
    LIMIT 500
  `));
  const items = result.results ?? [];
  // Per-vendor rollup.
  const byVendor: Record<string, { vendorId: string; lineCount: number; totalDelta: number }> = {};
  for (const r of items) {
    const k = r.vendor_id ?? '__unknown__';
    if (!byVendor[k]) byVendor[k] = { vendorId: k, lineCount: 0, totalDelta: 0 };
    byVendor[k].lineCount++;
    byVendor[k].totalDelta += Number(r.delta_total ?? 0);
  }
  return c.json({
    items,
    rollup: Object.values(byVendor).sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta)),
  });
});

// ─── Clinical consumption ────────────────────────────────────────────────────
app.get('/clinical-consumption', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  const { groupBy = 'encounter' } = c.req.query();
  // Group key column.
  const keyCol =
    groupBy === 'procedure' ? 'encounter_id' :  // proxy until procedure_id col exists
    groupBy === 'department' ? 'department_id' :
    groupBy === 'provider' ? 'provider_user_id' :
    'encounter_id';
  const result = await (db as any).all(sql.raw(`
    SELECT
      ${keyCol} AS group_key,
      COUNT(*) AS event_count,
      SUM(quantity) AS units,
      SUM(COALESCE(quantity * unit_price_usd, 0)) AS total_usd
    FROM point_of_use_events
    WHERE hospital_id = '${hospitalId.replace(/'/g, "''")}'
      AND ${keyCol} IS NOT NULL
    GROUP BY ${keyCol}
    ORDER BY total_usd DESC
    LIMIT 200
  `));
  return c.json({ items: result.results ?? [], groupBy });
});

// ─── Hospital forecast ───────────────────────────────────────────────────────
app.get('/hospital-forecast', requirePermission('orders', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  // Return most recent cached run; if older than 7 days, recompute.
  const [latest] = await db
    .select().from(hospitalForecastRuns)
    .where(eq(hospitalForecastRuns.hospitalId, hospitalId))
    .orderBy(desc(hospitalForecastRuns.runAt))
    .limit(1);
  const stale = !latest || (Date.now() - new Date(latest.runAt).getTime()) > 7 * 24 * 60 * 60 * 1000;
  if (stale) {
    const { rows, runId } = await forecastHospitalDemand(c.env.DB, hospitalId, c.get('user').id);
    return c.json({ runId, runAt: new Date().toISOString(), items: rows, cached: false });
  }
  return c.json({
    runId: latest.id, runAt: latest.runAt,
    items: JSON.parse(latest.resultsJson),
    cached: true,
  });
});

app.post('/hospital-forecast/run', requirePermission('orders', 'WRITE'), async (c) => {
  const hospitalId = scopeHospital(c);
  const { rows, runId } = await forecastHospitalDemand(c.env.DB, hospitalId, c.get('user').id);
  return c.json({ runId, items: rows });
});

// ─── Vendor scorecard ────────────────────────────────────────────────────────
app.get('/vendor-scorecard', requirePermission('vendors', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { vendorId, fiscalYear, fiscalPeriod } = c.req.query();
  const conds: any[] = [];
  if (vendorId) conds.push(eq(vendorScorecardSnapshots.vendorId, vendorId));
  if (fiscalYear) conds.push(eq(vendorScorecardSnapshots.fiscalYear, Number(fiscalYear)));
  if (fiscalPeriod) conds.push(eq(vendorScorecardSnapshots.fiscalPeriod, fiscalPeriod));
  if (!isAdmin(user) && user.hospitalId) {
    conds.push(eq(vendorScorecardSnapshots.hospitalId, user.hospitalId));
  }
  const rows = await db
    .select().from(vendorScorecardSnapshots)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(vendorScorecardSnapshots.fiscalYear), desc(vendorScorecardSnapshots.fiscalPeriod))
    .limit(500);
  return c.json({ items: rows });
});

app.post('/vendor-scorecard/compute', async (c) => {
  const user = c.get('user');
  if (!isAdmin(user)) throw new ForbiddenError('Admin-only');
  const r = await computeVendorScorecards(c.env.DB);
  return c.json(r);
});

export default app;
