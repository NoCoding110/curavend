import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Group Purchasing Organizations (Vizient, Premier, HealthTrust, etc.).
 * Hospitals optionally have a `gpo_membership_id` pointing here. When set,
 * the pricing cascade checks GPO contract rates BEFORE Medicare allowable.
 */
export const GPO_KINDS = ["VIZIENT", "PREMIER", "HEALTHTRUST", "INTALERE", "CAPSTONE", "OTHER"] as const;
export type GpoKind = (typeof GPO_KINDS)[number];

export const gpoOrganizations = sqliteTable(
  "gpo_organizations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // GpoKind
    description: text("description"),
    website: text("website"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("gpo_organizations_kind_idx").on(table.kind)]
);
