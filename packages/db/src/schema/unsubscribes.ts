import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Global opt-out list. Honored across all email sends regardless of tenant
// preferences. CAN-SPAM compliance.
export const unsubscribes = sqliteTable(
  "unsubscribes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    eventTypes: text("event_types"), // JSON array; null = all events
    reason: text("reason"),
    source: text("source"), // USER_LINK | BOUNCE | COMPLAINT | ADMIN
    unsubscribedAt: text("unsubscribed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("unsubscribes_email_uk").on(table.email)]
);
