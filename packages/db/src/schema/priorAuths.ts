import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Prior Authorization records.
 *
 * Lifecycle (state machine):
 *   NEEDED      → just identified as needed
 *   SUBMITTED   → packet sent to payor
 *   PENDING     → payor acknowledged, working on decision
 *   APPROVED    → coverage authorized
 *   DENIED      → coverage refused
 *   EXPIRED     → authorization no longer valid
 *   CANCELLED   → withdrawn by hospital/provider
 *
 * Closes the largest competitive gap vs. Parachute Health (which has had
 * PA since 2024). Required to be credible to payors and chain DME suppliers.
 */
export const PRIOR_AUTH_STATUSES = [
  "NEEDED",
  "SUBMITTED",
  "PENDING",
  "APPROVED",
  "DENIED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type PriorAuthStatus = (typeof PRIOR_AUTH_STATUSES)[number];

export const priorAuths = sqliteTable(
  "prior_auths",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Anchors
    orderId: text("order_id"),                   // optional — PA can pre-exist the order
    hospitalId: text("hospital_id"),
    payorId: text("payor_id").notNull(),
    // Nullable because the PA intake wizard supports orders where the
    // member ID is not yet known at PA creation time (DME gap 5).
    payorMemberId: text("payor_member_id"),
    payorGroupId: text("payor_group_id"),

    // Patient (denormalized for fast lookup)
    patientName: text("patient_name").notNull(),
    patientDob: text("patient_dob"),

    // Clinical
    hcpcCode: text("hcpc_code").notNull(),
    icd10Codes: text("icd10_codes"), // JSON array
    clinicalNote: text("clinical_note"),

    // Authorization
    authNumber: text("auth_number"),            // payor's auth number once issued
    status: text("status").notNull().default("NEEDED"),
    statusReason: text("status_reason"),         // denial reason or notes
    quantityApproved: integer("quantity_approved"),
    submittedAt: text("submitted_at"),
    decisionAt: text("decision_at"),
    submissionExternalRef: text("submission_external_ref"),
    submissionSimulated: integer("submission_simulated").default(0),

    // Coverage window
    effectiveStartDate: text("effective_start_date"),
    effectiveEndDate: text("effective_end_date"),

    // Attached docs (R2 keys, JSON array)
    documentBlobKeys: text("document_blob_keys"),

    // Audit
    createdBy: text("created_by"),
    lastEditedBy: text("last_edited_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("prior_auths_order_idx").on(table.orderId),
    index("prior_auths_status_idx").on(table.status),
    index("prior_auths_payor_member_idx").on(table.payorId, table.payorMemberId),
    index("prior_auths_expiry_idx").on(table.effectiveEndDate),
  ]
);

/**
 * Audit log for status transitions. Every change to `prior_auths.status`
 * writes a row here.
 */
export const priorAuthHistory = sqliteTable(
  "prior_auth_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    priorAuthId: text("prior_auth_id").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    reason: text("reason"),
    changedBy: text("changed_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("prior_auth_history_pa_idx").on(table.priorAuthId)]
);
