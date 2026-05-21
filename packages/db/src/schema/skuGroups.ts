import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { vendors } from "./vendors";

// A SKU group represents a parent product with multiple variants (e.g., a knee
// brace sold in S/M/L/XL). Each `vendor_item_skus` row may point to a group
// via `groupId`; the group carries shared marketing copy + documentation.
export const skuGroups = sqliteTable(
  "sku_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text("vendor_id").notNull(),
    groupName: text("group_name").notNull(),

    // Marketing copy
    tagline: text("tagline"),
    longDescription: text("long_description"),
    salientFeatures: text("salient_features"), // JSON array of bullet strings
    brandManufacturer: text("brand_manufacturer"),

    // Media
    coverImageUrl: text("cover_image_url"),
    datasheetUrl: text("datasheet_url"),
    ifuUrl: text("ifu_url"),
    msdsUrl: text("msds_url"),
    brochureUrl: text("brochure_url"),
    videoUrl: text("video_url"),

    // Classification
    categoryPath: text("category_path"), // JSON array — denormalized breadcrumb
    variantAttributes: text("variant_attributes"), // JSON: {axes: [...], values: {...}}

    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("sku_groups_vendor_idx").on(table.vendorId),
    index("sku_groups_active_idx").on(table.isActive),
  ]
);

export const skuGroupsRelations = relations(skuGroups, ({ one }) => ({
  vendor: one(vendors, {
    fields: [skuGroups.vendorId],
    references: [vendors.id],
  }),
}));
