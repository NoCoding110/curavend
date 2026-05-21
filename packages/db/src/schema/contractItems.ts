import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { contracts } from "./contracts";

// Mutable working set of line items the drafter is currently editing.
// On each submit, a snapshot of these items is captured into contract_revisions.
// One row per HCPC code per contract.
export const contractItems = sqliteTable(
  "contract_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contractId: text("contract_id").notNull(),
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    negotiatedRate: real("negotiated_rate").notNull(),
    quantity: integer("quantity"), // optional cap; null = unlimited within contract window
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("contract_items_contract_hcpc_uk").on(
      table.contractId,
      table.hcpcCode
    ),
    index("contract_items_contract_id_idx").on(table.contractId),
    index("contract_items_hcpc_code_idx").on(table.hcpcCode),
  ]
);

export const contractItemsRelations = relations(contractItems, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractItems.contractId],
    references: [contracts.id],
  }),
}));
