/**
 * Hospital-side demand forecasting.
 *
 * Walks order_items joined to orders for the last 12 months, groups by
 * (hcpcCode × calendar month), then projects N months forward using a
 * naive seasonality-aware model:
 *
 *   trailing12Avg = sum(qty over last 12 mo) / 12
 *   seasonality   = (qty for same month last year) / trailing12Avg (or 1.0 if missing)
 *   projection[m] = round(trailing12Avg * seasonality)
 *
 * Result is cached in hospital_forecast_runs.results_json for fast dashboard
 * load. Caller decides whether to re-run.
 */
import { getDb } from '../lib/db';
import { hospitalForecastRuns } from '@curavend/db';
import { sql } from 'drizzle-orm';

export interface HospitalForecastRow {
  hcpcCode: string;
  description: string | null;
  trailing12Total: number;
  trailing12Avg: number;
  projections: Array<{ month: string; projectedQty: number }>;
}

export async function forecastHospitalDemand(
  d1: D1Database,
  hospitalId: string,
  byUserId?: string,
  horizonMonths = 3,
  lookbackMonths = 12,
): Promise<{ rows: HospitalForecastRow[]; runId: string }> {
  const db = getDb(d1);
  const safeId = hospitalId.replace(/'/g, "''");
  const cutoff = new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // Per (hcpc × month) sum of quantity. We keep month as YYYY-MM string.
  const raw = await db.run(sql.raw(`
    SELECT
      oi.code AS hcpc_code,
      MIN(oi.description) AS description,
      strftime('%Y-%m', o.created_at) AS month,
      SUM(COALESCE(oi.quantity, 0)) AS qty
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.hospital_id = '${safeId}'
      AND o.created_at >= '${cutoff}'
      AND oi.code IS NOT NULL
    GROUP BY oi.code, month
    ORDER BY oi.code, month
  `));
  const records: Array<{ hcpc_code: string; description: string | null; month: string; qty: number }> =
    raw.results ?? [];

  // Pivot into per-hcpc time-series.
  const byHcpc = new Map<string, { description: string | null; months: Map<string, number> }>();
  for (const r of records) {
    if (!byHcpc.has(r.hcpc_code)) byHcpc.set(r.hcpc_code, { description: r.description, months: new Map() });
    byHcpc.get(r.hcpc_code)!.months.set(r.month, Number(r.qty));
  }

  // Build projection rows.
  const now = new Date();
  const horizons: string[] = [];
  for (let i = 1; i <= horizonMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    horizons.push(d.toISOString().slice(0, 7));
  }

  const rows: HospitalForecastRow[] = [];
  for (const [hcpc, series] of byHcpc.entries()) {
    let total12 = 0;
    for (const q of series.months.values()) total12 += q;
    const avg = total12 / lookbackMonths;
    const projections = horizons.map((m) => {
      // Look up same-month-last-year for a seasonality factor.
      const lastYear = new Date(`${m}-01`);
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const lyKey = lastYear.toISOString().slice(0, 7);
      const lyQty = series.months.get(lyKey);
      const factor = (lyQty != null && avg > 0) ? (lyQty / avg) : 1.0;
      return { month: m, projectedQty: Math.max(0, Math.round(avg * factor)) };
    });
    rows.push({
      hcpcCode: hcpc,
      description: series.description,
      trailing12Total: total12,
      trailing12Avg: Math.round(avg * 10) / 10,
      projections,
    });
  }
  rows.sort((a, b) => b.trailing12Total - a.trailing12Total);

  // Cache the run.
  const runId = crypto.randomUUID();
  await db.insert(hospitalForecastRuns).values({
    id: runId, hospitalId,
    runAt: new Date().toISOString(),
    horizonMonths, lookbackMonths,
    resultsJson: JSON.stringify(rows),
    createdByUserId: byUserId,
  });
  return { rows, runId };
}
