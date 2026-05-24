import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Lab consumables item master extension.
 *
 * Hospital DME items use `formulary_items`; lab reagents/swabs/kits/PPE/
 * controls need additional fields (storage temp, hazard class, lot tracking
 * flag, usage UOM) so they live in a sidecar keyed by item code.
 *
 * `itemCode` is a free-form SKU (manufacturer's catalog number or internal
 * code) — not HCPC, since reagents typically aren't HCPC-coded.
 */
export const LAB_CONSUMABLE_CATEGORIES = [
  'REAGENT',          // PCR mix, ELISA antibody, staining dye
  'CONTROL',          // QC material
  'CALIBRATOR',
  'KIT',              // pre-packaged test kit
  'SWAB',             // NP swab, throat swab
  'TUBE',             // collection tube (EDTA, SST, citrate)
  'PIPETTE_TIP',
  'PLATE',            // 96-well plate
  'PPE',              // gloves, gown, mask
  'CLEANING',         // bleach, ethanol
  'OTHER',
] as const;
export type LabConsumableCategory = (typeof LAB_CONSUMABLE_CATEGORIES)[number];

export const HAZARD_CLASSES = [
  'NONE',
  'BIOHAZARD',
  'CHEMICAL',
  'RADIOACTIVE',
  'FLAMMABLE',
  'CORROSIVE',
  'CONTROLLED_SUBSTANCE',
] as const;
export type HazardClass = (typeof HAZARD_CLASSES)[number];

export const labConsumables = sqliteTable(
  'lab_consumables',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Tenant scope — null = catalog item available to all labs
    labGroupId: text('lab_group_id'),
    itemCode: text('item_code').notNull(),       // SKU / catalog #
    description: text('description').notNull(),
    category: text('category').notNull(),         // see LAB_CONSUMABLE_CATEGORIES
    manufacturer: text('manufacturer'),
    manufacturerCatalog: text('manufacturer_catalog'),
    // Storage requirements
    storageTempMinC: real('storage_temp_min_c'),
    storageTempMaxC: real('storage_temp_max_c'),
    storageInstructions: text('storage_instructions'),
    hazardClass: text('hazard_class').notNull().default('NONE'),
    // Usage
    usageUom: text('usage_uom').notNull().default('each'),  // each / mL / test / box
    unitsPerCase: integer('units_per_case'),
    // Reorder thresholds (per-site values live on lab_inventory_lots aggregates)
    minThreshold: integer('min_threshold'),       // stockout floor
    maxThreshold: integer('max_threshold'),       // max desired on-hand
    reorderPoint: integer('reorder_point'),       // trigger replenishment
    reorderQuantity: integer('reorder_quantity'), // default order size
    requiresLotTracking: integer('requires_lot_tracking').notNull().default(1),
    // Vendor
    preferredVendorId: text('preferred_vendor_id'),
    defaultUnitPriceUsd: real('default_unit_price_usd'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('lab_consumables_uq').on(t.labGroupId, t.itemCode),
    index('lab_consumables_category_idx').on(t.category),
  ],
);

/**
 * Per-lot inventory record. One row per (consumable × lot # × site × expiration).
 *
 * `siteId` references `lab_kit_sites.id`. `quantityOnHand` is the canonical
 * stock value; movements are recorded in `lab_stock_movements` for audit.
 *
 * FEFO issuance: when consumed, the oldest non-expired lot at the site is
 * decremented first.
 */
export const LOT_STATUSES = ['ACTIVE', 'EXPIRED', 'QUARANTINED', 'RECALLED', 'DEPLETED'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export const labInventoryLots = sqliteTable(
  'lab_inventory_lots',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    consumableId: text('consumable_id').notNull(),
    siteId: text('site_id').notNull(),             // FK to lab_kit_sites
    lotNumber: text('lot_number').notNull(),
    serialNumber: text('serial_number'),
    expirationDate: text('expiration_date'),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    quantityReserved: integer('quantity_reserved').notNull().default(0),
    unitPriceUsd: real('unit_price_usd'),
    receivedAt: text('received_at'),
    receivedFromOrderId: text('received_from_order_id'),
    receivedFromGrnId: text('received_from_grn_id'),
    status: text('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('lab_lots_uq').on(t.consumableId, t.siteId, t.lotNumber),
    index('lab_lots_expiration_idx').on(t.expirationDate),
    index('lab_lots_status_idx').on(t.status),
    index('lab_lots_site_idx').on(t.siteId),
  ],
);

/**
 * Audit log for every stock movement. Append-only.
 *
 * Movement types:
 *   RECEIVE     — new lot or restock from goods receipt
 *   ISSUE       — consumed by lab use / test execution
 *   ADJUST      — manual correction (admin only)
 *   EXPIRE      — auto-marked when past expirationDate
 *   TRANSFER_OUT / TRANSFER_IN — inter-site movement (one of each per transfer)
 *   QUARANTINE  — pulled from active inventory pending decision
 *   RECALL      — vendor or manufacturer recall
 */
export const MOVEMENT_TYPES = [
  'RECEIVE',
  'ISSUE',
  'ADJUST',
  'EXPIRE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'QUARANTINE',
  'RECALL',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const labStockMovements = sqliteTable(
  'lab_stock_movements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lotId: text('lot_id').notNull(),
    consumableId: text('consumable_id').notNull(),
    siteId: text('site_id').notNull(),
    movementType: text('movement_type').notNull(),
    quantity: integer('quantity').notNull(),         // signed: positive for RECEIVE/TRANSFER_IN, negative for ISSUE/EXPIRE/TRANSFER_OUT
    quantityAfter: integer('quantity_after').notNull(),
    relatedOrderId: text('related_order_id'),
    relatedLabOrderId: text('related_lab_order_id'),
    relatedTransferId: text('related_transfer_id'),  // links the two halves of a TRANSFER
    reason: text('reason'),
    performedByUserId: text('performed_by_user_id'),
    occurredAt: text('occurred_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('lab_movements_lot_idx').on(t.lotId),
    index('lab_movements_site_idx').on(t.siteId),
    index('lab_movements_consumable_idx').on(t.consumableId),
    index('lab_movements_type_idx').on(t.movementType),
    index('lab_movements_occurred_idx').on(t.occurredAt),
  ],
);

/**
 * Test → consumable usage map. Tells the forecasting engine how much of each
 * consumable is used per test run. Example: a flu PCR test uses 1 swab,
 * 0.5 mL of PCR mix, 1 well of a 96-well plate.
 *
 * `testCode` is a free-form lab test identifier (CPT, LOINC, or internal).
 */
export const labTestConsumables = sqliteTable(
  'lab_test_consumables',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    labGroupId: text('lab_group_id'),
    testCode: text('test_code').notNull(),
    testDescription: text('test_description'),
    consumableId: text('consumable_id').notNull(),
    quantityPerTest: real('quantity_per_test').notNull(),
    isCritical: integer('is_critical').notNull().default(0), // if missing, test cannot run
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('lab_test_cons_uq').on(t.labGroupId, t.testCode, t.consumableId),
    index('lab_test_cons_test_idx').on(t.testCode),
    index('lab_test_cons_cons_idx').on(t.consumableId),
  ],
);

/**
 * Backorder lines auto-spawned when a goods receipt under-delivers.
 * Tracks expected fulfillment date and partial fill history.
 */
export const BACKORDER_STATUSES = ['OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'] as const;
export type BackorderStatus = (typeof BACKORDER_STATUSES)[number];

export const orderBackorders = sqliteTable(
  'order_backorders',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull(),
    originalOrderItemId: text('original_order_item_id'),
    hcpcCode: text('hcpc_code'),
    itemCode: text('item_code'),
    description: text('description'),
    quantityOrdered: integer('quantity_ordered').notNull(),
    quantityReceived: integer('quantity_received').notNull().default(0),
    quantityRemaining: integer('quantity_remaining').notNull(),
    status: text('status').notNull().default('OPEN'),
    expectedFulfillmentDate: text('expected_fulfillment_date'),
    vendorReference: text('vendor_reference'),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('order_backorders_order_idx').on(t.orderId),
    index('order_backorders_status_idx').on(t.status),
    index('order_backorders_expected_idx').on(t.expectedFulfillmentDate),
  ],
);
