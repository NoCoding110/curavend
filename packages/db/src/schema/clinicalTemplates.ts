import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const clinicalTemplates = sqliteTable('clinical_templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  type: text('type').notNull().default('GENERAL'),
  body: text('body'),
  defaultHcpcCodes: text('default_hcpc_codes'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
