import { sqliteTable, text, real, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Data-driven US sales tax rates. Replaces the hardcoded STATE_TAX_RATES map
// in InternalTaxEngine so rates can be updated without a deploy.
//
// Schema designed for forward-compatibility:
//   - jurisdictionType allows for COUNTRY, STATE, COUNTY, CITY, ZIP
//   - effective_from / effective_to support time-bounded rate changes
//   - source tracks provenance (INTERNAL_SEED | MANUAL | AVALARA_IMPORT | ...)
//
// One active rate per (jurisdiction_type, jurisdiction_code) — enforced by
// partial unique index.
export const salesTaxRates = sqliteTable(
  "sales_tax_rates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    jurisdictionType: text("jurisdiction_type").notNull(), // COUNTRY | STATE | COUNTY | CITY | ZIP
    jurisdictionCode: text("jurisdiction_code").notNull(), // e.g., 'US-MA', 'US-CA-Los_Angeles'
    rate: real("rate").notNull(),
    effectiveFrom: text("effective_from")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    effectiveTo: text("effective_to"),
    source: text("source"),
    notes: text("notes"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("sales_tax_rates_active_idx").on(table.isActive),
    // Partial unique index defined in migration — Drizzle's index() can't
    // express WHERE clauses, so the constraint is migration-only.
  ]
);

export const SALES_TAX_JURISDICTION_TYPES = [
  "COUNTRY",
  "STATE",
  "COUNTY",
  "CITY",
  "ZIP",
] as const;
export type SalesTaxJurisdictionType = (typeof SALES_TAX_JURISDICTION_TYPES)[number];
