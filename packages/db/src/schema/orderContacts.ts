import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";

// Per-order contact directory. Each row carries one contact for one role.
// 1:N — an order can have multiple contacts (orderer, ship-to, bill-to,
// clinical, custom). Roles are open-ended TEXT so future roles don't need
// schema migrations.
export const orderContacts = sqliteTable(
  "order_contacts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id").notNull(),
    role: text("role").notNull(), // ORDERER | SHIP_TO | BILL_TO | CLINICAL | CUSTOM
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    notes: text("notes"),
    isPrimary: integer("is_primary").default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("order_contacts_order_role_uk").on(table.orderId, table.role),
    index("order_contacts_order_idx").on(table.orderId),
  ]
);

export const orderContactsRelations = relations(orderContacts, ({ one }) => ({
  order: one(orders, {
    fields: [orderContacts.orderId],
    references: [orders.id],
  }),
}));

export const ORDER_CONTACT_ROLES = [
  "ORDERER",
  "SHIP_TO",
  "BILL_TO",
  "CLINICAL",
  "CUSTOM",
] as const;
export type OrderContactRole = (typeof ORDER_CONTACT_ROLES)[number];
