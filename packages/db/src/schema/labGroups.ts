import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const LAB_GROUP_TYPES = ["SINGLE_SITE", "D2P"] as const;
export type LabGroupType = (typeof LAB_GROUP_TYPES)[number];

export const labGroups = sqliteTable(
  "lab_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    groupType: text("group_type").notNull(),
    vendorId: text("vendor_id"),
    description: text("description"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("lab_groups_vendor_id_idx").on(table.vendorId),
    index("lab_groups_group_type_idx").on(table.groupType),
  ]
);
