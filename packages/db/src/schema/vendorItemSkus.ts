import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

/**
 * vendor_item_skus — Phase C: per-vendor catalog mapping HCPC codes to
 * vendor-specific SKUs with pack/case math.
 *
 * Hospitals order by HCPC; vendors fulfil by SKU. The routing engine
 * consults this table to (a) hard-filter to vendors who actually carry
 * a SKU for the requested HCPC, and (b) compute the pack quantity to
 * order (e.g. 50 units / 10 units_per_pack = 5 boxes).
 */
export const vendorItemSkus = sqliteTable(
  "vendor_item_skus",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    hcpcCode: text("hcpc_code").notNull(),
    vendorSku: text("vendor_sku").notNull(),
    description: text("description"),
    manufacturerName: text("manufacturer_name"),
    manufacturerItemNumber: text("manufacturer_item_number"),
    unitsPerPack: integer("units_per_pack").notNull().default(1),
    packsPerCase: integer("packs_per_case").notNull().default(1),
    unitOfMeasurement: text("unit_of_measurement"), // 'EA' | 'BOX' | 'CASE'
    listPriceCents: integer("list_price_cents"),
    currencyCode: text("currency_code").notNull().default("USD"),

    // Variant grouping
    groupId: text("group_id"), // FK to sku_groups
    variantAttributes: text("variant_attributes"), // JSON: {size: 'L', color: 'black'}

    // Procurement constraints
    minimumOrderQuantity: integer("minimum_order_quantity").notNull().default(1),
    maximumOrderQuantity: integer("maximum_order_quantity"),
    packMultiple: integer("pack_multiple").notNull().default(1),

    // Marketing copy
    tagline: text("tagline"),
    longDescription: text("long_description"),

    // Media
    imageUrl: text("image_url"),
    datasheetUrl: text("datasheet_url"),
    ifuUrl: text("ifu_url"),
    msdsUrl: text("msds_url"),
    videoUrl: text("video_url"),

    // Tax + shipping
    taxCode: text("tax_code"), // NACS / Avalara product tax classification
    hsCode: text("hs_code"), // Harmonized System code for int'l shipping
    weightGrams: integer("weight_grams"),
    dimensionsCm: text("dimensions_cm"), // JSON: {l, w, h}
    hazmat: integer("hazmat").default(0),

    isActive: integer("is_active").notNull().default(1),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("vendor_item_skus_vendor_sku_uniq").on(
      table.vendorId,
      table.vendorSku,
    ),
    index("vendor_item_skus_hcpc_idx").on(table.hcpcCode),
    index("vendor_item_skus_vendor_idx").on(table.vendorId),
    index("vendor_item_skus_active_idx").on(table.isActive),
    index("vendor_item_skus_group_idx").on(table.groupId),
  ],
);

export const vendorItemSkusRelations = relations(vendorItemSkus, ({ one }) => ({
  vendor: one(vendors, {
    fields: [vendorItemSkus.vendorId],
    references: [vendors.id],
  }),
}));
