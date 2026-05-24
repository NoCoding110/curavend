import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";
import { superVendors } from "./superVendors";

export const PO_TRANSMISSION_METHODS = ['EDI', 'API', 'PUNCHOUT', 'EMAIL', 'PORTAL'] as const;
export type PoTransmissionMethod = (typeof PO_TRANSMISSION_METHODS)[number];

export const PO_TRANSMISSION_STATES = [
  'NOT_SENT', 'SENDING', 'SENT', 'ACKED', 'FAILED',
] as const;
export type PoTransmissionState = (typeof PO_TRANSMISSION_STATES)[number];

export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    number: text("number").notNull(),
    date: text("date"),
    status: text("status").notNull().default("ORDER_COMPLETED"), // ORDER_COMPLETED | EXPORTED
    fileKey: text("file_key"),
    fileBase64: text("file_base64"),
    fileName: text("file_name"),
    vendorId: text("vendor_id").notNull(),
    superVendorId: text("super_vendor_id"),
    // Procurement enrichment (gap 3) — PO as a first-class artifact.
    hospitalId: text("hospital_id"),
    requisitionId: text("requisition_id"),
    totalUsd: real("total_usd"),
    currency: text("currency").default("USD"),
    neededByDate: text("needed_by_date"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id"),
    // PO transmission (gap 4) — state machine for sending to vendor.
    transmissionMethod: text("transmission_method"),
    transmissionState: text("transmission_state").notNull().default("NOT_SENT"),
    transmittedAt: text("transmitted_at"),
    vendorAckAt: text("vendor_ack_at"),
    transmissionAttempts: integer("transmission_attempts").notNull().default(0),
    transmissionError: text("transmission_error"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("purchase_orders_vendor_id_idx").on(table.vendorId),
    index("purchase_orders_super_vendor_id_idx").on(table.superVendorId),
    index("purchase_orders_vendor_date_created_idx").on(
      table.vendorId,
      table.date,
      table.createdAt
    ),
    index("purchase_orders_hospital_idx").on(table.hospitalId),
    index("purchase_orders_requisition_idx").on(table.requisitionId),
    index("purchase_orders_transmission_idx").on(table.transmissionState),
  ]
);

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ one, many }) => ({
    vendor: one(vendors, {
      fields: [purchaseOrders.vendorId],
      references: [vendors.id],
    }),
    superVendor: one(superVendors, {
      fields: [purchaseOrders.superVendorId],
      references: [superVendors.id],
    }),
    items: many(purchaseOrderItems),
  })
);

export const purchaseOrderItems = sqliteTable(
  "purchase_order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseOrderId: text("purchase_order_id").notNull(),
    description: text("description"),
    manufacturerNumber: text("manufacturer_number"),
    productDescription: text("product_description"),
    quantity: integer("quantity"),
    // Line enrichment (gap 3) — backref + cost.
    hcpcCode: text("hcpc_code"),
    requisitionItemId: text("requisition_item_id"),
    unitPriceUsd: real("unit_price_usd"),
    lineTotalUsd: real("line_total_usd"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("purchase_order_items_po_id_idx").on(table.purchaseOrderId),
    index("purchase_order_items_req_item_idx").on(table.requisitionItemId),
  ]
);

export const purchaseOrderItemsRelations = relations(
  purchaseOrderItems,
  ({ one }) => ({
    purchaseOrder: one(purchaseOrders, {
      fields: [purchaseOrderItems.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
  })
);
