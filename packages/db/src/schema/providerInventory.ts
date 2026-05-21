import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { providers } from "./providers";

export const providerInventory = sqliteTable(
  "provider_inventory",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text("provider_id"),
    s3key: text("s3key"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("provider_inventory_provider_id_idx").on(table.providerId),
  ]
);

export const providerInventoryRelations = relations(
  providerInventory,
  ({ one, many }) => ({
    provider: one(providers, {
      fields: [providerInventory.providerId],
      references: [providers.id],
    }),
    items: many(providerInventoryItems),
  })
);

export const providerInventoryItems = sqliteTable(
  "provider_inventory_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text("provider_id").notNull(),
    inventoryId: text("inventory_id"),
    hcpcCode: text("hcpc_code"),
    description: text("description"),
    manufacturerItemNumber: text("manufacturer_item_number"),
    manufacturerName: text("manufacturer_name"),
    unitOfMeasurement: text("unit_of_measurement"),
    isCustomFit: integer("is_custom_fit").default(0),
    listPrice: real("list_price"),
    discountPrice: real("discount_price"),
    supplier: text("supplier"),
    supplierItemNumber: text("supplier_item_number"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("provider_inventory_items_provider_id_idx").on(table.providerId),
    index("provider_inventory_items_provider_mfr_idx").on(
      table.providerId,
      table.manufacturerItemNumber
    ),
  ]
);

export const providerInventoryItemsRelations = relations(
  providerInventoryItems,
  ({ one }) => ({
    provider: one(providers, {
      fields: [providerInventoryItems.providerId],
      references: [providers.id],
    }),
  })
);
