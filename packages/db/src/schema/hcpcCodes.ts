import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const hcpcCodes = sqliteTable(
  "hcpc_codes",
  {
    code: text("code").primaryKey(),
    shortDescription: text("short_description").notNull(),
    longDescription: text("long_description"),
    category: text("category"),
    effectiveDate: text("effective_date"),
    terminationDate: text("termination_date"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("hcpc_codes_category_idx").on(table.category),
    index("hcpc_codes_short_desc_idx").on(table.shortDescription),
    index("hcpc_codes_status_idx").on(table.status),
  ]
);
