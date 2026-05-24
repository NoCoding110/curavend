import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Item Master / Formulary.
 *
 * A row says "this HCPC item is approved for use at this hospital (and optionally
 * at this specific facility)". The formulary is the authoritative whitelist of
 * what can be requisitioned. It powers:
 *   • requisition validation (off-formulary requires approval)
 *   • preferred-vendor steering
 *   • max-unit-price guardrails (alerts when actual price exceeds threshold)
 *   • prior-auth flag (auto-creates a prior auth task on requisition)
 *   • restricted items (special approval gate)
 *   • par-level reorder triggers (used by recurring-orders + forecasting)
 *
 * Scope:
 *   • hospital_id is always set (which hospital owns this formulary row).
 *   • facility_id is nullable — NULL means org-wide. A facility-specific row
 *     overrides an org-wide row for that facility.
 */
export const FORMULARY_STATUSES = ["ACTIVE", "INACTIVE", "RETIRED"] as const;
export type FormularyStatus = (typeof FORMULARY_STATUSES)[number];

export const formularyItems = sqliteTable(
  "formulary_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text("hospital_id").notNull(),
    facilityId: text("facility_id"), // null = org-wide
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description").notNull(),
    category: text("category"), // e.g. "Wound Care", "Mobility", "DME"
    preferredVendorId: text("preferred_vendor_id"),
    secondaryVendorId: text("secondary_vendor_id"),
    maxUnitPriceUsd: real("max_unit_price_usd"),
    requiresPriorAuth: integer("requires_prior_auth").notNull().default(0),
    // PV3-G: DEA Schedule (II | III | IV | V). When set, dispenses must
    // write to controlled_substance_log + Schedule II requires a witness.
    deaSchedule: text("dea_schedule"),
    isRestricted: integer("is_restricted").notNull().default(0),
    restrictionReason: text("restriction_reason"),
    parLevel: integer("par_level"), // reorder when on-hand drops below this
    reorderQuantity: integer("reorder_quantity"),
    unitOfMeasure: text("unit_of_measure"),
    status: text("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    createdByUserId: text("created_by_user_id"),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // One formulary row per (hospital, facility-or-null, hcpc). A facility-specific
    // row coexists with the org-wide row; the facility-specific one wins for that facility.
    uniqueIndex("formulary_items_uq").on(
      table.hospitalId,
      table.facilityId,
      table.hcpcCode
    ),
    index("formulary_items_hospital_idx").on(table.hospitalId),
    index("formulary_items_facility_idx").on(table.facilityId),
    index("formulary_items_hcpc_idx").on(table.hcpcCode),
    index("formulary_items_status_idx").on(table.status),
  ]
);
