import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const emailRecipientConfig = sqliteTable(
  "email_recipient_config",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    templateKey: text("template_key").notNull(),
    tenantId: text("tenant_id"), // nullable for global default
    ccEmails: text("cc_emails"), // JSON array of email strings
    bccEmails: text("bcc_emails"), // JSON array of email strings
    enabled: integer("enabled").notNull().default(1),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("email_recipient_config_template_idx").on(table.templateKey),
    index("email_recipient_config_tenant_idx").on(table.tenantId),
    uniqueIndex("email_recipient_config_template_tenant_uq").on(
      table.templateKey,
      table.tenantId,
    ),
  ]
);
