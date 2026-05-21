import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const PERMISSION_RESOURCES = [
  "facilities",
  "departments",
  "physicians",
  "orders",
  "vendors",
  "vendor-locations",
  "vendor-coverage",
  "contracts",
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_LEVELS = ["NONE", "READ", "WRITE", "FULL"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  FULL: 3,
};

export const userPermissions = sqliteTable(
  "user_permissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    hospitalId: text("hospital_id").notNull(),
    resource: text("resource").notNull(), // PermissionResource
    level: text("level").notNull(), // PermissionLevel
    grantedBy: text("granted_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("user_permissions_user_resource_uk").on(
      table.userId,
      table.resource
    ),
    index("user_permissions_hospital_idx").on(table.hospitalId),
  ]
);
