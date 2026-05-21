import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

/**
 * vendor_locations — a single vendor can operate multiple branches
 * (warehouses, fitting centers, distribution hubs, headquarters).
 *
 * Each location carries its own address, service area, capabilities, and
 * delivery SLA. The routing engine picks the best location for a given
 * order based on the hospital-facility state and item requirements
 * (see `packages/api/src/lib/vendorRouting.ts`).
 *
 * `capabilities` is a JSON array of tags like ["CUSTOM_FIT","STAT",
 * "REFRIGERATED","STERILE"]. `service_states` is a JSON array of
 * 2-letter US state codes. `service_zip_prefixes` is an optional
 * finer-grain filter (3-digit ZIP prefixes).
 */
export const vendorLocations = sqliteTable(
  "vendor_locations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    name: text("name").notNull(),
    locationType: text("location_type").notNull().default("WAREHOUSE"), // WAREHOUSE | FITTING_CENTER | HEADQUARTERS | DISTRIBUTION_HUB
    streetAddress: text("street_address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    phone: text("phone"),
    email: text("email"),
    isPrimary: integer("is_primary").notNull().default(0),
    isActive: integer("is_active").notNull().default(1),
    capabilities: text("capabilities"), // JSON array
    serviceStates: text("service_states"), // JSON array of state codes
    serviceZipPrefixes: text("service_zip_prefixes"), // optional JSON array
    maxDeliveryHours: integer("max_delivery_hours"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("vendor_locations_vendor_idx").on(table.vendorId),
    index("vendor_locations_state_idx").on(table.state),
    index("vendor_locations_active_idx").on(table.isActive),
  ]
);

export const vendorLocationsRelations = relations(vendorLocations, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorLocations.vendorId],
    references: [vendors.id],
  }),
}));
