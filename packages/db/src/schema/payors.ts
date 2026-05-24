import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Payors — insurance carriers / Medicare / Medicaid / self-pay categories.
 * Orders carry an optional `payor_id` reference so claims can flow downstream
 * and so the pricing cascade can apply payor-specific allowable rates.
 *
 * `payor_kind` controls how the order is processed:
 *   - COMMERCIAL: contract-based, prior auth often required
 *   - MEDICARE: federal, uses Medicare allowable as ceiling
 *   - MEDICAID: state, varies
 *   - WORKERS_COMP: state workers' comp
 *   - SELF_PAY: patient pays directly, no payor
 *   - OTHER: anything else (charity, VA, military)
 */
export const PAYOR_KINDS = [
  "COMMERCIAL",
  "MEDICARE",
  "MEDICAID",
  "WORKERS_COMP",
  "SELF_PAY",
  "OTHER",
] as const;
export type PayorKind = (typeof PAYOR_KINDS)[number];

export const payors = sqliteTable(
  "payors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // PayorKind
    payorCode: text("payor_code"), // CMS payor ID, NAIC code, etc.
    eligibilityEndpoint: text("eligibility_endpoint"), // future 270/271 EDI URL
    phone: text("phone"),
    website: text("website"),
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
    index("payors_kind_idx").on(table.kind),
    index("payors_name_idx").on(table.name),
  ]
);
