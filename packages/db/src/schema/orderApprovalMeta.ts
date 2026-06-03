import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Sidecar table for Gap-2 approver metadata.
 * The orders table is at D1's ALTER TABLE column limit, so new columns
 * for approver_user_id and fhir_encounter_id live here (1:1 with orders).
 * Migration: 0024_orders_approver.sql
 */
export const orderApprovalMeta = sqliteTable(
  "order_approval_meta",
  {
    orderId: text("order_id").primaryKey().notNull(),
    approverUserId: text("approver_user_id"),
    fhirEncounterId: text("fhir_encounter_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_approval_meta_approver_idx").on(table.approverUserId),
  ]
);
