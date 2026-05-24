import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";
import { hospitals } from "./hospitals";
import { providers } from "./providers";
import { superVendors } from "./superVendors";
import { rooms } from "./rooms";
import { invoices } from "./invoices";
import { purchaseOrders } from "./purchaseOrders";
import { users } from "./users";
import { orderItems } from "./orderItems";
import { orderHistory } from "./orderHistory";

export const orders = sqliteTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifier: text("identifier"),
    status: text("status").notNull().default("PENDING"), // PENDING | IN_PROGRESS | CANCELLED | COMPLETED
    orderSubStatus: text("order_sub_status").notNull().default("NEW_ORDER"), // NEW_ORDER | VENDOR_ASSIGNED | VENDOR_CONFIRMED_RECEIPT | VENDOR_DECLINED | FACILITY_CANCELLED | ORDER_REQUESTED_FOR_MODIFY | PATIENT_VISITED_AND_ASSESSED | DELIVERED | PROOF_UPLOADED | ORDER_COMPLETED
    orderSubStatusHistory: text("order_sub_status_history"), // JSON array
    declineReason: text("decline_reason"),
    modifyReason: text("modify_reason"),
    epicOrderStatus: text("epic_order_status"),
    // ── Payor reference (Feature 3, May 2026) ──────────────────────────
    payorId: text("payor_id"),
    payorMemberId: text("payor_member_id"),
    payorGroupId: text("payor_group_id"),
    // ── Requisition source link (Feature 8, May 2026) ───────────────────
    // When set, points to the requisitions row this order was spawned from.
    requisitionId: text("requisition_id"),
    // ── DME-specific intake lives in `dme_order_extensions` (sidecar
    //    table; orders schema is at SQLite's ALTER-TABLE column limit) ──
    intent: text("intent"),
    priority: text("priority").default("routine"),
    requester: text("requester"),
    requesterResource: text("requester_resource"),
    authoredOn: text("authored_on"),
    subjectResource: text("subject_resource"),
    patientId: text("patient_id"),
    patientName: text("patient_name"),
    patientLastName: text("patient_last_name"),
    patientEmail: text("patient_email"),
    patientPhone: text("patient_phone"),
    patientAddress: text("patient_address"),
    patientGender: text("patient_gender"),
    patientBirthDate: text("patient_birth_date"),
    performerResource: text("performer_resource"),
    performer: text("performer"),
    insuranceResource: text("insurance_resource"),
    insurance: text("insurance"),
    insuranceId: text("insurance_id"),
    authProvider: text("auth_provider"),
    refProvider: text("ref_provider"),
    signDateTime: text("sign_date_time"),
    department: text("department"),
    departmentNumber: text("department_number"),
    facility: text("facility"),
    facilityNumber: text("facility_number"),
    diagnosis: text("diagnosis"),
    icd10: text("icd10"),
    extremity: text("extremity"),
    comment: text("comment"),
    room: text("room"),
    bed: text("bed"),
    location: text("location"),
    insurancePay: text("insurance_pay"),
    assessedBy: text("assessed_by"),
    assessmentComment: text("assessment_comment"),
    assessmentDateTime: text("assessment_date_time"),
    deliveredBy: text("delivered_by"),
    deliveryDateTime: text("delivery_date_time"),
    deliveryComment: text("delivery_comment"),
    deliverySignAttachment: text("delivery_sign_attachment"),
    deliverySignedAt: text("delivery_signed_at"),
    deliveryAcceptedBy: text("delivery_accepted_by"),
    deliveryGuarantorName: text("delivery_guarantor_name"),
    agreementSendBy: text("agreement_send_by").default("NONE"),
    attachments: text("attachments"), // JSON array
    encounterAttachment: text("encounter_attachment"),
    originalOrderAttachment: text("original_order_attachment"),
    modifyInvoiceReason: text("modify_invoice_reason"),
    purchaseOrderNumber: text("purchase_order_number"),
    isDispensed: integer("is_dispensed").default(0),
    vendorId: text("vendor_id"),
    vendorReferenceNumber: text("vendor_reference_number"),
    vendorOpened: integer("vendor_opened").default(0),
    hospitalId: text("hospital_id").notNull(),
    providerId: text("provider_id"),
    superVendorId: text("super_vendor_id"),
    roomId: text("room_id"),
    invoiceId: text("invoice_id"),
    purchaseOrderId: text("purchase_order_id"),
    facilityId: text("facility_id"),
    departmentId: text("department_id"),
    physicianId: text("physician_id"),
    replacesOrderId: text("replaces_order_id"),
    /**
     * When a single user-initiated order must be split across multiple
     * vendors (wound-care vendor A + orthotics vendor B, etc.), the API
     * creates N sibling orders — each with the same `parent_order_id`.
     * NULL means the order is a standalone (single-vendor) order.
     * See migration 0008.
     */
    parentOrderId: text("parent_order_id"),
    notifiedHospital: integer("notified_hospital").default(0),
    changedByUserId: text("changed_by_user_id"),

    // ── Customer PO (buyer side) ───────────────────────────────────
    customerPurchaseOrderId: text("customer_purchase_order_id"), // FK to customer_purchase_orders

    // ── Recurring orders ──────────────────────────────────────────
    recurrencePlanId: text("recurrence_plan_id"), // FK to order_recurrence_plans
    recurrenceIndex: integer("recurrence_index"), // 1, 2, 3 …

    // Note: shipping/carrier/tracking lives on `order_shipments` (1:N).
    // Note: orderer + shipTo + billTo + clinical contacts live on `order_contacts` (1:N).

    // ── Tax (overrides; per-line tax lives on invoice_items) ─────
    taxExempt: integer("tax_exempt").default(0),
    taxExemptCertificateId: text("tax_exempt_certificate_id"),
    taxJurisdictionCode: text("tax_jurisdiction_code"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("orders_vendor_id_idx").on(table.vendorId),
    index("orders_hospital_id_idx").on(table.hospitalId),
    index("orders_provider_id_idx").on(table.providerId),
    index("orders_super_vendor_id_idx").on(table.superVendorId),
    index("orders_purchase_order_id_idx").on(table.purchaseOrderId),
    index("orders_status_idx").on(table.status),
    index("orders_order_sub_status_idx").on(table.orderSubStatus),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_vendor_sign_dt_idx").on(table.vendorId, table.signDateTime),
    index("orders_vendor_created_idx").on(table.vendorId, table.createdAt),
    index("orders_hospital_sign_dt_idx").on(
      table.hospitalId,
      table.signDateTime
    ),
    index("orders_hospital_created_idx").on(
      table.hospitalId,
      table.createdAt
    ),
    index("orders_parent_order_id_idx").on(table.parentOrderId),
    index("orders_customer_po_idx").on(table.customerPurchaseOrderId),
    index("orders_recurrence_plan_idx").on(table.recurrencePlanId),
  ]
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [orders.vendorId],
    references: [vendors.id],
  }),
  hospital: one(hospitals, {
    fields: [orders.hospitalId],
    references: [hospitals.id],
  }),
  provider: one(providers, {
    fields: [orders.providerId],
    references: [providers.id],
  }),
  superVendor: one(superVendors, {
    fields: [orders.superVendorId],
    references: [superVendors.id],
  }),
  chatRoom: one(rooms, {
    fields: [orders.roomId],
    references: [rooms.id],
  }),
  invoice: one(invoices, {
    fields: [orders.invoiceId],
    references: [invoices.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [orders.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  changedByUser: one(users, {
    fields: [orders.changedByUserId],
    references: [users.id],
  }),
  items: many(orderItems),
  history: many(orderHistory),
}));
