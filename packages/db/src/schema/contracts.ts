import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";
import { superVendors } from "./superVendors";
import { providers } from "./providers";
import { hospitals } from "./hospitals";

// Possible statuses (string enum kept as TEXT in SQLite):
// DRAFT | PENDING_APPROVAL | APPROVED | ACTIVE | EXPIRED | TERMINATED | REJECTED | SUPERSEDED
export const contracts = sqliteTable(
  "contracts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    s3key: text("s3key"),
    name: text("name"),
    vendorId: text("vendor_id"),
    hospitalId: text("hospital_id"),
    superVendorId: text("super_vendor_id"),
    providerId: text("provider_id"),
    // Lifecycle fields
    status: text("status").notNull().default("DRAFT"),
    initiatedBy: text("initiated_by"), // HOSPITAL | VENDOR | ADMIN
    currentRevisionId: text("current_revision_id"),
    parentContractId: text("parent_contract_id"), // set when this contract amends/supersedes a previous one
    terminatedAt: text("terminated_at"),
    terminatedBy: text("terminated_by"),
    terminationReason: text("termination_reason"),
    rejectedReason: text("rejected_reason"),
    itemCategories: text("item_categories"), // JSON array — optional specialty scoping
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("contracts_vendor_id_idx").on(table.vendorId),
    index("contracts_hospital_id_idx").on(table.hospitalId),
    index("contracts_super_vendor_id_idx").on(table.superVendorId),
    index("contracts_provider_id_idx").on(table.providerId),
    index("contracts_status_idx").on(table.status),
    index("contracts_parent_contract_id_idx").on(table.parentContractId),
  ]
);

export const contractsRelations = relations(contracts, ({ one }) => ({
  vendor: one(vendors, {
    fields: [contracts.vendorId],
    references: [vendors.id],
  }),
  hospital: one(hospitals, {
    fields: [contracts.hospitalId],
    references: [hospitals.id],
  }),
  superVendor: one(superVendors, {
    fields: [contracts.superVendorId],
    references: [superVendors.id],
  }),
  provider: one(providers, {
    fields: [contracts.providerId],
    references: [providers.id],
  }),
}));

// Status enum exports for use in app code
export const CONTRACT_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_INITIATORS = ["HOSPITAL", "VENDOR", "ADMIN"] as const;
export type ContractInitiator = (typeof CONTRACT_INITIATORS)[number];

export const CONTRACT_REVIEW_DECISIONS = [
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
] as const;
export type ContractReviewDecision = (typeof CONTRACT_REVIEW_DECISIONS)[number];
