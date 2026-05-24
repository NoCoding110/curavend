import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * Per-order DME extension. 1:1 with orders. Sidecar table (orders is at
 * SQLite's ALTER-TABLE column ceiling, so DME-specific fields live here).
 */
export const dmeOrderExtensions = sqliteTable(
  'dme_order_extensions',
  {
    orderId: text('order_id').primaryKey(),
    lengthOfNeedMonths: integer('length_of_need_months'),
    careSetting: text('care_setting'),               // HOME / SNF / HOSPICE / OTHER
    patientHeightIn: real('patient_height_in'),
    patientWeightLb: real('patient_weight_lb'),
    mobilityStatus: text('mobility_status'),         // AMBULATORY / WHEELCHAIR / BEDBOUND / OTHER
    rentalType: text('rental_type'),                 // see RENTAL_TYPES
    estimatedStartDate: text('estimated_start_date'),
    faceToFaceDate: text('face_to_face_date'),
    cmsPaRequired: integer('cms_pa_required').notNull().default(0),
    clinicalIndication: text('clinical_indication'),
    // Structured clinical findings used for LCD threshold evaluation.
    // JSON: { "SpO2": 87, "AHI": 22, "wound_area_cm2": 14.5, "HbA1c": 8.1 }
    clinicalFindingsJson: text('clinical_findings_json'),
    // DWO e-signature
    dwoSignatureBlobKey: text('dwo_signature_blob_key'),
    dwoSignedAt: text('dwo_signed_at'),
    dwoSignedByName: text('dwo_signed_by_name'),
    dwoSignedByNpi: text('dwo_signed_by_npi'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

/**
 * Per-vendor DMEPOS compliance summary. 1:1 with vendors. Sidecar table.
 * Long-term docs (PDFs, certificates) live in `vendor_compliance_docs`.
 */
export const vendorDmeposCompliance = sqliteTable(
  'vendor_dmepos_compliance',
  {
    vendorId: text('vendor_id').primaryKey(),
    nscNumber: text('nsc_number'),
    ptan: text('ptan'),
    npi: text('npi'),
    accredited: integer('accredited').notNull().default(0),
    accreditationBody: text('accreditation_body'),
    accreditationExpiresAt: text('accreditation_expires_at'),
    suretyBondExpiresAt: text('surety_bond_expires_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

/**
 * DME Document Catalog.
 *
 * A document TYPE is a category of clinical paperwork that may be required
 * for one or more HCPC items. Examples:
 *   - DWO (Detailed Written Order)
 *   - SWO (Standard Written Order)
 *   - CMN (Certificate of Medical Necessity)
 *   - Face-to-face encounter notes
 *   - Sleep study results
 *   - Oximetry / qualifying test results
 *   - Letter of Medical Necessity (LMN)
 *   - Progress notes
 *   - Photographs (wound care)
 *
 * These types are tenant-agnostic; required-document RULES are per-HCPC
 * (see `dme_document_requirements`).
 */
export const DME_DOCUMENT_TYPES = [
  'DWO',          // Detailed Written Order
  'SWO',          // Standard Written Order
  'CMN',          // Certificate of Medical Necessity
  'FACE_TO_FACE', // Face-to-face encounter notes
  'SLEEP_STUDY',  // Sleep study report (CPAP)
  'OXIMETRY',     // Oximetry / qualifying test (oxygen)
  'LMN',          // Letter of Medical Necessity
  'PROGRESS_NOTES',
  'PHOTO',        // Photographs (wound care)
  'AOB',          // Assignment of Benefits
  'DELIVERY_TICKET',
  'PROOF_OF_DELIVERY',
  'OTHER',
] as const;
export type DmeDocumentType = (typeof DME_DOCUMENT_TYPES)[number];

/**
 * Per-HCPC document-requirement RULES. One row per (hcpcCode × documentType).
 *
 * `payorKindFilter` lets a rule apply only to a specific payor kind
 * (e.g. CMN required only for MEDICARE). NULL = applies to all payors.
 *
 * `expiresDays` says how long the doc stays valid after signature (e.g.
 * face-to-face encounter must be within 6 months of the order = 180 days).
 * NULL = no expiry.
 */
export const dmeDocumentRequirements = sqliteTable(
  'dme_document_requirements',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    hcpcCode: text('hcpc_code').notNull(),
    documentType: text('document_type').notNull(),
    isRequired: integer('is_required').notNull().default(1),
    payorKindFilter: text('payor_kind_filter'), // null = any payor
    expiresDays: integer('expires_days'),       // null = no expiry
    notes: text('notes'),                       // why it's required, what to include
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex('dme_doc_req_uq').on(t.hcpcCode, t.documentType, t.payorKindFilter),
    index('dme_doc_req_hcpc_idx').on(t.hcpcCode),
  ],
);

/**
 * Per-order document instances. When an order is created, the system
 * materializes one row per applicable requirement with status MISSING.
 * Users upload files which mark them RECEIVED with a blob key.
 */
export const DME_DOC_STATUSES = ['MISSING', 'RECEIVED', 'EXPIRED', 'REJECTED', 'NOT_APPLICABLE'] as const;
export type DmeDocStatus = (typeof DME_DOC_STATUSES)[number];

export const dmeOrderDocuments = sqliteTable(
  'dme_order_documents',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull(),
    requirementId: text('requirement_id'), // FK to dme_document_requirements; null if added ad-hoc
    documentType: text('document_type').notNull(),
    status: text('status').notNull().default('MISSING'),
    blobKey: text('blob_key'),              // R2 key after upload
    fileName: text('file_name'),
    mimeType: text('mime_type'),
    signedAt: text('signed_at'),
    signedByName: text('signed_by_name'),
    expiresAt: text('expires_at'),
    notes: text('notes'),
    uploadedByUserId: text('uploaded_by_user_id'),
    uploadedAt: text('uploaded_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('dme_order_doc_order_idx').on(t.orderId),
    index('dme_order_doc_status_idx').on(t.status),
    index('dme_order_doc_type_idx').on(t.documentType),
  ],
);

/**
 * DMEPOS supplier compliance records — per-vendor accreditation,
 * surety bond, supplier numbers, certifications. Medicare requires
 * DMEPOS suppliers to be accredited and bonded.
 */
export const DMEPOS_CERT_TYPES = [
  'CMS_ACCREDITATION',
  'SURETY_BOND',
  'NSC',          // National Supplier Clearinghouse number
  'PTAN',         // Provider Transaction Access Number
  'NPI',
  'STATE_LICENSE',
  'JOINT_COMMISSION',
  'ACHC',         // Accreditation Commission for Health Care
  'BOC',          // Board of Certification/Accreditation
  'CHAP',
  'BBB',
  'OTHER',
] as const;
export type DmeposCertType = (typeof DMEPOS_CERT_TYPES)[number];

export const vendorComplianceDocs = sqliteTable(
  'vendor_compliance_docs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorId: text('vendor_id').notNull(),
    certType: text('cert_type').notNull(),
    certNumber: text('cert_number'),
    issuingAuthority: text('issuing_authority'),
    issueDate: text('issue_date'),
    expirationDate: text('expiration_date'),
    blobKey: text('blob_key'),
    fileName: text('file_name'),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('vendor_compliance_vendor_idx').on(t.vendorId),
    index('vendor_compliance_expiration_idx').on(t.expirationDate),
  ],
);

/**
 * DME rental periods — for orders with rentalType set (CAPPED, OXYGEN, PURCHASE,
 * INEXPENSIVE_ROUTINELY_PURCHASED). Tracks monthly billing windows and counts
 * toward the cap (Medicare caps capped-rental DME at 13 months).
 */
export const RENTAL_TYPES = [
  'PURCHASE',
  'CAPPED_RENTAL',          // 13-month cap then transfers to patient
  'INEXPENSIVE_ROUTINELY',  // IRP — sold outright
  'OXYGEN_RENTAL',          // 36-month cap with new cap if equipment changes
  'PARENTERAL_ENTERAL',
  'NOT_APPLICABLE',
] as const;
export type RentalType = (typeof RENTAL_TYPES)[number];

export const dmeRentalPeriods = sqliteTable(
  'dme_rental_periods',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id').notNull(),
    periodNumber: integer('period_number').notNull(),    // 1, 2, …
    periodStart: text('period_start').notNull(),
    periodEnd: text('period_end').notNull(),
    monthlyRateUsd: real('monthly_rate_usd'),
    invoiceId: text('invoice_id'),                       // linked invoice for this period (if billed)
    status: text('status').notNull().default('SCHEDULED'), // SCHEDULED / BILLED / SKIPPED / TERMINATED
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('dme_rental_order_idx').on(t.orderId),
    index('dme_rental_status_idx').on(t.status),
    index('dme_rental_period_end_idx').on(t.periodEnd),
  ],
);
