-- 0015_dme_documents.sql
-- DME ordering module: document requirement catalog + per-order documents +
-- DMEPOS supplier compliance + rental periods + sidecar extension tables for
-- order-level and vendor-level DME fields.
--
-- Note: orders + vendors are at SQLite's ALTER-TABLE column ceiling, so all
-- new fields live in sidecar tables (`dme_order_extensions`,
-- `vendor_dmepos_compliance`) keyed 1:1 by parent id.

-- ── Per-order DME extension (1:1 with orders) ──────────────────────────────
CREATE TABLE `dme_order_extensions` (
  `order_id` text PRIMARY KEY NOT NULL,
  `length_of_need_months` integer,
  `care_setting` text,
  `patient_height_in` real,
  `patient_weight_lb` real,
  `mobility_status` text,
  `rental_type` text,
  `estimated_start_date` text,
  `face_to_face_date` text,
  `cms_pa_required` integer NOT NULL DEFAULT 0,
  `clinical_indication` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Per-vendor DMEPOS compliance summary (1:1 with vendors) ────────────────
CREATE TABLE `vendor_dmepos_compliance` (
  `vendor_id` text PRIMARY KEY NOT NULL,
  `nsc_number` text,
  `ptan` text,
  `npi` text,
  `accredited` integer NOT NULL DEFAULT 0,
  `accreditation_body` text,
  `accreditation_expires_at` text,
  `surety_bond_expires_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Document requirement catalog (Feature 1) ───────────────────────────────
CREATE TABLE `dme_document_requirements` (
  `id` text PRIMARY KEY NOT NULL,
  `hcpc_code` text NOT NULL,
  `document_type` text NOT NULL,
  `is_required` integer NOT NULL DEFAULT 1,
  `payor_kind_filter` text,
  `expires_days` integer,
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `dme_doc_req_uq` ON `dme_document_requirements` (`hcpc_code`, `document_type`, `payor_kind_filter`);
CREATE INDEX `dme_doc_req_hcpc_idx` ON `dme_document_requirements` (`hcpc_code`);

-- ── Per-order document instances ───────────────────────────────────────────
CREATE TABLE `dme_order_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `requirement_id` text,
  `document_type` text NOT NULL,
  `status` text NOT NULL DEFAULT 'MISSING',
  `blob_key` text,
  `file_name` text,
  `mime_type` text,
  `signed_at` text,
  `signed_by_name` text,
  `expires_at` text,
  `notes` text,
  `uploaded_by_user_id` text,
  `uploaded_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `dme_order_doc_order_idx` ON `dme_order_documents` (`order_id`);
CREATE INDEX `dme_order_doc_status_idx` ON `dme_order_documents` (`status`);
CREATE INDEX `dme_order_doc_type_idx` ON `dme_order_documents` (`document_type`);

-- ── Vendor compliance docs (Feature 8) ─────────────────────────────────────
CREATE TABLE `vendor_compliance_docs` (
  `id` text PRIMARY KEY NOT NULL,
  `vendor_id` text NOT NULL,
  `cert_type` text NOT NULL,
  `cert_number` text,
  `issuing_authority` text,
  `issue_date` text,
  `expiration_date` text,
  `blob_key` text,
  `file_name` text,
  `notes` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `vendor_compliance_vendor_idx` ON `vendor_compliance_docs` (`vendor_id`);
CREATE INDEX `vendor_compliance_expiration_idx` ON `vendor_compliance_docs` (`expiration_date`);

-- ── DME rental periods (Feature 7) ─────────────────────────────────────────
CREATE TABLE `dme_rental_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `period_number` integer NOT NULL,
  `period_start` text NOT NULL,
  `period_end` text NOT NULL,
  `monthly_rate_usd` real,
  `invoice_id` text,
  `status` text NOT NULL DEFAULT 'SCHEDULED',
  `notes` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `dme_rental_order_idx` ON `dme_rental_periods` (`order_id`);
CREATE INDEX `dme_rental_status_idx` ON `dme_rental_periods` (`status`);
CREATE INDEX `dme_rental_period_end_idx` ON `dme_rental_periods` (`period_end`);

-- ── Seed common DME document requirements ──────────────────────────────────
INSERT INTO `dme_document_requirements` (`id`, `hcpc_code`, `document_type`, `is_required`, `payor_kind_filter`, `expires_days`, `notes`) VALUES
  ('seed-cpap-dwo',         'E0601', 'DWO',          1, NULL,        NULL, 'Detailed Written Order from prescriber'),
  ('seed-cpap-f2f',         'E0601', 'FACE_TO_FACE', 1, NULL,        180,  'Face-to-face encounter within 6 months prior'),
  ('seed-cpap-sleep',       'E0601', 'SLEEP_STUDY',  1, NULL,        NULL, 'Qualifying sleep study (AHI/RDI >= 5 with symptoms, or >= 15)'),
  ('seed-cpap-progress',    'E0601', 'PROGRESS_NOTES', 1, NULL,      NULL, 'Clinical notes documenting OSA diagnosis'),
  ('seed-o2-dwo',           'E1390', 'DWO',          1, NULL,        NULL, 'DWO with O2 flow rate and hours/day'),
  ('seed-o2-cmn-mcr',       'E1390', 'CMN',          1, 'MEDICARE',  NULL, 'Medicare CMN 484.03 required'),
  ('seed-o2-oximetry',      'E1390', 'OXIMETRY',     1, NULL,        30,   'Qualifying SpO2 <= 88% on RA at rest, sleep, or exertion'),
  ('seed-o2-f2f',           'E1390', 'FACE_TO_FACE', 1, NULL,        180,  'Face-to-face within 6 months'),
  ('seed-walker-dwo',       'E0143', 'DWO',          1, NULL,        NULL, 'DWO from prescriber'),
  ('seed-walker-f2f',       'E0143', 'FACE_TO_FACE', 1, NULL,        180,  'Face-to-face notes documenting mobility limitation'),
  ('seed-bed-dwo',          'E0260', 'DWO',          1, NULL,        NULL, 'DWO with specific bed type'),
  ('seed-bed-f2f',          'E0260', 'FACE_TO_FACE', 1, NULL,        180,  'Face-to-face documenting medical necessity'),
  ('seed-bed-progress',     'E0260', 'PROGRESS_NOTES', 1, NULL,      NULL, 'Notes establishing condition requiring positioning'),
  ('seed-wc-dwo',           'K0001', 'DWO',          1, NULL,        NULL, NULL),
  ('seed-wc-f2f',           'K0001', 'FACE_TO_FACE', 1, NULL,        180,  'Mobility evaluation by clinician'),
  ('seed-pwc-dwo',          'K0823', 'DWO',          1, NULL,        NULL, NULL),
  ('seed-pwc-f2f',          'K0823', 'FACE_TO_FACE', 1, NULL,        45,   'Face-to-face within 45 days for PMD'),
  ('seed-pwc-lmn',          'K0823', 'LMN',          1, NULL,        NULL, 'Letter of medical necessity from clinician'),
  ('seed-pwc-progress',     'K0823', 'PROGRESS_NOTES', 1, NULL,      NULL, 'Mobility evaluation documenting inability to safely ambulate'),
  ('seed-lift-dwo',         'E0630', 'DWO',          1, NULL,        NULL, NULL),
  ('seed-lift-f2f',         'E0630', 'FACE_TO_FACE', 1, NULL,        180,  NULL),
  ('seed-npwt-dwo',         'E2402', 'DWO',          1, NULL,        NULL, NULL),
  ('seed-npwt-photo',       'E2402', 'PHOTO',        1, NULL,        30,   'Wound photo within 30 days'),
  ('seed-npwt-progress',    'E2402', 'PROGRESS_NOTES', 1, NULL,      NULL, 'Wound measurements, exudate, drainage details');
