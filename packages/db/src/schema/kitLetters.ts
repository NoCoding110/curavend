import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Versioned kit letter catalog synced from an external CMS.
 * Mirror of Medzah's `Kits` table backing the AtHome welcome-letter flow.
 */
export const kitLetters = sqliteTable(
  "kit_letters",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentKitId: text("parent_kit_id"),
    letterId: text("letter_id").notNull(),
    version: integer("version").notNull().default(1),
    name: text("name"),
    pdfBlobKey: text("pdf_blob_key"),
    sourceUpdatedAt: text("source_updated_at"),
    dynamicData: text("dynamic_data"), // JSON blob from source CMS
    enabled: integer("enabled").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("kit_letters_parent_letter_version_uq").on(
      table.parentKitId,
      table.letterId,
      table.version,
    ),
    index("kit_letters_letter_id_idx").on(table.letterId),
  ],
);
