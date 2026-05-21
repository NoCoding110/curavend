import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const AUTH_AUDIT_EVENTS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGIN_BLOCKED_LOCKED',
  'ACCOUNT_LOCKED',
  'MFA_CHALLENGE',
  'MFA_SUCCESS',
  'MFA_FAILURE',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_FAILED',
  'PASSWORD_RESET_COMPLETED',
  'PASSWORD_CHANGE_FAILED',
  'PASSWORD_CHANGED',
  'ACCOUNT_UNLOCKED',
] as const;

export type AuthAuditEvent = (typeof AUTH_AUDIT_EVENTS)[number];

export const authAuditLog = sqliteTable(
  "auth_audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    userEmail: text("user_email"),
    event: text("event").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: text("metadata"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("auth_audit_log_user_id_idx").on(table.userId),
    index("auth_audit_log_event_idx").on(table.event),
    index("auth_audit_log_created_at_idx").on(table.createdAt),
  ]
);
