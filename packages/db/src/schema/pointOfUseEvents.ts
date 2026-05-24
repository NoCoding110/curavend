import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Append-only log of point-of-use (bedside / procedure room) item
 * consumption. Each row attributes one item-use to a patient/encounter,
 * decrementing inventory and feeding cost-attribution + analytics.
 *
 * Captured via:
 *   - Bedside scanner POST /api/point-of-use
 *   - Kiosk in procedure room
 *   - Manual entry on order detail
 */
export const pointOfUseEvents = sqliteTable(
  'point_of_use_events',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    facilityId: text('facility_id'),
    departmentId: text('department_id'),
    roomId: text('room_id'),
    patientMrn: text('patient_mrn'),
    encounterId: text('encounter_id'),
    providerUserId: text('provider_user_id'),
    hcpcCode: text('hcpc_code'),
    formularyItemId: text('formulary_item_id'),
    manufacturerNumber: text('manufacturer_number'),
    serialNumber: text('serial_number'),
    lotNumber: text('lot_number'),
    quantity: integer('quantity').notNull().default(1),
    unitPriceUsd: real('unit_price_usd'),
    inventoryLotId: text('inventory_lot_id'),
    capturedAt: text('captured_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    capturedByUserId: text('captured_by_user_id'),
    deviceId: text('device_id'),
    notes: text('notes'),
    // Charge capture (PV3-D): FK to invoice_items once the POU event has
    // been billed. UNCHARGED rows drive the leakage report.
    invoiceItemId: text('invoice_item_id'),
    chargeStatus: text('charge_status').notNull().default('UNCHARGED'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('point_of_use_events_hospital_idx').on(t.hospitalId),
    index('point_of_use_events_dept_idx').on(t.departmentId),
    index('point_of_use_events_encounter_idx').on(t.encounterId),
    index('point_of_use_events_patient_idx').on(t.patientMrn),
    index('point_of_use_events_captured_at_idx').on(t.capturedAt),
  ],
);
