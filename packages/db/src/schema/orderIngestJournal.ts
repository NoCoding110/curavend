import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const INGEST_JOURNAL_EVENTS = [
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "REPLAYED",
] as const;
export type IngestJournalEvent = (typeof INGEST_JOURNAL_EVENTS)[number];

/**
 * Audit / replay journal for every order payload ingested via the labs ingest
 * endpoint. The raw payload is stored in R2 (`payloadBlobKey`); this row is the
 * index. Idempotency-Key column is UNIQUE so duplicate ingests collapse.
 */
export const orderIngestJournal = sqliteTable(
  "order_ingest_journal",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderRef: text("order_ref").notNull(),
    labOrderId: text("lab_order_id"),
    idempotencyKey: text("idempotency_key"),
    payloadBlobKey: text("payload_blob_key").notNull(),
    event: text("event").notNull(),
    errorMessage: text("error_message"),
    sourceIp: text("source_ip"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_ingest_journal_order_ref_idx").on(table.orderRef),
    uniqueIndex("order_ingest_journal_idempotency_uq").on(table.idempotencyKey),
    index("order_ingest_journal_created_at_idx").on(table.createdAt),
  ],
);
