import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const icd10Codes = sqliteTable(
  "icd10_codes",
  {
    code: text("code").primaryKey(),
    description: text("description").notNull(),
    category: text("category"),
    chapterDescription: text("chapter_description"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("icd10_codes_category_idx").on(table.category),
    index("icd10_codes_description_idx").on(table.description),
    index("icd10_codes_status_idx").on(table.status),
  ]
);
