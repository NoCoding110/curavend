import {
  sqliteTable,
  text,
  real,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { hospitals } from "./hospitals";
import { vendors } from "./vendors";
import { providers } from "./providers";
import { customFeeSchedules } from "./feeSchedules";
import { consignmentClosets } from "./consignment";
import { contracts } from "./contracts";
import { hospitalFacilities } from "./hospitalFacilities";

/**
 * hospital_vendors — hospital-to-vendor preferences.
 *
 * Scoping columns added in migration 0008 to support multi-location routing:
 *   - facility_id     (nullable; NULL = hospital-wide fallback)
 *   - priority        (lower = preferred; default 100)
 *   - item_categories (JSON array of category tokens; NULL = all)
 *
 * The unique constraint is (hospital_id, vendor_id, facility_id|'', item_categories|'')
 * — see migration 0008. NULLs collapse to empty strings inside the index so
 * you cannot register the same vendor twice for the same (hospital, facility,
 * category) scope.
 */
export const hospitalVendors = sqliteTable(
  "hospital_vendors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text("hospital_id").notNull(),
    vendorId: text("vendor_id").notNull(),
    providerId: text("provider_id").notNull(),
    facilityId: text("facility_id"),
    priority: integer("priority").notNull().default(100),
    itemCategories: text("item_categories"), // JSON array; NULL = all
    state: text("state"),
    contractRate: real("contract_rate"),
    customFeeScheduleId: text("custom_fee_schedule_id"),
    consignmentClosetId: text("consignment_closet_id"),
    contractId: text("contract_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("hospital_vendors_hospital_id_idx").on(table.hospitalId),
    index("hospital_vendors_vendor_id_idx").on(table.vendorId),
    index("hospital_vendors_provider_id_idx").on(table.providerId),
    index("hospital_vendors_facility_idx").on(table.facilityId),
    index("hospital_vendors_priority_idx").on(table.priority),
  ]
);

export const hospitalVendorsRelations = relations(
  hospitalVendors,
  ({ one }) => ({
    hospital: one(hospitals, {
      fields: [hospitalVendors.hospitalId],
      references: [hospitals.id],
    }),
    vendor: one(vendors, {
      fields: [hospitalVendors.vendorId],
      references: [vendors.id],
    }),
    provider: one(providers, {
      fields: [hospitalVendors.providerId],
      references: [providers.id],
    }),
    facility: one(hospitalFacilities, {
      fields: [hospitalVendors.facilityId],
      references: [hospitalFacilities.id],
    }),
    customFeeSchedule: one(customFeeSchedules, {
      fields: [hospitalVendors.customFeeScheduleId],
      references: [customFeeSchedules.id],
    }),
    consignmentCloset: one(consignmentClosets, {
      fields: [hospitalVendors.consignmentClosetId],
      references: [consignmentClosets.id],
    }),
    contract: one(contracts, {
      fields: [hospitalVendors.contractId],
      references: [contracts.id],
    }),
  })
);
