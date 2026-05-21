import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    status: text("status").notNull().default("OPEN"), // OPEN | CLOSED
    ownerId: text("owner_id").notNull(),
    creatorId: text("creator_id").notNull(),
    subject: text("subject").default("OTHER"), // ACCOUNT | PRICING | ORDER | CONTRACT | INVOICE | OTHER
    isRead: integer("is_read").default(0),
    number: text("number"),
    closedAt: text("closed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("support_tickets_status_idx").on(table.status),
    index("support_tickets_owner_id_idx").on(table.ownerId),
    index("support_tickets_status_updated_idx").on(
      table.status,
      table.updatedAt
    ),
  ]
);

export const supportTicketsRelations = relations(
  supportTickets,
  ({ one, many }) => ({
    owner: one(users, {
      fields: [supportTickets.ownerId],
      references: [users.id],
      relationName: "ticketOwner",
    }),
    creator: one(users, {
      fields: [supportTickets.creatorId],
      references: [users.id],
      relationName: "ticketCreator",
    }),
    messages: many(supportTicketMessages),
  })
);

export const supportTicketMessages = sqliteTable(
  "support_ticket_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    text: text("text"),
    attachmentId: text("attachment_id"),
    senderUserId: text("sender_user_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    supportTicketId: text("support_ticket_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("support_ticket_messages_ticket_id_idx").on(table.supportTicketId),
    index("support_ticket_messages_ticket_created_idx").on(
      table.supportTicketId,
      table.createdAt
    ),
  ]
);

export const supportTicketMessagesRelations = relations(
  supportTicketMessages,
  ({ one }) => ({
    supportTicket: one(supportTickets, {
      fields: [supportTicketMessages.supportTicketId],
      references: [supportTickets.id],
    }),
    sender: one(users, {
      fields: [supportTicketMessages.senderUserId],
      references: [users.id],
    }),
  })
);
