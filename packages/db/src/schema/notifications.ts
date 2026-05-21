import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    message: text("message").notNull(),
    isRead: integer("is_read").default(0),
    receiverId: text("receiver_id").notNull(),
    redirectId: text("redirect_id"),
    redirectTo: text("redirect_to").notNull(), // ORDER | INVOICE | FACILITY_USER | VENDOR_USER | ROOM | SUPPORT_TICKET | CONTRACT | NO_REDIRECT
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("notifications_receiver_id_idx").on(table.receiverId),
    index("notifications_receiver_created_idx").on(
      table.receiverId,
      table.createdAt
    ),
  ]
);
