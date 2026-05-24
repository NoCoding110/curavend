import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Audit log for formulary substitutions made by users mid-workflow.
 *
 * Written by:
 *   - ORDER_CREATE wizard when a chip is clicked (`/api/substitutions/log`)
 *   - Backorder triage page when a substitute is auto-resolved
 *   - Requisition convert-to-order when an unfillable line is swapped
 *
 * The substituted_by_user_id is always set; the approver_user_id is only
 * required when the substitution is OUTSIDE the formulary_substitutes
 * table (i.e., an ad-hoc swap that needs explicit approval).
 */
export const SUBSTITUTION_CONTEXTS = [
  'ORDER_CREATE', 'BACKORDER', 'REQUISITION',
] as const;
export type SubstitutionContext = (typeof SUBSTITUTION_CONTEXTS)[number];

export const substitutionAuditLog = sqliteTable(
  'substitution_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id'),
    fromHcpcCode: text('from_hcpc_code').notNull(),
    toHcpcCode: text('to_hcpc_code').notNull(),
    contextType: text('context_type').notNull(),
    contextId: text('context_id'),
    reason: text('reason'),
    approverUserId: text('approver_user_id'),
    substitutedByUserId: text('substituted_by_user_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('substitution_audit_log_hospital_idx').on(t.hospitalId),
    index('substitution_audit_log_context_idx').on(t.contextType, t.contextId),
    index('substitution_audit_log_from_hcpc_idx').on(t.fromHcpcCode),
  ],
);
