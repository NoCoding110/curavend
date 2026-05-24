import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Vendor RMAs (return material authorizations).
 *
 * State machine:
 *   DRAFT → SUBMITTED → APPROVED → SHIPPED → RECEIVED → CREDITED
 *                                ↓
 *                            REJECTED
 *   Any non-terminal → CANCELLED
 *
 * Auto-spawned by goodsReceipts.post for lines with condition=DAMAGED or
 * condition=WRONG_ITEM. Operator can also create manually.
 */
export const RMA_STATES = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'SHIPPED', 'RECEIVED', 'CREDITED',
  'REJECTED', 'CANCELLED',
] as const;
export type RmaState = (typeof RMA_STATES)[number];

export const RMA_REASONS = [
  'DAMAGED', 'WRONG_ITEM', 'SHORT_DATED', 'DEFECTIVE', 'OTHER',
] as const;
export type RmaReason = (typeof RMA_REASONS)[number];

export const vendorRmas = sqliteTable(
  'vendor_rmas',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    rmaNumber: text('rma_number').notNull(),
    vendorId: text('vendor_id').notNull(),
    hospitalId: text('hospital_id'),
    sourceGrnId: text('source_grn_id'),
    sourceOrderId: text('source_order_id'),
    state: text('state').notNull().default('DRAFT'),
    reason: text('reason').notNull().default('DAMAGED'),
    reasonDetail: text('reason_detail'),
    vendorRmaNumber: text('vendor_rma_number'),
    expectedCreditUsd: real('expected_credit_usd'),
    actualCreditUsd: real('actual_credit_usd'),
    submittedAt: text('submitted_at'),
    approvedAt: text('approved_at'),
    shippedAt: text('shipped_at'),
    receivedAt: text('received_at'),
    creditedAt: text('credited_at'),
    trackingNumber: text('tracking_number'),
    notes: text('notes'),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('vendor_rmas_vendor_idx').on(t.vendorId),
    index('vendor_rmas_hospital_idx').on(t.hospitalId),
    index('vendor_rmas_state_idx').on(t.state),
    index('vendor_rmas_grn_idx').on(t.sourceGrnId),
  ],
);

export const vendorRmaLines = sqliteTable(
  'vendor_rma_lines',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    rmaId: text('rma_id').notNull(),
    grnLineId: text('grn_line_id'),
    hcpcCode: text('hcpc_code'),
    description: text('description'),
    quantity: integer('quantity').notNull().default(1),
    unitCreditUsd: real('unit_credit_usd'),
    condition: text('condition'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('vendor_rma_lines_rma_idx').on(t.rmaId)],
);
