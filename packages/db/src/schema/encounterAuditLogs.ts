import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const encounterAuditLogs = sqliteTable(
  'encounter_audit_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull(),
    section: text('section').notNull(),
    action: text('action').notNull(),
    changedByUserId: text('changed_by_user_id').notNull(),
    payload: text('payload'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [index('encounter_audit_logs_order_idx').on(table.orderId)],
);
