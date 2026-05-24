import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Per-HCPC allowable rates negotiated with a payor.
 *
 * The pricing cascade considers payor rates when a payor is attached to
 * the order. Order of precedence:
 *   Contract → GPO Contract → Payor Allowable → Fee Schedule → Medicare → Manual
 *
 * Optional `vendorId` lets a payor contract apply to a specific vendor only.
 * NULL `vendorId` means "applies regardless of vendor".
 */
export const payorContractItems = sqliteTable(
  "payor_contract_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payorId: text("payor_id").notNull(),
    vendorId: text("vendor_id"),
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    allowableUsd: real("allowable_usd").notNull(),
    patientResponsibilityUsd: real("patient_responsibility_usd"), // copay/coinsurance estimate
    effectiveStartDate: text("effective_start_date").notNull(),
    effectiveEndDate: text("effective_end_date"),
    requiresPriorAuth: integer("requires_prior_auth").notNull().default(0),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("payor_contract_items_uq").on(
      table.payorId,
      table.vendorId,
      table.hcpcCode,
      table.effectiveStartDate
    ),
    index("payor_contract_items_hcpc_idx").on(table.hcpcCode),
    index("payor_contract_items_payor_idx").on(table.payorId),
  ]
);

/**
 * Cached eligibility check results. A real implementation would call an
 * X12 270/271 endpoint; this stub records what we've checked + cached responses
 * for the dashboard. Future PR can plug in a real EDI clearinghouse.
 */
export const eligibilityChecks = sqliteTable(
  "eligibility_checks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    payorId: text("payor_id").notNull(),
    patientMemberId: text("patient_member_id").notNull(),
    patientName: text("patient_name"),
    patientDob: text("patient_dob"),
    requestedHcpcCode: text("requested_hcpc_code"),
    orderId: text("order_id"),
    status: text("status").notNull(), // ACTIVE | INACTIVE | UNKNOWN | ERROR
    benefitNotes: text("benefit_notes"),
    copayUsd: real("copay_usd"),
    deductibleUsd: real("deductible_usd"),
    deductibleMetUsd: real("deductible_met_usd"),
    rawResponse: text("raw_response"), // full 271 or stubbed JSON
    checkedAt: text("checked_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("eligibility_checks_member_idx").on(table.payorId, table.patientMemberId),
    index("eligibility_checks_order_idx").on(table.orderId),
  ]
);

export const ELIGIBILITY_STATUSES = ["ACTIVE", "INACTIVE", "UNKNOWN", "ERROR"] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];
