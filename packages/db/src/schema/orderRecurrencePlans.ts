import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";
import { hospitals } from "./hospitals";
import { vendors } from "./vendors";
import { users } from "./users";

// Schedule for recurring (requisition) orders. A plan points to a template
// `parentOrderId`; the cron handler clones the template's items + patient info
// into a fresh child order on each scheduled occurrence.
export const orderRecurrencePlans = sqliteTable(
  "order_recurrence_plans",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentOrderId: text("parent_order_id").notNull(),
    hospitalId: text("hospital_id").notNull(),
    vendorId: text("vendor_id"),

    // Cadence
    frequencyUnit: text("frequency_unit").notNull(), // DAYS | WEEKS | MONTHS | QUARTERS | CUSTOM
    frequencyValue: integer("frequency_value").notNull(),
    anchorDay: integer("anchor_day"),
    customCronExpression: text("custom_cron_expression"),

    // Bounds
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    totalOccurrences: integer("total_occurrences"),
    skipDates: text("skip_dates"), // JSON array of YYYY-MM-DD

    // Spawning policy
    leadTimeDays: integer("lead_time_days").notNull().default(3),
    requireReauthEvery: integer("require_reauth_every"),

    // Lifecycle
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | PAUSED | CANCELLED | COMPLETED
    nextOccurrenceDate: text("next_occurrence_date"),
    occurrencesSpawned: integer("occurrences_spawned").notNull().default(0),

    pausedAt: text("paused_at"),
    pausedBy: text("paused_by"),
    pausedReason: text("paused_reason"),
    pauseUntil: text("pause_until"),
    cancelledAt: text("cancelled_at"),
    cancelledBy: text("cancelled_by"),

    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("recurrence_status_next_idx").on(table.status, table.nextOccurrenceDate),
    index("recurrence_parent_order_idx").on(table.parentOrderId),
    index("recurrence_hospital_idx").on(table.hospitalId),
    index("recurrence_vendor_idx").on(table.vendorId),
  ]
);

export const orderRecurrencePlansRelations = relations(orderRecurrencePlans, ({ one }) => ({
  parentOrder: one(orders, {
    fields: [orderRecurrencePlans.parentOrderId],
    references: [orders.id],
  }),
  hospital: one(hospitals, {
    fields: [orderRecurrencePlans.hospitalId],
    references: [hospitals.id],
  }),
  vendor: one(vendors, {
    fields: [orderRecurrencePlans.vendorId],
    references: [vendors.id],
  }),
  createdBy: one(users, {
    fields: [orderRecurrencePlans.createdByUserId],
    references: [users.id],
  }),
}));

export const RECURRENCE_FREQUENCY_UNITS = [
  "DAYS",
  "WEEKS",
  "MONTHS",
  "QUARTERS",
  "CUSTOM",
] as const;
export type RecurrenceFrequencyUnit = (typeof RECURRENCE_FREQUENCY_UNITS)[number];

export const RECURRENCE_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"] as const;
export type RecurrenceStatus = (typeof RECURRENCE_STATUSES)[number];
