import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const LAB_ORDER_STATUSES = [
  "OPEN",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "REJECTED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "QC_FAILED",
] as const;

export const LAB_ORDER_QC_STATUSES = ["PENDING", "PASSED", "FAILED"] as const;
export type LabOrderQcStatus = (typeof LAB_ORDER_QC_STATUSES)[number];
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];

export const labOrders = sqliteTable(
  "lab_orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderNumber: text("order_number").notNull().unique(),
    parentOrderId: text("parent_order_id"),
    lcOrderReference: text("lc_order_reference"),
    labGroupId: text("lab_group_id").notNull(),
    kitSiteId: text("kit_site_id"),
    createdByUserId: text("created_by_user_id").notNull(),
    patientName: text("patient_name"),
    patientLastName: text("patient_last_name"),
    patientEmail: text("patient_email"),
    patientPhone: text("patient_phone"),
    patientAddress: text("patient_address"),
    patientCity: text("patient_city"),
    patientState: text("patient_state"),
    patientZip: text("patient_zip"),
    quantity: integer("quantity").notNull().default(1),
    dxCodeList: text("dx_code_list"), // JSON array
    testList: text("test_list"), // JSON array of {testCode, testName}
    status: text("status").notNull().default("OPEN"),
    readyForApproval: integer("ready_for_approval").notNull().default(0),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    rejectionReason: text("rejection_reason"),
    rejectedBy: text("rejected_by"),
    rejectedAt: text("rejected_at"),
    trfBlobKey: text("trf_blob_key"),
    shippingLabelBlobKey: text("shipping_label_blob_key"),
    returnLabelBlobKey: text("return_label_blob_key"),
    stickersBlobKey: text("stickers_blob_key"),
    consolidatedAssetsBlobKey: text("consolidated_assets_blob_key"),
    trackingNumber: text("tracking_number"),
    carrier: text("carrier"),
    shippedAt: text("shipped_at"),
    deliveredAt: text("delivered_at"),
    notes: text("notes"),
    // ── QC + external fulfillment (athome parity) ─────────────────────────
    qcAttemptCount: integer("qc_attempt_count").notNull().default(0),
    qcPermanentlyFailed: integer("qc_permanently_failed").notNull().default(0),
    qcFailureReason: text("qc_failure_reason"),
    qcStatus: text("qc_status").notNull().default("PENDING"),
    externalVendorName: text("external_vendor_name"),
    externalVendorStatus: text("external_vendor_status"),
    externalOrderRef: text("external_order_ref"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lab_orders_group_id_idx").on(table.labGroupId),
    index("lab_orders_kit_site_id_idx").on(table.kitSiteId),
    index("lab_orders_status_idx").on(table.status),
    index("lab_orders_created_by_idx").on(table.createdByUserId),
    index("lab_orders_created_at_idx").on(table.createdAt),
    index("lab_orders_parent_order_idx").on(table.parentOrderId),
    index("lab_orders_external_order_ref_idx").on(table.externalOrderRef),
  ]
);
