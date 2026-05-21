import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * HIPAA §164.312(b) — Audit Controls
 * Records every access to Protected Health Information (PHI) so that
 * activity can be audited and anomalies detected.
 */
export const phiAccessLog = sqliteTable(
  "phi_access_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    userEmail: text("user_email").notNull(),
    userType: text("user_type").notNull(),
    resourceType: text("resource_type").notNull(), // 'ORDER' | 'INVOICE'
    resourceId: text("resource_id").notNull(),
    action: text("action").notNull(), // 'VIEW' | 'EXPORT'
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    accessedAt: text("accessed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("phi_access_log_user_id_idx").on(table.userId),
    index("phi_access_log_resource_idx").on(table.resourceType, table.resourceId),
    index("phi_access_log_accessed_at_idx").on(table.accessedAt),
  ]
);
