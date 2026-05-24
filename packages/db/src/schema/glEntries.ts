import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * General Ledger entries — append-only journal that ties procurement events
 * back to finance. Each row is ONE SIDE (debit OR credit) of a journal entry.
 * A balanced transaction emits two rows with the same `transactionId`.
 *
 * Source types and the journal they emit:
 *   PO_COMMIT       — encumbrance:  DR commitment-account / CR commitment-offset
 *   GR_RECEIPT      — inventory:    DR inventory-account  / CR commitment-account
 *   INVOICE_APPROVE — expense:      DR expense-account    / CR accounts-payable
 *   INVOICE_PAY     — payment:      DR accounts-payable   / CR cash
 *   ADJUSTMENT      — manual correction (any direction)
 *
 * `exportedAt` is set when an ERP connector picks the row up; null = pending.
 */
export const GL_SOURCE_TYPES = [
  'PO_COMMIT', 'GR_RECEIPT', 'INVOICE_APPROVE', 'INVOICE_PAY', 'ADJUSTMENT',
] as const;
export type GlSourceType = (typeof GL_SOURCE_TYPES)[number];

export const glEntries = sqliteTable(
  'gl_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull(),
    hospitalId: text('hospital_id').notNull(),
    fiscalYear: integer('fiscal_year').notNull(),
    fiscalPeriod: text('fiscal_period').notNull(),
    accountCode: text('account_code').notNull(),
    costCenter: text('cost_center'),
    departmentId: text('department_id'),
    debitUsd: real('debit_usd').notNull().default(0),
    creditUsd: real('credit_usd').notNull().default(0),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    memo: text('memo'),
    postedAt: text('posted_at').notNull(),
    postedByUserId: text('posted_by_user_id'),
    exportedAt: text('exported_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('gl_entries_txn_idx').on(t.transactionId),
    index('gl_entries_hospital_period_idx').on(t.hospitalId, t.fiscalYear, t.fiscalPeriod),
    index('gl_entries_account_idx').on(t.accountCode),
    index('gl_entries_source_idx').on(t.sourceType, t.sourceId),
    index('gl_entries_export_idx').on(t.exportedAt),
  ],
);
