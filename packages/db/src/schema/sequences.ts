import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const sequences = sqliteTable("sequences", {
  name: text("name").primaryKey(), // e.g., 'vendor_user_id', 'hospital_user_id', 'invoice_number', 'purchase_order_number', 'support_ticket_number'
  currentValue: integer("current_value").notNull().default(0),
});
