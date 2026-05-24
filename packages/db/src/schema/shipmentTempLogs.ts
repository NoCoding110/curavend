import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Time-series temperature/humidity readings for cold-chain-sensitive
 * shipments. Sourced from carrier APIs (UPS Track 2.0, FedEx SenseAware),
 * IoT loggers (Sensitech), or manual operator entry.
 *
 * `is_excursion` is flagged at write time when reading is outside the
 * shipment's `cold_chain_spec_min_c` / `_max_c`. Excursions also bubble up
 * to `order_shipments.had_excursion` so the UI can show a quick flag.
 */
export const shipmentTempLogs = sqliteTable(
  'shipment_temp_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    shipmentId: text('shipment_id').notNull(),
    readingAt: text('reading_at').notNull(),
    temperatureC: real('temperature_c').notNull(),
    humidityPct: real('humidity_pct'),
    isExcursion: integer('is_excursion').notNull().default(0),
    specMinC: real('spec_min_c'),
    specMaxC: real('spec_max_c'),
    source: text('source'),
    deviceId: text('device_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('shipment_temp_logs_shipment_idx').on(t.shipmentId),
    index('shipment_temp_logs_excursion_idx').on(t.isExcursion),
    index('shipment_temp_logs_reading_at_idx').on(t.readingAt),
  ],
);
