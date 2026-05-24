import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Append-only chain-of-custody log for DEA Schedule II–V items.
 *
 * Every receipt, dispense, waste, transfer, count, and discrepancy
 * generates one row. Schedule II events MUST carry a `witnessedByUserId`
 * (enforced by the service layer); other schedules SHOULD.
 *
 * `quantityAfter` is the running balance after this event (computed by
 * the service via the last log row's `quantityAfter`).
 */
export const CONTROLLED_EVENT_TYPES = [
  'RECEIVE', 'DISPENSE', 'WASTE', 'TRANSFER', 'COUNT', 'DISCREPANCY',
] as const;
export type ControlledEventType = (typeof CONTROLLED_EVENT_TYPES)[number];

export const DEA_SCHEDULES = ['II', 'III', 'IV', 'V'] as const;
export type DeaSchedule = (typeof DEA_SCHEDULES)[number];

export const controlledSubstanceLog = sqliteTable(
  'controlled_substance_log',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    facilityId: text('facility_id'),
    formularyItemId: text('formulary_item_id'),
    hcpcCode: text('hcpc_code'),
    deaSchedule: text('dea_schedule'),
    eventType: text('event_type').notNull(),
    quantity: integer('quantity').notNull(),
    quantityAfter: integer('quantity_after'),
    patientMrn: text('patient_mrn'),
    encounterId: text('encounter_id'),
    lotNumber: text('lot_number'),
    performedByUserId: text('performed_by_user_id').notNull(),
    witnessedByUserId: text('witnessed_by_user_id'),
    notes: text('notes'),
    occurredAt: text('occurred_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('controlled_substance_log_hospital_idx').on(t.hospitalId),
    index('controlled_substance_log_item_idx').on(t.formularyItemId),
    index('controlled_substance_log_event_idx').on(t.eventType),
    index('controlled_substance_log_occurred_idx').on(t.occurredAt),
  ],
);
