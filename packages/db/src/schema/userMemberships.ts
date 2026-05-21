import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * user_memberships — Phase F: a user can belong to multiple tenants.
 *
 * Each row pairs a user with one tenant context (a specific hospital, vendor,
 * provider, or super-vendor) plus the role they carry inside that tenant.
 *
 * Layered rollout (v1):
 *   - The legacy users.hospitalId / vendorId / providerId / superVendorId
 *     columns remain the source of truth for the *active* membership.
 *   - On login, the user picks a membership (or auto-selects if there's only
 *     one); the API copies that membership's tenant fields into the issued
 *     JWT, so every existing route keeps working.
 *   - Switching tenants in-session re-issues a JWT with different claims.
 *
 * Subsequent phases can migrate routes to read from c.get('membership')
 * directly; that's a refactor, not a contract change.
 */
export const userMemberships = sqliteTable(
  "user_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    tenantType: text("tenant_type").notNull(), // 'HOSPITAL' | 'VENDOR' | 'PROVIDER' | 'SUPER_VENDOR'
    tenantId: text("tenant_id").notNull(),
    role: text("role").notNull(),
    isActive: integer("is_active").notNull().default(1),
    isDefault: integer("is_default").notNull().default(0), // one per user; auto-selected
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_memberships_user_idx").on(table.userId),
    index("user_memberships_tenant_idx").on(table.tenantType, table.tenantId),
    uniqueIndex("user_memberships_user_tenant_uk").on(
      table.userId,
      table.tenantType,
      table.tenantId,
    ),
  ],
);

export type UserMembership = typeof userMemberships.$inferSelect;
export type NewUserMembership = typeof userMemberships.$inferInsert;
