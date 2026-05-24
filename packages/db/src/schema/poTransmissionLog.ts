import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Append-only log of every PO transmission attempt to a vendor.
 *
 * One row per attempt. The current state on `purchase_orders.transmissionState`
 * reflects the most recent attempt's outcome. Stored payload + response are
 * truncated to 500 chars so we don't blow up D1 rows for noisy EDI traffic.
 */
export const PO_TRANSMISSION_LOG_STATES = ['SENDING', 'SENT', 'ACKED', 'FAILED'] as const;
export type PoTransmissionLogState = (typeof PO_TRANSMISSION_LOG_STATES)[number];

export const poTransmissionLog = sqliteTable(
  'po_transmission_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseOrderId: text('purchase_order_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    method: text('method').notNull(),
    state: text('state').notNull(),
    endpoint: text('endpoint'),
    requestPayloadSample: text('request_payload_sample'),
    responseStatus: text('response_status'),
    responseBodySample: text('response_body_sample'),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (t) => [
    index('po_transmission_log_po_idx').on(t.purchaseOrderId),
    index('po_transmission_log_state_idx').on(t.state),
  ],
);
