import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Goods Receipt Notes (GRN).
 *
 * Records the act of receiving physical goods against an order (or PO).
 * A single order can have multiple GRNs for partial / staggered deliveries.
 *
 * GRNs feed the 3-way match: PO line qty vs GRN qty vs invoice line qty
 * must all reconcile within tolerance, or the invoice is flagged for review.
 */
export const GRN_STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;
export type GrnStatus = (typeof GRN_STATUSES)[number];

export const RECEIPT_CONDITIONS = [
  'GOOD',
  'DAMAGED',
  'EXPIRED',
  'WRONG_ITEM',
  'SHORT_SHIPPED',
  'OVERSHIPPED',
] as const;
export type ReceiptCondition = (typeof RECEIPT_CONDITIONS)[number];

export const goodsReceipts = sqliteTable(
  'goods_receipts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    receiptNumber: text('receipt_number').notNull(), // GRN-YYYY-NNNNN
    orderId: text('order_id'),
    purchaseOrderId: text('purchase_order_id'),
    hospitalId: text('hospital_id').notNull(),
    vendorId: text('vendor_id'),
    facilityId: text('facility_id'),
    receivedAt: text('received_at').notNull(),
    receivedByUserId: text('received_by_user_id').notNull(),
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),
    packingSlipNumber: text('packing_slip_number'),
    status: text('status').notNull().default('DRAFT'),
    notes: text('notes'),
    photoBlobKeys: text('photo_blob_keys'), // JSON array of R2 keys for damage photos
    postedAt: text('posted_at'),
    postedByUserId: text('posted_by_user_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('goods_receipts_order_idx').on(t.orderId),
    index('goods_receipts_po_idx').on(t.purchaseOrderId),
    index('goods_receipts_hospital_idx').on(t.hospitalId),
    index('goods_receipts_vendor_idx').on(t.vendorId),
    index('goods_receipts_status_idx').on(t.status),
  ],
);

export const goodsReceiptLines = sqliteTable(
  'goods_receipt_lines',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    receiptId: text('receipt_id').notNull(),
    orderItemId: text('order_item_id'),
    hcpcCode: text('hcpc_code').notNull(),
    description: text('description'),
    quantityOrdered: integer('quantity_ordered'),
    quantityReceived: integer('quantity_received').notNull(),
    quantityRejected: integer('quantity_rejected').notNull().default(0),
    condition: text('condition').notNull().default('GOOD'),
    lotNumber: text('lot_number'),
    serialNumber: text('serial_number'),
    expirationDate: text('expiration_date'),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('goods_receipt_lines_receipt_idx').on(t.receiptId),
    index('goods_receipt_lines_hcpc_idx').on(t.hcpcCode),
  ],
);
