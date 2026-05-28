/**
 * /api/forecasting — Demand forecasting on the existing order history.
 *
 * No ML model — just well-grounded statistics on top of the orders table:
 *   - last 12 months of orders are aggregated by (hcpcCode, hospital_id, month)
 *   - per (hcpc, hospital): trailing 3-month avg, trailing 12-month avg, current vs avg delta
 *   - reorder suggestion fires when:
 *       (a) item was ordered in 2+ of the last 3 months, AND
 *       (b) > 21 days since the last order, AND
 *       (c) projected monthly demand from the 3-month avg >= 1 unit/month
 *
 * The output drives a "Forecast" page that shows what to reorder this week.
 */
import { Hono } from 'hono';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { orders, orderItems, hcpcCodes } from '@curavend/db';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── GET /forecasting/demand ──────────────────────────────────────────────
// Returns per-HCPC demand stats for the caller's hospital (or all hospitals
// for admins). Includes a `suggestion` flag indicating whether a reorder
// is recommended.
app.get('/demand', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const limit = Math.min(Number(c.req.query('limit') ?? 200), 500);
  const hospitalIdFilter =
    user.userType === 'ADMIN' || user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER'
      ? (c.req.query('hospitalId') ?? null)
      : (user.hospitalId ?? null);

  // 12-month cutoff (we use date arithmetic in SQL so we don't have to round-trip).
  const twelveMoAgo = new Date();
  twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);
  const cutoff = twelveMoAgo.toISOString();

  const hospitalCond = hospitalIdFilter ? `AND o.hospital_id = '${hospitalIdFilter.replace(/'/g, "''")}'` : '';

  // Pull aggregated per (hcpc, month). We do this as raw SQL because we need
  // strftime grouping which Drizzle's helpers don't surface cleanly.
  const raw: any = await db.run(
    sql.raw(`
      WITH base AS (
        SELECT
          oi.code as hcpc_code,
          o.hospital_id,
          strftime('%Y-%m', o.created_at) as ym,
          SUM(COALESCE(oi.quantity, 1)) as qty,
          MAX(o.created_at) as last_at,
          MIN(o.created_at) as first_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.code IS NOT NULL
          AND o.created_at >= '${cutoff}'
          ${hospitalCond}
        GROUP BY oi.code, o.hospital_id, strftime('%Y-%m', o.created_at)
      ),
      summary AS (
        SELECT
          hcpc_code,
          hospital_id,
          SUM(qty) as total_12mo,
          SUM(CASE WHEN ym >= strftime('%Y-%m', date('now', '-3 months')) THEN qty ELSE 0 END) as total_3mo,
          COUNT(DISTINCT CASE WHEN ym >= strftime('%Y-%m', date('now', '-3 months')) THEN ym END) as active_months_3mo,
          MAX(last_at) as last_ordered_at
        FROM base
        GROUP BY hcpc_code, hospital_id
      )
      SELECT s.*, h.short_description as hcpc_description
      FROM summary s
      LEFT JOIN hcpc_codes h ON h.code = s.hcpc_code
      ORDER BY s.total_12mo DESC
      LIMIT ${limit}
    `),
  );

  const today = new Date();

  const rows = (raw.results ?? []) as Array<{
    hcpc_code: string;
    hospital_id: string;
    total_12mo: number;
    total_3mo: number;
    active_months_3mo: number;
    last_ordered_at: string;
    hcpc_description: string | null;
  }>;

  const items = rows.map((r) => {
    const avgMonthly12 = r.total_12mo / 12.0;
    const avgMonthly3 = r.total_3mo / 3.0;
    // % change of trailing-3 vs trailing-12 monthly average.
    const trendPct = avgMonthly12 > 0 ? ((avgMonthly3 - avgMonthly12) / avgMonthly12) * 100 : 0;
    const lastOrderedDays = r.last_ordered_at
      ? Math.floor((today.getTime() - new Date(r.last_ordered_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const suggested =
      r.active_months_3mo >= 2 &&
      (lastOrderedDays ?? 0) > 21 &&
      avgMonthly3 >= 1;
    const projectedNext30Days = Math.round(avgMonthly3 * 10) / 10;

    let priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | null = null;
    if (suggested) {
      if ((lastOrderedDays ?? 0) > 60 && avgMonthly3 >= 3) priority = 'CRITICAL';
      else if ((lastOrderedDays ?? 0) > 35) priority = 'HIGH';
      else priority = 'NORMAL';
    }

    return {
      hcpcCode: r.hcpc_code,
      hcpcDescription: r.hcpc_description,
      hospitalId: r.hospital_id,
      total12mo: Number(r.total_12mo),
      total3mo: Number(r.total_3mo),
      avgMonthly12: Math.round(avgMonthly12 * 10) / 10,
      avgMonthly3: Math.round(avgMonthly3 * 10) / 10,
      trendPct: Math.round(trendPct * 10) / 10,
      activeMonths3mo: Number(r.active_months_3mo),
      lastOrderedAt: r.last_ordered_at,
      lastOrderedDays,
      projectedNext30Days,
      suggested,
      priority,
    };
  });

  return c.json({
    items,
    summary: {
      totalItems: items.length,
      suggested: items.filter((i) => i.suggested).length,
      critical: items.filter((i) => i.priority === 'CRITICAL').length,
      high: items.filter((i) => i.priority === 'HIGH').length,
      asOf: today.toISOString(),
    },
  });
});

// ─── GET /forecasting/monthly-series/:hcpcCode ─────────────────────────────
// Per-HCPC monthly time series for the chart on the detail drawer.
app.get('/monthly-series/:hcpcCode', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { hcpcCode } = c.req.param();
  const hospitalIdFilter =
    user.userType === 'ADMIN' || user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER'
      ? (c.req.query('hospitalId') ?? null)
      : (user.hospitalId ?? null);

  const twelveMoAgo = new Date();
  twelveMoAgo.setMonth(twelveMoAgo.getMonth() - 12);
  const cutoff = twelveMoAgo.toISOString();
  const hospitalCond = hospitalIdFilter ? `AND o.hospital_id = '${hospitalIdFilter.replace(/'/g, "''")}'` : '';

  const raw: any = await db.run(
    sql.raw(`
      SELECT strftime('%Y-%m', o.created_at) as month, SUM(COALESCE(oi.quantity, 1)) as qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE oi.code = '${hcpcCode.replace(/'/g, "''")}'
        AND o.created_at >= '${cutoff}'
        ${hospitalCond}
      GROUP BY strftime('%Y-%m', o.created_at)
      ORDER BY month ASC
    `),
  );
  return c.json({ hcpcCode, series: raw.results ?? [] });
});

export default app;
