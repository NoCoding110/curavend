import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Per-HCPC contract rates negotiated by a GPO. A row says "if a hospital is
 * a member of this GPO, items with this HCPC code on this vendor are
 * priced at THIS rate". The pricing cascade reads this BEFORE falling back
 * to Medicare allowable.
 *
 * Optional `vendorId` lets a GPO contract apply to a specific vendor only.
 * NULL `vendorId` means "any vendor accepting this GPO's rates".
 */
export const gpoContractItems = sqliteTable(
  "gpo_contract_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gpoOrganizationId: text("gpo_organization_id").notNull(),
    vendorId: text("vendor_id"),     // nullable: applies to any vendor when NULL
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    rateUsd: real("rate_usd").notNull(),
    effectiveStartDate: text("effective_start_date").notNull(),
    effectiveEndDate: text("effective_end_date"),
    isActive: integer("is_active").notNull().default(1),
    sourceContractId: text("source_contract_id"), // freeform: GPO's own contract number
    importedAt: text("imported_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("gpo_contract_items_uq").on(
      table.gpoOrganizationId,
      table.vendorId,
      table.hcpcCode,
      table.effectiveStartDate
    ),
    index("gpo_contract_items_hcpc_idx").on(table.hcpcCode),
    index("gpo_contract_items_gpo_idx").on(table.gpoOrganizationId),
  ]
);
