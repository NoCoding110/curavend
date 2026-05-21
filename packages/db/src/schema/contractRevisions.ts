import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { contracts } from "./contracts";
import { users } from "./users";

// Immutable snapshot of a contract submission. Every time a contract is submitted
// for approval, a new row is inserted here capturing the current line items and
// metadata so we have a full audit trail of what the counterparty was asked to
// approve at each revision.
export const contractRevisions = sqliteTable(
  "contract_revisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    contractId: text("contract_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    s3key: text("s3key"),
    name: text("name"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    // JSON string: Array<{ hcpcCode, description, rate, quantity }>
    itemsSnapshot: text("items_snapshot").notNull(),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    submittedAt: text("submitted_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: text("reviewed_at"),
    // APPROVED | REJECTED | CHANGES_REQUESTED
    reviewDecision: text("review_decision"),
    reviewComment: text("review_comment"),
  },
  (table) => [
    uniqueIndex("contract_revisions_contract_revision_uk").on(
      table.contractId,
      table.revisionNumber
    ),
    index("contract_revisions_contract_id_idx").on(table.contractId),
  ]
);

export const contractRevisionsRelations = relations(contractRevisions, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractRevisions.contractId],
    references: [contracts.id],
  }),
  submittedBy: one(users, {
    fields: [contractRevisions.submittedByUserId],
    references: [users.id],
  }),
  reviewedBy: one(users, {
    fields: [contractRevisions.reviewedByUserId],
    references: [users.id],
  }),
}));
