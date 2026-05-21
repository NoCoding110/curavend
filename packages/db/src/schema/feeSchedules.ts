import { sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

// Custom Fee Schedules
export const customFeeSchedules = sqliteTable(
  "custom_fee_schedules",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    s3key: text("s3key").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("custom_fee_schedules_vendor_id_idx").on(table.vendorId),
  ]
);

export const customFeeSchedulesRelations = relations(
  customFeeSchedules,
  ({ one, many }) => ({
    vendor: one(vendors, {
      fields: [customFeeSchedules.vendorId],
      references: [vendors.id],
    }),
    items: many(customFeeScheduleItems),
  })
);

export const customFeeScheduleItems = sqliteTable(
  "custom_fee_schedule_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    feeScheduleId: text("fee_schedule_id").notNull(),
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    rate: real("rate"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("custom_fee_schedule_items_schedule_id_idx").on(
      table.feeScheduleId
    ),
  ]
);

export const customFeeScheduleItemsRelations = relations(
  customFeeScheduleItems,
  ({ one }) => ({
    feeSchedule: one(customFeeSchedules, {
      fields: [customFeeScheduleItems.feeScheduleId],
      references: [customFeeSchedules.id],
    }),
  })
);

// Medicare Fee Schedules
export const medicareFeeSchedules = sqliteTable("medicare_fee_schedules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  s3key: text("s3key"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const medicareFeeSchedulesRelations = relations(
  medicareFeeSchedules,
  ({ many }) => ({
    items: many(medicareFeeScheduleItems),
  })
);

export const medicareFeeScheduleItems = sqliteTable(
  "medicare_fee_schedule_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    feeScheduleId: text("fee_schedule_id").notNull(),
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    floor: real("floor"),
    ceiling: real("ceiling"),
    stateRateSchedules: text("state_rate_schedules"), // JSON array of {stateCode, rate}
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("medicare_fee_schedule_items_schedule_id_idx").on(
      table.feeScheduleId
    ),
    index("medicare_fee_schedule_items_schedule_hcpc_idx").on(
      table.feeScheduleId,
      table.hcpcCode
    ),
  ]
);

export const medicareFeeScheduleItemsRelations = relations(
  medicareFeeScheduleItems,
  ({ one }) => ({
    feeSchedule: one(medicareFeeSchedules, {
      fields: [medicareFeeScheduleItems.feeScheduleId],
      references: [medicareFeeSchedules.id],
    }),
  })
);
