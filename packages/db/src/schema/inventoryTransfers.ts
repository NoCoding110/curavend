import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Hospital-side cross-facility stock transfers.
 *
 * Distinct from lab `TRANSFER_OUT/IN` movements (which are kit-site to
 * kit-site within a lab_group). This table covers facility-to-facility
 * within one hospital (e.g. main hospital → satellite clinic).
 *
 * State machine: REQUESTED → APPROVED → SHIPPED → RECEIVED (terminal)
 *                           ↓
 *                       CANCELLED (from any non-terminal)
 */
export const TRANSFER_STATES = [
  'REQUESTED', 'APPROVED', 'SHIPPED', 'RECEIVED', 'CANCELLED',
] as const;
export type TransferState = (typeof TRANSFER_STATES)[number];

export const TRANSFER_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TransferPriority = (typeof TRANSFER_PRIORITIES)[number];

export const inventoryTransfers = sqliteTable(
  'inventory_transfers',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transferNumber: text('transfer_number').notNull(),
    hospitalId: text('hospital_id').notNull(),
    fromFacilityId: text('from_facility_id').notNull(),
    toFacilityId: text('to_facility_id').notNull(),
    requestedByUserId: text('requested_by_user_id'),
    approvedByUserId: text('approved_by_user_id'),
    state: text('state').notNull().default('REQUESTED'),
    priority: text('priority').notNull().default('NORMAL'),
    reason: text('reason'),
    trackingNumber: text('tracking_number'),
    shippedAt: text('shipped_at'),
    receivedAt: text('received_at'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('inventory_transfers_hospital_idx').on(t.hospitalId),
    index('inventory_transfers_state_idx').on(t.state),
    index('inventory_transfers_from_idx').on(t.fromFacilityId),
    index('inventory_transfers_to_idx').on(t.toFacilityId),
  ],
);

export const inventoryTransferLines = sqliteTable(
  'inventory_transfer_lines',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    transferId: text('transfer_id').notNull(),
    hcpcCode: text('hcpc_code'),
    description: text('description'),
    quantity: integer('quantity').notNull().default(1),
    lotNumber: text('lot_number'),
    unitCostUsd: real('unit_cost_usd'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('inventory_transfer_lines_transfer_idx').on(t.transferId)],
);
