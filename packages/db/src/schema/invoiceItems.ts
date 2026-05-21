import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { invoices } from "./invoices";

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invoiceId: text("invoice_id").notNull(),
    code: text("code"),
    quantity: integer("quantity"),
    quantityRequested: integer("quantity_requested"),
    description: text("description"),
    unitPrice: real("unit_price"), // legacy
    spend: real("spend"), // legacy

    // ── New cents-based monetary fields ──────────────────────────
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    lineSubtotalCents: integer("line_subtotal_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    taxRate: real("tax_rate"), // decimal 0.0625 = 6.25%
    taxAmountCents: integer("tax_amount_cents").notNull().default(0),
    taxCode: text("tax_code"),
    taxJurisdictionCode: text("tax_jurisdiction_code"),
    taxExempt: integer("tax_exempt").default(0),
    taxExemptReason: text("tax_exempt_reason"),
    lineTotalCents: integer("line_total_cents").notNull().default(0),

    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("invoice_items_invoice_id_idx").on(table.invoiceId)]
);

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));
