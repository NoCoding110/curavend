import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";
import { superVendors } from "./superVendors";
import { hospitals } from "./hospitals";
import { providers } from "./providers";
import { users } from "./users";

// Consignment Closets
export const consignmentClosets = sqliteTable(
  "consignment_closets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    superVendorId: text("super_vendor_id"),
    hospitalId: text("hospital_id").notNull(),
    providerId: text("provider_id"),
    s3key: text("s3key"), // JSON array
    departmentName: text("department_name"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("consignment_closets_vendor_id_idx").on(table.vendorId),
    index("consignment_closets_super_vendor_id_idx").on(table.superVendorId),
    index("consignment_closets_hospital_id_idx").on(table.hospitalId),
    index("consignment_closets_provider_id_idx").on(table.providerId),
  ]
);

export const consignmentClosetsRelations = relations(
  consignmentClosets,
  ({ one, many }) => ({
    vendor: one(vendors, {
      fields: [consignmentClosets.vendorId],
      references: [vendors.id],
    }),
    superVendor: one(superVendors, {
      fields: [consignmentClosets.superVendorId],
      references: [superVendors.id],
    }),
    hospital: one(hospitals, {
      fields: [consignmentClosets.hospitalId],
      references: [hospitals.id],
    }),
    provider: one(providers, {
      fields: [consignmentClosets.providerId],
      references: [providers.id],
    }),
    items: many(consignmentClosetItems),
  })
);

// Consignment Closet Items
export const consignmentClosetItems = sqliteTable(
  "consignment_closet_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    consignmentClosetId: text("consignment_closet_id").notNull(),
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    manufacturerItemNumber: text("manufacturer_item_number"),
    manufacturerName: text("manufacturer_name"),
    unitOfMeasurement: text("unit_of_measurement"),
    par: integer("par"),
    onHand: integer("on_hand"),
    varianceReason: text("variance_reason").default("Missing"),
    location: text("location"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("consignment_closet_items_closet_id_idx").on(
      table.consignmentClosetId
    ),
    index("consignment_closet_items_hcpc_desc_idx").on(
      table.hcpcCode,
      table.description
    ),
  ]
);

export const consignmentClosetItemsRelations = relations(
  consignmentClosetItems,
  ({ one, many }) => ({
    consignmentCloset: one(consignmentClosets, {
      fields: [consignmentClosetItems.consignmentClosetId],
      references: [consignmentClosets.id],
    }),
    activityLogs: many(consignmentActivityLogs),
    cycleCountReports: many(cycleCountReports),
    usageRateMetrics: many(usageRateMetrics),
  })
);

// Consignment Activity Logs
export const consignmentActivityLogs = sqliteTable(
  "consignment_activity_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    consignmentClosetItemId: text("consignment_closet_item_id").notNull(),
    changeType: text("change_type").notNull(), // INCREMENT | DECREMENT | PAR_ADJUSTMENT | INITIAL_SETUP | CYCLE_COUNT_ADJUSTMENT
    field: text("field").notNull(), // DISPENSED | ON_HAND | PAR_LEVEL | REORDER_TRIGGER_THRESHOLD
    previousValue: integer("previous_value"),
    newValue: integer("new_value"),
    change: integer("change"),
    timestamp: text("timestamp").notNull(),
    performedBy: text("performed_by").notNull(),
    hospitalVendorId: text("hospital_vendor_id").notNull(),
    description: text("description"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("consignment_activity_logs_item_id_idx").on(
      table.consignmentClosetItemId
    ),
  ]
);

export const consignmentActivityLogsRelations = relations(
  consignmentActivityLogs,
  ({ one }) => ({
    consignmentClosetItem: one(consignmentClosetItems, {
      fields: [consignmentActivityLogs.consignmentClosetItemId],
      references: [consignmentClosetItems.id],
    }),
    performedByUser: one(users, {
      fields: [consignmentActivityLogs.performedBy],
      references: [users.id],
    }),
  })
);

// Cycle Count Reports
export const cycleCountReports = sqliteTable(
  "cycle_count_reports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    consignmentClosetItemId: text("consignment_closet_item_id").notNull(),
    location: text("location"),
    expectedQuantity: integer("expected_quantity"),
    countedQuantity: integer("counted_quantity"),
    varianceReason: text("variance_reason"),
    counterId: text("counter_id").notNull(),
    countDate: text("count_date").notNull(),
    nextScheduledCountDate: text("next_scheduled_count_date"),
    isArchived: integer("is_archived").default(0),
    hospitalVendorId: text("hospital_vendor_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("cycle_count_reports_item_date_idx").on(
      table.consignmentClosetItemId,
      table.countDate
    ),
  ]
);

export const cycleCountReportsRelations = relations(
  cycleCountReports,
  ({ one }) => ({
    consignmentClosetItem: one(consignmentClosetItems, {
      fields: [cycleCountReports.consignmentClosetItemId],
      references: [consignmentClosetItems.id],
    }),
    counter: one(users, {
      fields: [cycleCountReports.counterId],
      references: [users.id],
    }),
  })
);

// Usage Rate Metrics
export const usageRateMetrics = sqliteTable(
  "usage_rate_metrics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    consignmentClosetItemId: text("consignment_closet_item_id").notNull(),
    dailyUsageRate: real("daily_usage_rate"),
    weeklyUsageRate: real("weekly_usage_rate"),
    monthlyUsageRate: real("monthly_usage_rate"),
    calculationDate: text("calculation_date").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("usage_rate_metrics_item_id_idx").on(
      table.consignmentClosetItemId
    ),
  ]
);

export const usageRateMetricsRelations = relations(
  usageRateMetrics,
  ({ one }) => ({
    consignmentClosetItem: one(consignmentClosetItems, {
      fields: [usageRateMetrics.consignmentClosetItemId],
      references: [consignmentClosetItems.id],
    }),
  })
);
