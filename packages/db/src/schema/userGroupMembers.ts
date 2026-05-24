import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Join table: which users belong to which group. Tenant scoping is
// inherited from the group's tenant — we don't duplicate it here.
export const userGroupMembers = sqliteTable(
  "user_group_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userGroupId: text("user_group_id").notNull(),
    userId: text("user_id").notNull(),
    addedBy: text("added_by"),
    addedAt: text("added_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("user_group_members_uq").on(table.userGroupId, table.userId),
    index("user_group_members_user_idx").on(table.userId),
  ]
);
