import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Acceptable substitutes for a primary formulary item.
 *
 * When the requisition flow can't fulfill the primary HCPC (out of stock,
 * vendor unavailable, off-contract), the engine consults this table to find
 * approved equivalents — ranked by `priority` (lower = preferred).
 */
export const formularySubstitutes = sqliteTable(
  "formulary_substitutes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    formularyItemId: text("formulary_item_id").notNull(),
    substituteHcpcCode: text("substitute_hcpc_code").notNull(),
    substituteDescription: text("substitute_description"),
    priority: integer("priority").notNull().default(10), // lower = more preferred
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("formulary_substitutes_uq").on(
      table.formularyItemId,
      table.substituteHcpcCode
    ),
    index("formulary_substitutes_item_idx").on(table.formularyItemId),
  ]
);
