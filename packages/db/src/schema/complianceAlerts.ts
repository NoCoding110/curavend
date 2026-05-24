import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Pre-expiry / compliance alerts emitted by the daily cron.
 *
 * One row per (subjectType, subjectId, alertKind, thresholdDays). The
 * unique index prevents duplicate alerts for the same threshold; the cron
 * uses INSERT OR IGNORE so it's idempotent.
 *
 * subjectType values:
 *   VENDOR_DMEPOS         — DMEPOS accreditation expiry
 *   VENDOR_ACCREDITATION  — accrediting-body cert expiry
 *   VENDOR_LICENSE        — state-level license expiry
 *   VENDOR_INSURANCE      — liability insurance expiry
 *   LAB_LOT               — lab consumable lot expiry
 *   USER_MFA              — user not enrolled in MFA past grace period
 *
 * `alertKind` distinguishes type of issue:
 *   EXPIRY    — date is approaching
 *   MISSING   — required artifact not on file
 *   OIG_HIT   — entity surfaced on a monthly OIG screen
 */
export const COMPLIANCE_SUBJECT_TYPES = [
  'VENDOR_DMEPOS', 'VENDOR_ACCREDITATION', 'VENDOR_LICENSE',
  'VENDOR_INSURANCE', 'LAB_LOT', 'USER_MFA',
] as const;
export type ComplianceSubjectType = (typeof COMPLIANCE_SUBJECT_TYPES)[number];

export const COMPLIANCE_ALERT_KINDS = ['EXPIRY', 'MISSING', 'OIG_HIT'] as const;
export type ComplianceAlertKind = (typeof COMPLIANCE_ALERT_KINDS)[number];

export const COMPLIANCE_SEVERITIES = ['INFO', 'WARN', 'CRITICAL'] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

export const complianceAlerts = sqliteTable(
  'compliance_alerts',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id'),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    alertKind: text('alert_kind').notNull(),
    thresholdDays: integer('threshold_days'),
    expiresOn: text('expires_on'),
    severity: text('severity').notNull().default('WARN'),
    message: text('message').notNull(),
    acknowledgedAt: text('acknowledged_at'),
    acknowledgedByUserId: text('acknowledged_by_user_id'),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('compliance_alerts_subject_idx').on(t.subjectType, t.subjectId),
    index('compliance_alerts_hospital_idx').on(t.hospitalId),
    index('compliance_alerts_resolved_idx').on(t.resolvedAt),
    uniqueIndex('compliance_alerts_uk').on(
      t.subjectType, t.subjectId, t.alertKind, t.thresholdDays,
    ),
  ],
);
