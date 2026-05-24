import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Tenant-scoped collection of users. Generalizes the per-persona grouping
// gap: hospitals/vendors/admins now have first-class groups (labs already
// have `lab_groups` with different semantics — left untouched).
export const USER_GROUP_TENANT_TYPES = [
  "HOSPITAL",
  "VENDOR",
  "PROVIDER",
  "SUPER_VENDOR",
  "ADMIN",
] as const;
export type UserGroupTenantType = (typeof USER_GROUP_TENANT_TYPES)[number];

export const USER_GROUP_KINDS = [
  "PERMISSION_BUNDLE",   // grants permissions, members inherit
  "SCOPED_TEAM",         // bound to facility/dept/location, no perms by itself
  "NOTIFICATION_ROUTE",  // a notification target
  "COMPOSITE",           // any combination
] as const;
export type UserGroupKind = (typeof USER_GROUP_KINDS)[number];

export const userGroups = sqliteTable(
  "user_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantType: text("tenant_type").notNull(), // UserGroupTenantType
    tenantId: text("tenant_id"),               // nullable for ADMIN platform-wide groups
    name: text("name").notNull(),
    description: text("description"),
    groupKind: text("group_kind").notNull().default("COMPOSITE"), // UserGroupKind
    facilityId: text("facility_id"),           // hospital sub-scope
    departmentId: text("department_id"),       // hospital sub-scope
    vendorLocationId: text("vendor_location_id"), // vendor sub-scope
    isSystemDefault: integer("is_system_default").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_groups_tenant_idx").on(table.tenantType, table.tenantId),
    // Note: partial unique indexes aren't directly expressible in Drizzle SQLite.
    // The migration file creates `user_groups_name_uq` on (tenant_type, tenant_id, name)
    // accepting NULL distinctness for ADMIN platform-wide groups.
    uniqueIndex("user_groups_name_uq").on(
      table.tenantType,
      table.tenantId,
      table.name
    ),
  ]
);
