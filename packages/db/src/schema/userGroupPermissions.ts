import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Per-group, per-resource permission grants. Same `resource` and `level`
// vocabulary as `user_permissions` so the merge logic is straightforward.
export const userGroupPermissions = sqliteTable(
  "user_group_permissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userGroupId: text("user_group_id").notNull(),
    resource: text("resource").notNull(), // PermissionResource (8 values)
    level: text("level").notNull(),       // PermissionLevel (NONE|READ|WRITE|FULL)
    grantedBy: text("granted_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("user_group_permissions_uq").on(
      table.userGroupId,
      table.resource
    ),
  ]
);
