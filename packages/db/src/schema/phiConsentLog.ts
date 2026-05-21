import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * HIPAA §164.312(d) — Person or Entity Authentication
 * Logs each instance where a user explicitly acknowledges PHI access terms,
 * providing a per-session (or per-login) consent audit trail.
 */
export const phiConsentLog = sqliteTable(
  "phi_consent_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    acknowledgedAt: text("acknowledged_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("phi_consent_log_user_id_idx").on(table.userId),
    index("phi_consent_log_acknowledged_at_idx").on(table.acknowledgedAt),
  ]
);
