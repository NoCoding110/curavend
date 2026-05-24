import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { hospitals } from "./hospitals";
import { hospitalFacilities } from "./hospitalFacilities";

export const hospitalDepartments = sqliteTable(
  "hospital_departments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text("hospital_id").notNull(),
    facilityId: text("facility_id"),
    name: text("name").notNull(),
    number: text("number"),
    // Procurement metadata — surfaced in requisition intake + budget scoping.
    costCenter: text("cost_center"),
    glCode: text("gl_code"),
    serviceLine: text("service_line"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("hospital_departments_hospital_id_idx").on(table.hospitalId),
    index("hospital_departments_facility_id_idx").on(table.facilityId),
  ]
);

export const hospitalDepartmentsRelations = relations(hospitalDepartments, ({ one }) => ({
  hospital: one(hospitals, {
    fields: [hospitalDepartments.hospitalId],
    references: [hospitals.id],
  }),
  facility: one(hospitalFacilities, {
    fields: [hospitalDepartments.facilityId],
    references: [hospitalFacilities.id],
  }),
}));
