import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

export const inventory = sqliteTable(
  "inventory",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    s3key: text("s3key"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("inventory_vendor_id_idx").on(table.vendorId)]
);

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [inventory.vendorId],
    references: [vendors.id],
  }),
  items: many(inventoryItems),
}));

/**
 * inventory_items — SKU master records.
 *
 * `itemType` decides whether the SKU is lot-tracked (implants, biologics)
 * or a generic NON_LOT supply. Physical lot-numbered stock lives in
 * `inventory_lots` (one SKU → many lots). `lot_number` used to live on this
 * table but was promoted to its own table in migration 0007.
 */
export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    inventoryId: text("inventory_id").notNull(),
    hcpcCode: text("hcpc_code").notNull(),
    description: text("description"),
    manufacturerItemNumber: text("manufacturer_item_number"),
    manufacturerName: text("manufacturer_name"),
    unitOfMeasurement: text("unit_of_measurement"),
    isCustomFit: integer("is_custom_fit").default(0),
    itemType: text("item_type").notNull().default("NON_LOT"), // 'LOT' | 'NON_LOT'
    bundleHcpcCodes: text("bundle_hcpc_codes"), // JSON array of child HCPC codes
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inventory_items_inventory_id_idx").on(table.inventoryId),
    index("inventory_items_hcpc_desc_idx").on(
      table.hcpcCode,
      table.description
    ),
    index("inventory_items_item_type_idx").on(table.itemType),
  ]
);

export const inventoryItemsRelations = relations(
  inventoryItems,
  ({ one, many }) => ({
    inventory: one(inventory, {
      fields: [inventoryItems.inventoryId],
      references: [inventory.id],
    }),
    lots: many(inventoryLots),
  })
);

/**
 * inventory_lots — per-lot physical stock for LOT-tracked SKUs.
 *
 * One inventoryItem (SKU) can have many lots. `quantity_on_hand` decrements
 * when a lot is consumed during an encounter. Deleting a lot is blocked
 * while qty > 0 to preserve the audit trail.
 */
export const inventoryLots = sqliteTable(
  "inventory_lots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    inventoryItemId: text("inventory_item_id").notNull(),
    lotNumber: text("lot_number").notNull(),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    /**
     * Optional — the vendor branch physically holding this lot. NULL means
     * "unassigned / stocked at vendor's primary location". Phase 2 of the
     * multi-location routing work (migration 0008) will tighten this to NOT
     * NULL after a backfill; Phase 1 keeps it optional for compatibility.
     */
    vendorLocationId: text("vendor_location_id"),
    expirationDate: text("expiration_date"),
    manufacturerDate: text("manufacturer_date"),
    receivedAt: text("received_at"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("inventory_lots_item_idx").on(table.inventoryItemId),
    index("inventory_lots_lot_idx").on(table.lotNumber),
    index("inventory_lots_location_idx").on(table.vendorLocationId),
    uniqueIndex("inventory_lots_item_lot_uniq").on(
      table.inventoryItemId,
      table.lotNumber
    ),
  ]
);

export const inventoryLotsRelations = relations(inventoryLots, ({ one }) => ({
  inventoryItem: one(inventoryItems, {
    fields: [inventoryLots.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));
