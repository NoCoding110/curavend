import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Requisition templates — reusable "shopping carts" of items a department
 * or facility orders on a recurring basis. Examples:
 *   - "OR Daily Restock"
 *   - "Wound Care Cart - Standard"
 *   - "ICU Crash Cart Refill"
 *
 * Workflow: a user picks a template, optionally tweaks quantities, and the
 * system spawns a fresh DRAFT requisition with the template's lines.
 */
export const requisitionTemplates = sqliteTable(
  'requisition_templates',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text('hospital_id').notNull(),
    facilityId: text('facility_id'),
    departmentId: text('department_id'),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    defaultPriority: text('default_priority').notNull().default('NORMAL'),
    isActive: integer('is_active').notNull().default(1),
    timesUsed: integer('times_used').notNull().default(0),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('requisition_templates_hospital_idx').on(t.hospitalId),
    index('requisition_templates_facility_idx').on(t.facilityId),
  ],
);

export const requisitionTemplateItems = sqliteTable(
  'requisition_template_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    templateId: text('template_id').notNull(),
    hcpcCode: text('hcpc_code').notNull(),
    description: text('description').notNull(),
    defaultQuantity: integer('default_quantity').notNull().default(1),
    preferredVendorId: text('preferred_vendor_id'),
    formularyItemId: text('formulary_item_id'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index('requisition_template_items_tpl_idx').on(t.templateId)],
);
