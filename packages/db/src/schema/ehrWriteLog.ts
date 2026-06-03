import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const ehrWriteLog = sqliteTable(
  'ehr_write_log',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id'),
    connectionId: text('connection_id'),
    resourceType: text('resource_type').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fhirId: text('fhir_id'),
    status: text('status').notNull(), // 'SUCCESS' | 'FAILED' | 'SKIPPED'
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('ehr_write_log_order_idx').on(table.orderId),
    uniqueIndex('ehr_write_log_idem_idx').on(table.idempotencyKey),
  ],
);
