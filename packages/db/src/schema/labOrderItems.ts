import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const labOrderItems = sqliteTable(
  "lab_order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    labOrderId: text("lab_order_id").notNull(),
    productId: text("product_id"),
    testCode: text("test_code"),
    testName: text("test_name"),
    specimenType: text("specimen_type"),
    barcode: text("barcode"),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lab_order_items_lab_order_id_idx").on(table.labOrderId),
    index("lab_order_items_product_id_idx").on(table.productId),
    index("lab_order_items_barcode_idx").on(table.barcode),
  ]
);
