import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Requisitions — purchase requests that LIVE SEPARATELY from Orders.
 *
 * This is the enterprise-standard pattern (SAP Ariba / Coupa / Oracle / Workday):
 *   1. Requester creates a REQUISITION (a request for goods, NOT a vendor commitment).
 *   2. Requisition runs through approval workflow.
 *   3. Once APPROVED, it converts into one or more ORDERS (one per vendor split).
 *
 * Why separate from orders?
 *   - A requisition can be denied without a vendor ever being contacted.
 *   - A requisition with multiple vendors becomes multiple orders.
 *   - Requisition approval rules can differ from order placement rules.
 *   - Spend forecasting needs to see committed + pending requisitions, not just orders.
 *
 * State machine:
 *   DRAFT ──submit──► SUBMITTED ──review──► IN_REVIEW ──┬─approve─► APPROVED ──convert─► CONVERTED
 *                                                       └─reject──► REJECTED
 *   Any non-terminal state ──cancel──► CANCELLED
 */
export const REQUISITION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CONVERTED',
  'CANCELLED',
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type RequisitionPriority = (typeof REQUISITION_PRIORITIES)[number];

export const requisitions = sqliteTable(
  'requisitions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requisitionNumber: text('requisition_number').notNull(), // e.g. REQ-2026-00012
    hospitalId: text('hospital_id').notNull(),
    facilityId: text('facility_id'),
    departmentId: text('department_id'),
    requestedByUserId: text('requested_by_user_id').notNull(),
    title: text('title').notNull(),
    justification: text('justification'),
    status: text('status').notNull().default('DRAFT'),
    priority: text('priority').notNull().default('NORMAL'),
    neededByDate: text('needed_by_date'),
    estimatedTotalUsd: real('estimated_total_usd'),
    approverUserId: text('approver_user_id'),
    approvedAt: text('approved_at'),
    rejectedReason: text('rejected_reason'),
    convertedAt: text('converted_at'),
    // JSON array of generated order IDs after CONVERTED
    convertedOrderIds: text('converted_order_ids'),
    payorId: text('payor_id'),
    priorAuthId: text('prior_auth_id'),
    templateId: text('template_id'), // optional pointer to requisition_templates
    notes: text('notes'),
    // Budget linkage — set on submit when an active budget covers the
    // requisition's (hospital, department/costCenter, fiscalYear). Used to
    // roll back the commit if the requisition is REJECTED or CANCELLED.
    budgetId: text('budget_id'),
    costCenter: text('cost_center'),
    // Emergency purchasing (PV3-B): when set, requisition bypasses standard
    // approval rules and is routed to the post-hoc review queue.
    isEmergency: integer('is_emergency').notNull().default(0),
    emergencyReason: text('emergency_reason'),
    emergencyReviewStatus: text('emergency_review_status'),    // PENDING_REVIEW | REVIEWED_OK | REVIEWED_FLAG
    emergencyReviewedAt: text('emergency_reviewed_at'),
    emergencyReviewedByUserId: text('emergency_reviewed_by_user_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('requisitions_hospital_idx').on(t.hospitalId),
    index('requisitions_status_idx').on(t.status),
    index('requisitions_requester_idx').on(t.requestedByUserId),
    index('requisitions_approver_idx').on(t.approverUserId),
    index('requisitions_needed_by_idx').on(t.neededByDate),
    index('requisitions_budget_idx').on(t.budgetId),
  ],
);

export const requisitionItems = sqliteTable(
  'requisition_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requisitionId: text('requisition_id').notNull(),
    formularyItemId: text('formulary_item_id'), // null = off-formulary
    hcpcCode: text('hcpc_code').notNull(),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    estimatedUnitPriceUsd: real('estimated_unit_price_usd'),
    preferredVendorId: text('preferred_vendor_id'),
    justification: text('justification'), // required for off-formulary or restricted
    substitutesAllowed: integer('substitutes_allowed').notNull().default(1),
    // Line-level approval state, in case some lines need overrides while others are auto-approved
    approvalStatus: text('approval_status').notNull().default('PENDING'),
    isOffFormulary: integer('is_off_formulary').notNull().default(0),
    requiresPriorAuth: integer('requires_prior_auth').notNull().default(0),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('requisition_items_req_idx').on(t.requisitionId),
    index('requisition_items_hcpc_idx').on(t.hcpcCode),
  ],
);

export const requisitionHistory = sqliteTable(
  'requisition_history',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requisitionId: text('requisition_id').notNull(),
    action: text('action').notNull(), // SUBMITTED / APPROVED / REJECTED / REVISED / CANCELLED / CONVERTED / COMMENT
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    byUserId: text('by_user_id'),
    comment: text('comment'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('requisition_history_req_idx').on(t.requisitionId)],
);
