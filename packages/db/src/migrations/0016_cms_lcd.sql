-- 0016_cms_lcd.sql
-- CMS Required Prior Authorization HCPC list + LCD/NCD coverage criteria
-- ingestor tables + cached check results.

CREATE TABLE `cms_pa_required_hcpcs` (
  `hcpc_code` text PRIMARY KEY NOT NULL,
  `description` text,
  `effective_date` text,
  `source_url` text,
  `notes` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `added_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `lcd_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `contractor` text,
  `jurisdiction` text,
  `effective_date` text,
  `revision_date` text,
  `source_url` text,
  `summary` text,
  `is_active` integer NOT NULL DEFAULT 1,
  `fetched_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lcd_documents_kind_idx` ON `lcd_documents` (`kind`);
CREATE INDEX `lcd_documents_active_idx` ON `lcd_documents` (`is_active`);

CREATE TABLE `lcd_coverage_criteria` (
  `id` text PRIMARY KEY NOT NULL,
  `lcd_document_id` text NOT NULL,
  `hcpc_code` text NOT NULL,
  `criterion_type` text NOT NULL,
  `icd10_codes` text,
  `required_finding` text,
  `description` text NOT NULL,
  `citation` text,
  `is_mandatory` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `lcd_criteria_hcpc_idx` ON `lcd_coverage_criteria` (`hcpc_code`);
CREATE INDEX `lcd_criteria_lcd_idx` ON `lcd_coverage_criteria` (`lcd_document_id`);
CREATE INDEX `lcd_criteria_type_idx` ON `lcd_coverage_criteria` (`criterion_type`);

CREATE TABLE `lcd_check_results` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text,
  `hcpc_code` text NOT NULL,
  `icd10_list` text,
  `decision` text NOT NULL,
  `citations` text,
  `explanation` text,
  `checked_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `checked_by_user_id` text
);
CREATE INDEX `lcd_check_results_order_idx` ON `lcd_check_results` (`order_id`);
CREATE INDEX `lcd_check_results_hcpc_idx` ON `lcd_check_results` (`hcpc_code`);
CREATE INDEX `lcd_check_results_decision_idx` ON `lcd_check_results` (`decision`);

-- ── Seed CMS Required PA HCPC list (subset of the official ~100-item list) ──
-- Source: https://www.cms.gov/research-statistics-data-and-systems/
--         monitoring-programs/medicare-ffs-compliance-programs/prior-authorization-initiatives/dmepos
INSERT INTO `cms_pa_required_hcpcs` (`hcpc_code`, `description`, `effective_date`, `source_url`, `notes`) VALUES
  ('K0856', 'Power wheelchair, Group 3, std, single power option, sling/solid seat', '2017-09-01', 'https://www.cms.gov', 'PMD master list'),
  ('K0857', 'Power wheelchair, Group 3, std, single power option, captain''s chair', '2017-09-01', NULL, NULL),
  ('K0858', 'Power wheelchair, Group 3, std, multiple power option, sling', '2017-09-01', NULL, NULL),
  ('K0859', 'Power wheelchair, Group 3, std, multiple power option, captain''s chair', '2017-09-01', NULL, NULL),
  ('K0860', 'Power wheelchair, Group 3, std, multiple power option, sling, weight capacity 301-450', '2017-09-01', NULL, NULL),
  ('K0861', 'Power wheelchair, Group 3, std, multiple power option, sling, weight capacity 451-600', '2017-09-01', NULL, NULL),
  ('K0862', 'Power wheelchair, Group 3, HD, single power option, sling/solid', '2017-09-01', NULL, NULL),
  ('K0863', 'Power wheelchair, Group 3, HD, multiple power option, sling', '2017-09-01', NULL, NULL),
  ('K0864', 'Power wheelchair, Group 3, very HD, multiple power option', '2017-09-01', NULL, NULL),
  ('K0868', 'Power wheelchair, Group 4, std, single power option, sling', '2017-09-01', NULL, NULL),
  ('K0869', 'Power wheelchair, Group 4, std, single power option, captain''s chair', '2017-09-01', NULL, NULL),
  ('K0870', 'Power wheelchair, Group 4, std, multiple power option, sling', '2017-09-01', NULL, NULL),
  ('K0871', 'Power wheelchair, Group 4, std, multiple power option, captain''s chair', '2017-09-01', NULL, NULL),
  ('K0877', 'Power wheelchair, Group 5, pediatric, single power option, sling', '2017-09-01', NULL, NULL),
  ('K0878', 'Power wheelchair, Group 5, pediatric, multiple power option, sling', '2017-09-01', NULL, NULL),
  ('K0884', 'Power wheelchair, Group 4, HD, single power option, sling', '2017-09-01', NULL, NULL),
  ('K0885', 'Power wheelchair, Group 4, HD, multiple power option, sling', '2017-09-01', NULL, NULL),
  ('E0193', 'Powered air flotation bed (low air loss therapy)', '2020-07-22', NULL, 'Pressure reducing'),
  ('E0277', 'Powered pressure-reducing air mattress', '2020-07-22', NULL, NULL),
  ('E0371', 'Non-powered advanced pressure-reducing overlay', '2020-07-22', NULL, NULL),
  ('E0372', 'Powered air overlay for mattress', '2020-07-22', NULL, NULL),
  ('E0373', 'Non-powered advanced pressure-reducing mattress', '2020-07-22', NULL, NULL),
  ('L0648', 'Lumbar-sacral orthosis, prefabricated, off-the-shelf', '2017-09-01', NULL, 'Cervical/spinal orthoses'),
  ('L0650', 'Lumbar-sacral orthosis, sagittal-coronal control, prefabricated, off-the-shelf', '2017-09-01', NULL, NULL),
  ('L0651', 'Lumbar-sacral orthosis, sagittal-coronal control, prefabricated, off-the-shelf, custom fitted', '2017-09-01', NULL, NULL);

-- ── Seed top 5 LCD documents + key criteria (CPAP / Oxygen / PMD / NPWT) ───
INSERT INTO `lcd_documents` (`id`, `kind`, `title`, `contractor`, `effective_date`, `source_url`, `summary`) VALUES
  ('L33718', 'LCD', 'Positive Airway Pressure (PAP) Devices for the Treatment of Obstructive Sleep Apnea', 'CGS, Noridian, CGS, Noridian', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33718', 'CPAP / BiPAP coverage for OSA'),
  ('L33797', 'LCD', 'Oxygen and Oxygen Equipment', 'CGS, Noridian, CGS, Noridian', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33797', 'Long-term oxygen therapy'),
  ('L33789', 'LCD', 'Power Mobility Devices', 'CGS, Noridian, CGS, Noridian', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33789', 'Power wheelchairs and scooters'),
  ('L33821', 'LCD', 'Hospital Beds and Accessories', 'CGS, Noridian, CGS, Noridian', '2015-10-01', NULL, 'Manual / semi-electric / total electric'),
  ('L33829', 'LCD', 'Negative Pressure Wound Therapy Pumps', 'CGS, Noridian, CGS, Noridian', '2015-10-01', NULL, 'NPWT for chronic wounds');

-- CPAP (E0601) criteria
INSERT INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-cpap-1', 'L33718', 'E0601', 'DIAGNOSIS_REQUIRED', '["G47.33","G47.30"]', NULL, 'Patient must have a diagnosis of obstructive sleep apnea (G47.33) or sleep apnea NOS (G47.30)', 'LCD L33718 §1.A', 1),
  ('crit-cpap-2', 'L33718', 'E0601', 'CLINICAL_FINDING', NULL, 'AHI/RDI >= 15, OR AHI/RDI 5-14 with documented symptoms (excessive daytime sleepiness, hypertension, etc.)', 'Sleep study must demonstrate an AHI or RDI consistent with OSA', 'LCD L33718 §1.B', 1),
  ('crit-cpap-3', 'L33718', 'E0601', 'DOCUMENTATION', NULL, 'Face-to-face encounter within 6 months prior to order', 'Treating practitioner must conduct face-to-face evaluation', 'LCD L33718 §1.C', 1);

-- Oxygen (E1390) criteria
INSERT INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-o2-1', 'L33797', 'E1390', 'CLINICAL_FINDING', NULL, 'SpO2 <= 88% on room air at rest, during sleep, or with exertion', 'Qualifying arterial blood gas or pulse oximetry showing SpO2 <= 88% (or PaO2 <= 55 mmHg)', 'LCD L33797 §1.A', 1),
  ('crit-o2-2', 'L33797', 'E1390', 'DOCUMENTATION', NULL, 'Qualifying test within 30 days prior', 'Oximetry / ABG must be within 30 days of initial order', 'LCD L33797 §1.B', 1),
  ('crit-o2-3', 'L33797', 'E1390', 'DOCUMENTATION', NULL, 'Face-to-face within 6 months', 'Face-to-face encounter required', 'LCD L33797 §1.C', 1);

-- Power mobility (K0823 and PA-required group) criteria
INSERT INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-pmd-1', 'L33789', 'K0823', 'CLINICAL_FINDING', NULL, 'Inability to safely ambulate even with a cane or walker AND inability to use a manual wheelchair safely', 'Mobility evaluation must establish inability to perform mobility-related ADLs without a PMD', 'LCD L33789 §1.A', 1),
  ('crit-pmd-2', 'L33789', 'K0823', 'DOCUMENTATION', NULL, 'Face-to-face within 45 days of order', 'Face-to-face mobility evaluation must occur within 45 days before the order', 'LCD L33789 §1.B', 1),
  ('crit-pmd-3', 'L33789', 'K0823', 'DOCUMENTATION', NULL, 'LMN from prescriber', 'Letter of Medical Necessity required', 'LCD L33789 §1.C', 1),
  ('crit-pmd-4', 'L33789', 'K0823', 'SETTING', NULL, 'Home use only', 'Power mobility devices are covered only for use in the home', 'LCD L33789 §2', 1);

-- Hospital bed (E0260)
INSERT INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-bed-1', 'L33821', 'E0260', 'CLINICAL_FINDING', NULL, 'Patient requires positioning of the body for: relief of pain, drainage, breathing, prevention of aspiration, OR requires head-of-bed elevation > 30 degrees most of the day', 'Documented medical need for positioning', 'LCD L33821 §1.A', 1),
  ('crit-bed-2', 'L33821', 'E0260', 'DOCUMENTATION', NULL, 'Face-to-face within 6 months', 'Face-to-face evaluation required', 'LCD L33821 §1.B', 1);

-- NPWT pump (E2402)
INSERT INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-npwt-1', 'L33829', 'E2402', 'CLINICAL_FINDING', NULL, 'Stage 3 or 4 pressure ulcer, OR diabetic / venous / arterial ulcer, OR chronic wound that has not healed in >= 30 days of conventional therapy', 'Eligible wound type with documented failure of standard care', 'LCD L33829 §1.A', 1),
  ('crit-npwt-2', 'L33829', 'E2402', 'DOCUMENTATION', NULL, 'Wound photo within 30 days', 'Photograph documenting wound bed and dimensions', 'LCD L33829 §1.B', 1),
  ('crit-npwt-3', 'L33829', 'E2402', 'DOCUMENTATION', NULL, 'Progress notes with measurements', 'Wound measurements (length × width × depth) documented', 'LCD L33829 §1.C', 1);
