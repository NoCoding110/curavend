import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";
import { users } from "./users";

export const orderHistory = sqliteTable(
  "order_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull(),
    description: text("description").notNull(),
    changedByUserId: text("changed_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_history_order_id_idx").on(table.orderId),
    index("order_history_order_created_idx").on(
      table.orderId,
      table.createdAt
    ),
  ]
);

export const orderHistoryRelations = relations(orderHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderHistory.orderId],
    references: [orders.id],
  }),
  changedByUser: one(users, {
    fields: [orderHistory.changedByUserId],
    references: [users.id],
  }),
}));
