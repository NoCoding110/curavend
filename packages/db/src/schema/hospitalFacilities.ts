import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { hospitals } from "./hospitals";

export const hospitalFacilities = sqliteTable(
  "hospital_facilities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text("hospital_id").notNull(),
    name: text("name").notNull(),
    number: text("number"),
    streetAddress: text("street_address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    phone: text("phone"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("hospital_facilities_hospital_id_idx").on(table.hospitalId),
  ]
);

export const hospitalFacilitiesRelations = relations(hospitalFacilities, ({ one }) => ({
  hospital: one(hospitals, {
    fields: [hospitalFacilities.hospitalId],
    references: [hospitals.id],
  }),
}));
