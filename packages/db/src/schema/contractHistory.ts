import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { contracts } from "./contracts";
import { users } from "./users";

// Narrative event log for contracts — mirrors orderHistory pattern.
// Each row describes a state transition or notable action on a contract.
export const contractHistory = sqliteTable(
  "contract_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contractId: text("contract_id").notNull(),
    description: text("description").notNull(),
    changedByUserId: text("changed_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("contract_history_contract_id_idx").on(table.contractId),
    index("contract_history_contract_created_idx").on(
      table.contractId,
      table.createdAt
    ),
  ]
);

export const contractHistoryRelations = relations(contractHistory, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractHistory.contractId],
    references: [contracts.id],
  }),
  changedByUser: one(users, {
    fields: [contractHistory.changedByUserId],
    references: [users.id],
  }),
}));
