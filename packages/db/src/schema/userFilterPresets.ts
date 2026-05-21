import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const userFilterPresets = sqliteTable(
  "user_filter_presets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    entity: text("entity").notNull(), // 'orders', future: 'invoices', etc.
    name: text("name").notNull(),
    filters: text("filters").notNull(), // JSON-stringified filter object
    isDefault: integer("is_default").default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("user_filter_presets_user_entity_idx").on(table.userId, table.entity),
  ]
);
