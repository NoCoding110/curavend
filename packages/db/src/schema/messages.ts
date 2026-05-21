import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { rooms } from "./rooms";
import { users } from "./users";

export const messages = sqliteTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    text: text("text"), // encrypted message text
    attachmentId: text("attachment_id"), // file key
    senderUserId: text("sender_user_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(), // hospital or vendor user ID
    receiverUserId: text("receiver_user_id"),
    receiverUserType: text("receiver_user_type").notNull(), // ADMIN | HOSPITAL | VENDOR
    roomId: text("room_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("messages_room_id_idx").on(table.roomId),
    index("messages_room_created_idx").on(table.roomId, table.createdAt),
    index("messages_sender_user_id_idx").on(table.senderUserId),
  ]
);

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(rooms, {
    fields: [messages.roomId],
    references: [rooms.id],
  }),
  sender: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
}));
