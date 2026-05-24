import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Manufacturer-issued recalls + affected-item tracking.
 *
 * Workflow:
 *   1. Operator files a recall (manufacturer notice → form)
 *   2. Service auto-scans inventory + POU events for matching
 *      hcpc_code / manufacturer_number / lot_number → writes
 *      recall_affected_items rows.
 *   3. Lab lots get auto-quarantined (status = QUARANTINED).
 *   4. Operator dispositions each affected_item (RETURN, DESTROY, etc.).
 *   5. Recall closes when all affected_items have dispositions.
 *
 * Classifications match FDA: I = serious health hazard, II = temporary,
 * III = unlikely to cause adverse health effects.
 */
export const RECALL_CLASSIFICATIONS = ['CLASS_I', 'CLASS_II', 'CLASS_III'] as const;
export const RECALL_STATES = ['OPEN', 'INVESTIGATING', 'CLOSED'] as const;
export const RECALL_ACTIONS = ['QUARANTINE', 'RETURN', 'DESTROY', 'NOTIFY_PATIENT'] as const;
export const RECALL_DISPOSITIONS = [
  'QUARANTINED', 'RETURNED', 'DESTROYED', 'PATIENT_NOTIFIED', 'NOT_FOUND',
] as const;

export const recalls = sqliteTable(
  'recalls',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    recallNumber: text('recall_number').notNull(),
    manufacturerRecallId: text('manufacturer_recall_id'),
    manufacturerName: text('manufacturer_name'),
    noticeReceivedAt: text('notice_received_at'),
    classification: text('classification'),
    severity: text('severity').notNull().default('WARN'),
    hcpcCode: text('hcpc_code'),
    manufacturerNumber: text('manufacturer_number'),
    lotNumbers: text('lot_numbers'),
    description: text('description').notNull(),
    actionRequired: text('action_required').notNull(),
    state: text('state').notNull().default('OPEN'),
    closedAt: text('closed_at'),
    closedByUserId: text('closed_by_user_id'),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('recalls_state_idx').on(t.state),
    index('recalls_hcpc_idx').on(t.hcpcCode),
    index('recalls_severity_idx').on(t.severity),
  ],
);

export const recallAffectedItems = sqliteTable(
  'recall_affected_items',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    recallId: text('recall_id').notNull(),
    kind: text('kind').notNull(),                              // LAB_LOT | INVENTORY | POU_EVENT
    subjectId: text('subject_id').notNull(),
    hospitalId: text('hospital_id'),
    facilityId: text('facility_id'),
    lotNumber: text('lot_number'),
    quantityAffected: integer('quantity_affected'),
    patientMrn: text('patient_mrn'),
    disposition: text('disposition'),
    dispositionedAt: text('dispositioned_at'),
    dispositionedByUserId: text('dispositioned_by_user_id'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('recall_affected_items_recall_idx').on(t.recallId),
    index('recall_affected_items_subject_idx').on(t.kind, t.subjectId),
  ],
);
