import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Three-way match results.
 *
 * For each invoice line, the matcher correlates:
 *   • PO line (ordered qty, unit price)
 *   • Goods receipt line (received qty, condition)
 *   • Invoice line (billed qty, billed price)
 *
 * Result is one row per invoice line with a `matchStatus`:
 *   PERFECT       — qty + price both within tolerance, condition GOOD
 *   QTY_VARIANCE  — billed qty differs from received qty beyond tolerance
 *   PRICE_VARIANCE— billed price differs from PO unit price beyond tolerance
 *   NO_RECEIPT    — no GRN line exists for this invoice line
 *   NO_PO         — no PO line found for this invoice line
 *   CONDITION_BAD — line was received but condition was not GOOD
 *   AMBIGUOUS     — multiple PO or GRN candidates; cannot auto-pick
 *
 * Tolerances are configurable per hospital. Defaults: qty ±0%, price ±2%.
 *
 * Anything not PERFECT goes onto an exceptions queue for AP review.
 */
export const MATCH_STATUSES = [
  'PERFECT',
  'QTY_VARIANCE',
  'PRICE_VARIANCE',
  'NO_RECEIPT',
  'NO_PO',
  'CONDITION_BAD',
  'AMBIGUOUS',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const threeWayMatches = sqliteTable(
  'three_way_matches',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invoiceId: text('invoice_id').notNull(),
    invoiceItemId: text('invoice_item_id').notNull(),
    orderId: text('order_id'),
    purchaseOrderId: text('purchase_order_id'),
    orderItemId: text('order_item_id'),
    receiptLineId: text('receipt_line_id'),
    hcpcCode: text('hcpc_code').notNull(),
    matchStatus: text('match_status').notNull(),
    poQuantity: integer('po_quantity'),
    poUnitPriceUsd: real('po_unit_price_usd'),
    receivedQuantity: integer('received_quantity'),
    receivedCondition: text('received_condition'),
    invoiceQuantity: integer('invoice_quantity'),
    invoiceUnitPriceUsd: real('invoice_unit_price_usd'),
    qtyVariance: real('qty_variance'),
    priceVariance: real('price_variance'),
    priceVariancePct: real('price_variance_pct'),
    notes: text('notes'),
    resolvedAt: text('resolved_at'),
    resolvedByUserId: text('resolved_by_user_id'),
    resolution: text('resolution'), // ACCEPTED / DISPUTED / OVERRIDDEN
    computedAt: text('computed_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('three_way_matches_invoice_idx').on(t.invoiceId),
    index('three_way_matches_status_idx').on(t.matchStatus),
    index('three_way_matches_hcpc_idx').on(t.hcpcCode),
  ],
);
