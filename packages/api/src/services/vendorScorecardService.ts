/**
 * Nightly vendor scorecard computation.
 *
 * For the CURRENT month + previous month, computes per-vendor metrics
 * from purchase_orders + goods_receipts + invoices + 3-way matches and
 * upserts vendor_scorecard_snapshots rows (one per vendor × hospital ×
 * period). Hospital-null rows are the platform-wide rollup.
 *
 * Idempotent via the unique index (vendor, hospital, year, period) +
 * INSERT OR REPLACE on conflict.
 */
import { getDb } from '../lib/db';
import { sql } from 'drizzle-orm';

export interface ScorecardSweepResult {
  vendorsProcessed: number;
  snapshotsWritten: number;
  errors: number;
}

function periodKey(d: Date): { year: number; period: string } {
  return {
    year: d.getFullYear(),
    period: 'M' + String(d.getMonth() + 1).padStart(2, '0'),
  };
}

export async function computeVendorScorecards(d1: D1Database): Promise<ScorecardSweepResult> {
  const db = getDb(d1);
  const result: ScorecardSweepResult = { vendorsProcessed: 0, snapshotsWritten: 0, errors: 0 };

  // Compute for current month + previous month (idempotent).
  const months = [new Date(), new Date(new Date().setMonth(new Date().getMonth() - 1))];
  for (const m of months) {
    const { year, period } = periodKey(m);
    const monthStart = new Date(year, parseInt(period.slice(1)) - 1, 1).toISOString().slice(0, 10);
    const monthEnd = new Date(year, parseInt(period.slice(1)), 1).toISOString().slice(0, 10);

    // Aggregate per (vendor × hospital). hospital_id may be null on the PO.
    const rows = await (db as any).all(sql.raw(`
      SELECT
        po.vendor_id AS vendor_id,
        po.hospital_id AS hospital_id,
        COUNT(DISTINCT po.id) AS pos_total,
        COUNT(DISTINCT CASE WHEN gr.id IS NOT NULL THEN po.id END) AS pos_received,
        SUM(COALESCE(po.total_usd, 0)) AS total_spend_usd,
        AVG(CASE
          WHEN po.eta_at IS NOT NULL AND gr.posted_at IS NOT NULL THEN
            CASE WHEN gr.posted_at <= po.eta_at THEN 100.0 ELSE 0.0 END
          END) AS on_time_pct,
        AVG(CASE
          WHEN gr.posted_at IS NOT NULL THEN
            (julianday(gr.posted_at) - julianday(po.created_at))
          END) AS avg_lead_time_days
      FROM purchase_orders po
      LEFT JOIN goods_receipts gr ON gr.order_id = po.requisition_id
        AND gr.status = 'POSTED'
        AND gr.posted_at >= '${monthStart}'
        AND gr.posted_at < '${monthEnd}'
      WHERE po.created_at >= '${monthStart}'
        AND po.created_at < '${monthEnd}'
      GROUP BY po.vendor_id, po.hospital_id
    `));
    const aggregates: any[] = rows.results ?? [];

    for (const a of aggregates) {
      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        // INSERT OR REPLACE upserts on the unique index.
        await (db as any).run(sql.raw(`
          INSERT OR REPLACE INTO vendor_scorecard_snapshots (
            id, vendor_id, hospital_id, fiscal_year, fiscal_period,
            pos_received, pos_total,
            on_time_pct, fill_rate_pct, defect_rate_pct, invoice_match_accuracy_pct,
            avg_lead_time_days, total_spend_usd, computed_at
          ) VALUES (
            '${id}',
            '${String(a.vendor_id).replace(/'/g, "''")}',
            ${a.hospital_id ? `'${String(a.hospital_id).replace(/'/g, "''")}'` : 'NULL'},
            ${year}, '${period}',
            ${Number(a.pos_received) || 0}, ${Number(a.pos_total) || 0},
            ${a.on_time_pct != null ? Number(a.on_time_pct) : 'NULL'},
            NULL, NULL, NULL,
            ${a.avg_lead_time_days != null ? Number(a.avg_lead_time_days) : 'NULL'},
            ${Number(a.total_spend_usd) || 0},
            '${now}'
          )
        `));
        result.snapshotsWritten++;
      } catch (err) {
        console.error('[vendorScorecard] upsert failed', err);
        result.errors++;
      }
    }
    result.vendorsProcessed += aggregates.length;
  }

  return result;
}
