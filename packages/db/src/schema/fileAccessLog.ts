import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * HIPAA §164.312(b) — Audit Controls (file/asset layer).
 *
 * Records every R2 file download so audits can answer:
 *   "show me everyone who accessed patient X's documents in the last 90 days"
 *
 * Complements `phi_access_log` (which records record-level reads of orders /
 * invoices) by capturing the binary file layer that can't be reconstructed
 * from row-level audit alone.
 *
 * Denormalized columns (hospital_id, vendor_id, order_id, etc.) make
 * tenant-scoped audit queries fast without joining through R2 metadata.
 */
export const fileAccessLog = sqliteTable(
  "file_access_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    userEmail: text("user_email"),
    userType: text("user_type"), // 'ADMIN' | 'HOSPITAL' | 'VENDOR' | 'PROVIDER' | 'SUPER_VENDOR'

    fileKey: text("file_key").notNull(),
    fileKind: text("file_kind"),
    // 'CONTRACT' | 'ORDER_ATTACHMENT' | 'INVENTORY_MANIFEST' | 'DELIVERY_PROOF'
    // | 'INVOICE_PDF' | 'ORDER_PACKET' | 'OTHER'

    // Denormalized tenant + entity refs for fast scoped queries
    hospitalId: text("hospital_id"),
    vendorId: text("vendor_id"),
    orderId: text("order_id"),
    contractId: text("contract_id"),
    invoiceId: text("invoice_id"),

    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    bytesServed: integer("bytes_served"),
    httpStatus: integer("http_status"),

    accessedAt: text("accessed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("file_access_log_user_idx").on(table.userId),
    index("file_access_log_order_idx").on(table.orderId),
    index("file_access_log_accessed_idx").on(table.accessedAt),
    index("file_access_log_hospital_idx").on(table.hospitalId),
    index("file_access_log_vendor_idx").on(table.vendorId),
  ],
);

export type FileAccessLog = typeof fileAccessLog.$inferSelect;
export type NewFileAccessLog = typeof fileAccessLog.$inferInsert;
