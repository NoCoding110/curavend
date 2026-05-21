import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// OIG LEIE (List of Excluded Individuals/Entities) — refreshed monthly via cron
export const oigExclusionList = sqliteTable(
  "oig_exclusion_list",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Matches NPI, EIN, name variants from public LEIE CSV
    npi: text("npi"),
    ein: text("ein"),
    lastName: text("last_name"),
    firstName: text("first_name"),
    businessName: text("business_name"),
    general: text("general"),           // exclusion category
    specialty: text("specialty"),
    upin: text("upin"),
    dob: text("dob"),                   // date of birth YYYYMMDD
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    excltype: text("excltype"),         // exclusion type code
    excldate: text("excldate"),         // YYYYMMDD
    reindate: text("reindate"),         // reinstatement date if any
    waiverdate: text("waiverdate"),
    waiverstate: text("waiverstate"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("oig_npi_idx").on(table.npi),
    index("oig_ein_idx").on(table.ein),
    index("oig_last_name_idx").on(table.lastName),
    index("oig_business_name_idx").on(table.businessName),
  ]
);
