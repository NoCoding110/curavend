import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";
import { messages } from "./messages";

export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | ARCHIVE
    hospitalId: text("hospital_id").notNull(), // user ID of hospital user
    hospitalUnreadCount: integer("hospital_unread_count").notNull().default(0),
    vendorId: text("vendor_id").notNull(), // user ID of vendor user
    vendorUnreadCount: integer("vendor_unread_count").notNull().default(0),
    mostRecentMessageId: text("most_recent_message_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("rooms_hospital_id_idx").on(table.hospitalId),
    index("rooms_vendor_id_idx").on(table.vendorId),
    index("rooms_hospital_updated_idx").on(
      table.hospitalId,
      table.updatedAt
    ),
    index("rooms_vendor_updated_idx").on(table.vendorId, table.updatedAt),
  ]
);

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  order: one(orders, {
    fields: [rooms.orderId],
    references: [orders.id],
  }),
  messages: many(messages),
}));
