import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";
import { superVendors } from "./superVendors";

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
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("purchase_order_items_po_id_idx").on(table.purchaseOrderId),
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
