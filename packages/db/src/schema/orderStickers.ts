import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const STICKER_TYPES = ["PATIENT", "SPECIMEN", "KIT", "SHIPPING"] as const;
export type StickerType = (typeof STICKER_TYPES)[number];

export const orderStickers = sqliteTable(
  "order_stickers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text("order_id"),
    labOrderId: text("lab_order_id"),
    stickerType: text("sticker_type").notNull(),
    barcodeValue: text("barcode_value").notNull(),
    barcodeFormat: text("barcode_format").default("code128"),
    printableLines: text("printable_lines"), // JSON array of strings
    metadata: text("metadata"), // JSON
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_stickers_order_id_idx").on(table.orderId),
    index("order_stickers_lab_order_id_idx").on(table.labOrderId),
    index("order_stickers_barcode_idx").on(table.barcodeValue),
  ]
);
