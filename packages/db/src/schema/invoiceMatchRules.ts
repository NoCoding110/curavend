import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Per-(hospital, vendor) tolerance rules that let invoiceService auto-resolve
 * match exceptions whose PO/invoice deltas fall inside the configured band.
 *
 * Rule matching: most specific wins (vendor + hospital > vendor-null +
 * hospital). The MOST RECENT active rule wins ties.
 */
export const invoiceMatchRules = sqliteTable(
  'invoice_match_rules',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    vendorId: text('vendor_id'),
    tolerancePct: real('tolerance_pct').notNull().default(2.0),
    toleranceMaxUsd: real('tolerance_max_usd').notNull().default(50.0),
    isActive: integer('is_active').notNull().default(1),
    notes: text('notes'),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('invoice_match_rules_hospital_idx').on(t.hospitalId),
    index('invoice_match_rules_vendor_idx').on(t.vendorId),
  ],
);
