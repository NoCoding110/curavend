import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const EMAIL_OTP_PURPOSES = [
  "MFA_LOGIN",
  "EMAIL_VERIFY",
  "STEP_UP",
  "PASSWORD_RESET",
] as const;
export type EmailOtpPurpose = (typeof EMAIL_OTP_PURPOSES)[number];

export const emailOtpCodes = sqliteTable(
  "email_otp_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    attempts: integer("attempts").notNull().default(0),
    ipAddress: text("ip_address"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("email_otp_codes_user_id_idx").on(table.userId),
    index("email_otp_codes_email_idx").on(table.email),
    index("email_otp_codes_purpose_idx").on(table.purpose),
    index("email_otp_codes_expires_at_idx").on(table.expiresAt),
  ]
);
