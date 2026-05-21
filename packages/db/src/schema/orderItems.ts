import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull(),
    code: text("code"), // HCPC code
    quantity: integer("quantity"),
    description: text("description"),
    modified: integer("modified").default(0),
    // Where the unit_price came from. CONTRACT (active contract item) >
    // FEE_SCHEDULE (customFeeSchedule for the hospital-vendor pair) >
    // MEDICARE (Medicare fee schedule lookup) > MANUAL (vendor will fill at invoice).
    priceSource: text("price_source"),
    contractId: text("contract_id"), // when priceSource = CONTRACT, the source contract
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("order_items_order_id_idx").on(table.orderId)]
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));
