import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * EHR connections — generic adapter pattern for multi-vendor EHR ingest.
 *
 * Extends the existing Epic-only support to Cerner, Meditech, Athena, and
 * generic FHIR R4 endpoints. Closes the Redox/Particle Health gap from the
 * competitive analysis without taking on a $10k/mo middleware bill.
 *
 * `auth_mode` controls how we authenticate:
 *   - OAUTH2_CLIENT_CREDENTIALS: stored client_id + client_secret
 *   - OAUTH2_USER_DELEGATED: per-user access tokens (Epic-style)
 *   - SHARED_SECRET: a single HMAC token (Athena-style)
 *   - API_KEY: bearer key in header
 *   - MTLS: client certificate auth (placeholder — not implemented)
 *
 * `mapping_profile` stores a JSON mapping that translates the vendor's
 * FHIR payload into Curavend's internal order shape. Lets us onboard a
 * new EHR without code changes — just config.
 */
export const EHR_VENDORS = [
  "EPIC",
  "CERNER",
  "MEDITECH",
  "ATHENA",
  "ALLSCRIPTS",
  "ECW",
  "GENERIC_FHIR_R4",
] as const;
export type EhrVendor = (typeof EHR_VENDORS)[number];

export const EHR_AUTH_MODES = [
  "OAUTH2_CLIENT_CREDENTIALS",
  "OAUTH2_USER_DELEGATED",
  "SHARED_SECRET",
  "API_KEY",
  "MTLS",
] as const;
export type EhrAuthMode = (typeof EHR_AUTH_MODES)[number];

export const ehrConnections = sqliteTable(
  "ehr_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hospitalId: text("hospital_id").notNull(),
    name: text("name").notNull(),               // human label, e.g. "Mass General — Epic Production"
    vendor: text("vendor").notNull(),            // EhrVendor
    fhirBaseUrl: text("fhir_base_url"),          // e.g. https://fhir.epic.com/.../api/FHIR/R4
    authMode: text("auth_mode").notNull(),       // EhrAuthMode
    // Credential storage — for prod, these should be encrypted via Workers Secrets;
    // for v1 we store ENV var names that resolve via getEnvSecret(). The actual
    // secret value never goes into D1.
    authClientId: text("auth_client_id"),
    authSecretEnvRef: text("auth_secret_env_ref"), // env var name (e.g. "EHR_CONN_acme_secret")
    sharedSecretEnvRef: text("shared_secret_env_ref"),
    apiKeyEnvRef: text("api_key_env_ref"),
    // For HMAC verification on the ingest endpoint.
    webhookSecretEnvRef: text("webhook_secret_env_ref"),
    // FHIR payload → internal-order field mapping, JSON
    mappingProfile: text("mapping_profile"),
    isActive: integer("is_active").notNull().default(1),
    lastSuccessAt: text("last_success_at"),
    lastErrorAt: text("last_error_at"),
    lastErrorMessage: text("last_error_message"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ehr_connections_hospital_idx").on(table.hospitalId),
    index("ehr_connections_vendor_idx").on(table.vendor),
  ]
);

/**
 * Ingest log — every FHIR payload Curavend receives lands here first.
 * Lets ops replay or debug failed mappings.
 */
export const ehrIngestLog = sqliteTable(
  "ehr_ingest_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    connectionId: text("connection_id").notNull(),
    resourceType: text("resource_type"),         // ServiceRequest, MedicationRequest, etc.
    resourceId: text("resource_id"),
    payloadBlobKey: text("payload_blob_key"),    // R2 key with the raw JSON
    mappedOrderId: text("mapped_order_id"),      // if mapping succeeded
    status: text("status").notNull(),            // RECEIVED | PROCESSED | FAILED | SKIPPED
    errorMessage: text("error_message"),
    receivedAt: text("received_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ehr_ingest_log_conn_idx").on(table.connectionId),
    index("ehr_ingest_log_received_idx").on(table.receivedAt),
  ]
);

export const EHR_INGEST_STATUSES = ["RECEIVED", "PROCESSED", "FAILED", "SKIPPED"] as const;
export type EhrIngestStatus = (typeof EHR_INGEST_STATUSES)[number];
