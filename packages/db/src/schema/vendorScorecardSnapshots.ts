import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Monthly vendor performance snapshots. One row per (vendor × hospital
 * × period). hospitalId null = platform-wide aggregate.
 *
 * Written by the nightly cron `computeVendorScorecards()`. Reads from:
 *   - purchase_orders (count, lead time)
 *   - goods_receipts + lines (fill rate, defect rate, on-time)
 *   - invoices + three_way_matches (match accuracy)
 *
 * Metrics:
 *   on_time_pct    — % of GRs received on or before the PO's eta_at
 *   fill_rate_pct  — sum(received_qty) / sum(ordered_qty)
 *   defect_rate    — % of GR lines marked DAMAGED or WRONG_ITEM
 *   match_accuracy — % of invoices that 3-way matched cleanly
 *   avg_lead_time  — avg days from PO send to first GR
 */
export const vendorScorecardSnapshots = sqliteTable(
  'vendor_scorecard_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    vendorId: text('vendor_id').notNull(),
    hospitalId: text('hospital_id'),
    fiscalYear: integer('fiscal_year').notNull(),
    fiscalPeriod: text('fiscal_period').notNull(),
    posReceived: integer('pos_received').notNull().default(0),
    posTotal: integer('pos_total').notNull().default(0),
    onTimePct: real('on_time_pct'),
    fillRatePct: real('fill_rate_pct'),
    defectRatePct: real('defect_rate_pct'),
    invoiceMatchAccuracyPct: real('invoice_match_accuracy_pct'),
    avgLeadTimeDays: real('avg_lead_time_days'),
    totalSpendUsd: real('total_spend_usd'),
    computedAt: text('computed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('vendor_scorecard_snapshots_uk').on(
      t.vendorId, t.hospitalId, t.fiscalYear, t.fiscalPeriod,
    ),
    index('vendor_scorecard_snapshots_vendor_idx').on(t.vendorId),
    index('vendor_scorecard_snapshots_period_idx').on(t.fiscalYear, t.fiscalPeriod),
  ],
);
