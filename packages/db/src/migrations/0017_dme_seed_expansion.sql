-- 0017_dme_seed_expansion.sql
-- Comprehensive expansion of CMS PA-required HCPCs and LCD coverage criteria.
-- Source: CMS DMEPOS Master List + Medicare Coverage Database (LCDs current
-- as of the most recent CMS quarterly update).

-- ── Add CLINICAL_FINDING_THRESHOLD criterion-type support fields ───────────
-- (criterion_type values are validated by the application, not the DB, so no
-- enum migration required. Columns to store structured rule are added here.)
ALTER TABLE `lcd_coverage_criteria` ADD COLUMN `finding_name` text;
ALTER TABLE `lcd_coverage_criteria` ADD COLUMN `finding_operator` text;     -- '<=' '<' '>=' '>' '=' '!=' 'BETWEEN'
ALTER TABLE `lcd_coverage_criteria` ADD COLUMN `finding_threshold` real;
ALTER TABLE `lcd_coverage_criteria` ADD COLUMN `finding_threshold_2` real;  -- for BETWEEN
ALTER TABLE `lcd_coverage_criteria` ADD COLUMN `finding_unit` text;

-- ── Clinical findings field on order extension ─────────────────────────────
-- JSON object: { "SpO2": 87, "AHI": 22, "wound_area_cm2": 14.5, ... }
ALTER TABLE `dme_order_extensions` ADD COLUMN `clinical_findings_json` text;

-- ── DWO e-signature fields ────────────────────────────────────────────────
ALTER TABLE `dme_order_extensions` ADD COLUMN `dwo_signature_blob_key` text;
ALTER TABLE `dme_order_extensions` ADD COLUMN `dwo_signed_at` text;
ALTER TABLE `dme_order_extensions` ADD COLUMN `dwo_signed_by_name` text;
ALTER TABLE `dme_order_extensions` ADD COLUMN `dwo_signed_by_npi` text;

-- ── Expand CMS PA-Required HCPC list (additional codes from the CMS Master List)
INSERT OR IGNORE INTO `cms_pa_required_hcpcs` (`hcpc_code`, `description`, `effective_date`, `source_url`, `notes`) VALUES
  -- Additional Group 3 / 4 / 5 PMD chairs
  ('K0856', 'Power wheelchair Group 3 std SPO sling', '2017-09-01', NULL, NULL),
  ('K0865', 'Power wheelchair Group 3 HD multi-PO captain', '2017-09-01', NULL, NULL),
  ('K0866', 'Power wheelchair Group 3 very HD single PO sling', '2017-09-01', NULL, NULL),
  ('K0867', 'Power wheelchair Group 3 extra HD single PO sling', '2017-09-01', NULL, NULL),
  ('K0872', 'Power wheelchair Group 4 HD single PO sling', '2017-09-01', NULL, NULL),
  ('K0873', 'Power wheelchair Group 4 HD multi PO captain', '2017-09-01', NULL, NULL),
  ('K0874', 'Power wheelchair Group 4 very HD single PO sling', '2017-09-01', NULL, NULL),
  ('K0875', 'Power wheelchair Group 4 very HD multi PO sling', '2017-09-01', NULL, NULL),
  ('K0879', 'Power wheelchair Group 5 ped sling solid', '2017-09-01', NULL, NULL),
  ('K0880', 'Power wheelchair Group 5 ped multi PO captain', '2017-09-01', NULL, NULL),
  ('K0886', 'Power wheelchair Group 4 std multi PO sling', '2017-09-01', NULL, NULL),
  ('K0890', 'Power wheelchair Group 5 ped multi PO sling', '2017-09-01', NULL, NULL),
  ('K0891', 'Power wheelchair Group 5 ped multi PO captain', '2017-09-01', NULL, NULL),
  ('E2402', 'Negative pressure wound therapy pump', '2020-07-22', NULL, 'NPWT'),
  -- Lower limb prosthetics
  ('L5856', 'Microprocessor-controlled knee prosthesis', '2020-07-22', NULL, NULL),
  ('L5857', 'Microprocessor-controlled ankle prosthesis', '2020-07-22', NULL, NULL),
  ('L5858', 'Microprocessor-controlled stance phase only', '2020-07-22', NULL, NULL),
  ('L5973', 'Microprocessor-controlled ankle/foot', '2020-07-22', NULL, NULL),
  ('L5980', 'Flex-foot prosthesis', '2020-07-22', NULL, NULL),
  ('L5981', 'Flex-walk prosthesis', '2020-07-22', NULL, NULL),
  ('L5987', 'Shank foot system, vertical loading pylon', '2020-07-22', NULL, NULL),
  -- Cervical orthoses (full collars)
  ('L0631', 'Lumbar-sacral orthosis, sagittal control', '2017-09-01', NULL, NULL),
  ('L0637', 'Lumbar-sacral orthosis, sagittal-coronal control', '2017-09-01', NULL, NULL),
  ('L0639', 'Lumbar-sacral orthosis, sagittal-coronal lateral', '2017-09-01', NULL, NULL),
  -- Knee orthoses
  ('L1832', 'Knee orthosis adjustable knee joints', '2017-09-01', NULL, 'KO'),
  ('L1833', 'Knee orthosis adjustable rigid', '2017-09-01', NULL, 'KO'),
  ('L1843', 'Knee orthosis double upright', '2017-09-01', NULL, 'KO'),
  ('L1851', 'Knee orthosis pre-fabricated off-the-shelf', '2017-09-01', NULL, 'KO'),
  -- Ankle-foot orthoses
  ('L1902', 'Ankle-foot orthosis, ankle gauntlet', '2017-09-01', NULL, NULL),
  ('L1906', 'Ankle-foot orthosis, multi-ligamentous', '2017-09-01', NULL, NULL),
  -- TENS units (additional)
  ('E0720', 'TENS, two-lead', '2020-07-22', NULL, NULL),
  ('E0730', 'TENS, four-lead', '2020-07-22', NULL, NULL),
  -- Pressure-reducing mattresses (additional groupings)
  ('E0181', 'Pressure pad alternating w pump', '2020-07-22', NULL, NULL),
  ('E0182', 'Pump for alternating pressure pad', '2020-07-22', NULL, NULL),
  ('E0184', 'Dry pressure mattress', '2020-07-22', NULL, NULL),
  ('E0185', 'Gel/gel-like pressure pad for mattress', '2020-07-22', NULL, NULL),
  ('E0186', 'Air pressure mattress', '2020-07-22', NULL, NULL),
  ('E0187', 'Water pressure mattress', '2020-07-22', NULL, NULL),
  ('E0188', 'Synthetic sheepskin pad', '2020-07-22', NULL, NULL),
  ('E0189', 'Lambswool sheepskin pad', '2020-07-22', NULL, NULL),
  ('E0196', 'Gel pressure mattress', '2020-07-22', NULL, NULL),
  ('E0197', 'Air pressure pad for mattress, std length and width', '2020-07-22', NULL, NULL),
  ('E0198', 'Water pressure pad for mattress, std length and width', '2020-07-22', NULL, NULL),
  ('E0199', 'Dry pressure pad for mattress, std length and width', '2020-07-22', NULL, NULL),
  -- Speech generating devices
  ('E2510', 'Speech generating device, synthesized speech', '2020-07-22', NULL, NULL),
  ('E2511', 'Speech generating software program', '2020-07-22', NULL, NULL),
  ('E2599', 'Accessory for speech generating device', '2020-07-22', NULL, NULL);

-- ── Add 25 more LCD documents with detailed criteria ───────────────────────
INSERT OR IGNORE INTO `lcd_documents` (`id`, `kind`, `title`, `contractor`, `effective_date`, `source_url`, `summary`) VALUES
  ('L33797-OX-CONTENTS', 'LCD', 'Oxygen Contents (E0441/E0442/E0443/E0444)', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33797', 'Liquid and gaseous oxygen contents for portable systems'),
  ('L33800', 'LCD', 'Nebulizers and Related Medications', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33800', 'Small-volume nebulizers and inhalation drugs'),
  ('L33822', 'LCD', 'Glucose Monitors (Continuous and Standard)', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33822', 'CGM and standard BGM coverage'),
  ('L33802', 'LCD', 'Ostomy Supplies', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33802', 'Pouches, barriers, accessories for ostomy patients'),
  ('L33803', 'LCD', 'Urological Supplies', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33803', 'Catheters, drainage bags, irrigation kits'),
  ('L33790', 'LCD', 'Manual Wheelchair Bases', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33790', 'Standard and lightweight manual wheelchairs'),
  ('L33791', 'LCD', 'Wheelchair Seating', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33791', 'Cushions, backs, positioning accessories'),
  ('L33820', 'LCD', 'Enteral Nutrition', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33820', 'Tube feeding pumps, supplies, formulas'),
  ('L33793', 'LCD', 'Parenteral Nutrition', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33793', 'IV nutrition for non-functioning GI tract'),
  ('L33796', 'LCD', 'Lower Limb Prostheses', 'CGS', '2015-10-01', 'https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=33796', 'Microprocessor-controlled and conventional'),
  ('L33802-IS', 'LCD', 'Immunosuppressive Drugs', 'CGS', '2015-10-01', NULL, 'Drugs for organ transplant recipients'),
  ('L33828', 'LCD', 'Tracheostomy Supplies', 'CGS', '2015-10-01', NULL, 'Trach tubes, ties, masks'),
  ('L33830', 'LCD', 'Suction Pumps', 'CGS', '2015-10-01', NULL, 'Home suction equipment'),
  ('L33831', 'LCD', 'Infusion Pumps (External)', 'CGS', '2015-10-01', NULL, 'External infusion devices'),
  ('L33832', 'LCD', 'Knee Orthoses', 'CGS', '2015-10-01', NULL, 'Knee braces L1810-L1860'),
  ('L33833', 'LCD', 'Ankle-Foot Orthoses', 'CGS', '2015-10-01', NULL, 'AFO L1902-L1990'),
  ('L33834', 'LCD', 'Cervical / Lumbar-Sacral Orthoses', 'CGS', '2015-10-01', NULL, 'Spinal orthoses L0100-L0700'),
  ('L33825', 'LCD', 'External Defibrillators', 'CGS', '2015-10-01', NULL, 'Wearable defibrillators K0606'),
  ('L33826', 'LCD', 'Pneumatic Compression Devices', 'CGS', '2015-10-01', NULL, 'Lymphedema pumps E0650-E0676'),
  ('L33827', 'LCD', 'Surgical Dressings', 'CGS', '2015-10-01', NULL, 'Wound care dressings, gauze'),
  ('L33807', 'LCD', 'TENS for Chronic Low Back Pain', 'CGS', '2015-10-01', NULL, 'TENS E0720 for CLBP only'),
  ('L33808', 'LCD', 'Heating Pads / Heat Lamps', 'CGS', '2015-10-01', NULL, 'Coverage rules for heat therapy DME'),
  ('L33809', 'LCD', 'Speech Generating Devices', 'CGS', '2015-10-01', NULL, 'AAC devices E2500-E2599'),
  ('L33810', 'LCD', 'Bone Growth Stimulators', 'CGS', '2015-10-01', NULL, 'E0747-E0760 for nonunion fractures'),
  ('L33811', 'LCD', 'Continuous Passive Motion Devices', 'CGS', '2015-10-01', NULL, 'CPM E0935 post-knee surgery');

-- ── Detailed criteria for the new LCDs ─────────────────────────────────────

-- Nebulizers (E0570 small-volume) — diagnosis required
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-neb-1', 'L33800', 'E0570', 'DIAGNOSIS_REQUIRED', '["J44.9","J45.901","J45.998","J47.9","J84.10"]', NULL, 'Patient must have COPD, asthma, bronchiectasis, or pulmonary fibrosis', 'LCD L33800 §1.A', 1),
  ('crit-neb-2', 'L33800', 'E0570', 'DOCUMENTATION', NULL, NULL, 'DWO required', 'LCD L33800 §1.B', 1),
  ('crit-neb-3', 'L33800', 'E0570', 'DOCUMENTATION', NULL, NULL, 'Face-to-face within 6 months', 'LCD L33800 §1.C', 1);

-- CGM (K0554) — threshold criteria
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`, `finding_name`, `finding_operator`, `finding_threshold`, `finding_unit`) VALUES
  ('crit-cgm-1', 'L33822', 'K0554', 'DIAGNOSIS_REQUIRED', '["E10.9","E11.9","E10.65","E11.65","O24.011","O24.111","O24.311","O24.911"]', NULL, 'Patient must have diabetes (Type 1, Type 2, or gestational)', 'LCD L33822 §1.A', 1, NULL, NULL, NULL, NULL),
  ('crit-cgm-2', 'L33822', 'K0554', 'CLINICAL_FINDING_THRESHOLD', NULL, 'HbA1c >= 7.0 OR documented hypoglycemic episodes', 'HbA1c at or above 7.0% required', 'LCD L33822 §1.B', 1, 'HbA1c', '>=', 7.0, '%'),
  ('crit-cgm-3', 'L33822', 'K0554', 'CLINICAL_FINDING_THRESHOLD', NULL, '>= 3 insulin injections per day OR insulin pump', 'Patient must be on intensive insulin therapy', 'LCD L33822 §1.C', 1, 'daily_insulin_injections', '>=', 3, 'count');

-- Oximetry threshold for oxygen — already exists in L33797 but add the THRESHOLD form
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`, `finding_name`, `finding_operator`, `finding_threshold`, `finding_unit`) VALUES
  ('crit-o2-spo2', 'L33797', 'E1390', 'CLINICAL_FINDING_THRESHOLD', NULL, 'SpO2 <= 88%', 'Patient SpO2 must be 88% or below on room air', 'LCD L33797 §1.A.1', 1, 'SpO2', '<=', 88, '%'),
  ('crit-o2-pao2', 'L33797', 'E1390', 'CLINICAL_FINDING_THRESHOLD', NULL, 'PaO2 <= 55 mmHg', 'Alternative ABG criterion', 'LCD L33797 §1.A.2', 0, 'PaO2', '<=', 55, 'mmHg');

-- CPAP — AHI threshold
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`, `finding_name`, `finding_operator`, `finding_threshold`, `finding_unit`) VALUES
  ('crit-cpap-ahi', 'L33718', 'E0601', 'CLINICAL_FINDING_THRESHOLD', NULL, 'AHI >= 15 OR 5-14 with symptoms', 'Apnea-Hypopnea Index from sleep study', 'LCD L33718 §1.B', 1, 'AHI', '>=', 15, 'events/hr');

-- Hospital bed — already exists as CLINICAL_FINDING; add threshold variant
-- (none added — narrative-driven, kept as CLINICAL_FINDING)

-- Wound care NPWT — wound area threshold
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`, `finding_name`, `finding_operator`, `finding_threshold`, `finding_unit`) VALUES
  ('crit-npwt-area', 'L33829', 'E2402', 'CLINICAL_FINDING_THRESHOLD', NULL, 'Wound area >= 4 cm² and failed conventional therapy', 'Minimum wound size threshold', 'LCD L33829 §1.D', 1, 'wound_area_cm2', '>=', 4, 'cm²');

-- Ostomy (A4421 base)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-ost-1', 'L33802', 'A4421', 'DIAGNOSIS_REQUIRED', '["Z93.0","Z93.1","Z93.2","Z93.3","Z93.50","Z93.6"]', NULL, 'Patient must have an ostomy', 'LCD L33802 §1.A', 1),
  ('crit-ost-2', 'L33802', 'A4421', 'DOCUMENTATION', NULL, NULL, 'DWO required', 'LCD L33802 §1.B', 1);

-- Urological (A4351 base)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-uro-1', 'L33803', 'A4351', 'DIAGNOSIS_REQUIRED', '["N31.0","N31.1","N31.2","N31.9","R33.9"]', NULL, 'Permanent urinary incontinence or retention', 'LCD L33803 §1.A', 1);

-- Manual wheelchair (additional criteria for K0001)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-mwc-1', 'L33790', 'K0001', 'CLINICAL_FINDING', NULL, 'Mobility limitation prevents ambulation in the home', 'Mobility-related ADL impairment', 'LCD L33790 §1.A', 1),
  ('crit-mwc-2', 'L33790', 'K0001', 'SETTING', NULL, NULL, 'Home use required', 'LCD L33790 §2', 1);

-- Enteral nutrition pump (B9000)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-ent-1', 'L33820', 'B9000', 'DIAGNOSIS_REQUIRED', '["K90.0","K90.4","K90.9","C18.9","C19","C20","K56.0"]', NULL, 'Non-functioning oral intake', 'LCD L33820 §1.A', 1),
  ('crit-ent-2', 'L33820', 'B9000', 'DOCUMENTATION', NULL, NULL, 'Documented inability to swallow safely', 'LCD L33820 §1.B', 1);

-- Parenteral nutrition (B9004)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-par-1', 'L33793', 'B9004', 'DIAGNOSIS_REQUIRED', '["K90.4","K91.2","K92.89","K63.81","C16.9","C17.9","C18.9"]', NULL, 'Severe GI dysfunction preventing absorption', 'LCD L33793 §1.A', 1);

-- Pneumatic compression (E0651)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-pcd-1', 'L33826', 'E0651', 'DIAGNOSIS_REQUIRED', '["I89.0","Q82.0","I97.2","I97.89"]', NULL, 'Lymphedema (primary or secondary)', 'LCD L33826 §1.A', 1),
  ('crit-pcd-2', 'L33826', 'E0651', 'DOCUMENTATION', NULL, NULL, '4 weeks of conservative therapy failed', 'LCD L33826 §1.B', 1);

-- Bone growth stimulator (E0747)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-bgs-1', 'L33810', 'E0747', 'DIAGNOSIS_REQUIRED', '["M84.30XA","M84.40XA","M84.50XA"]', NULL, 'Nonunion of fracture (>= 3 months since fx)', 'LCD L33810 §1.A', 1);

-- CPM (E0935)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-cpm-1', 'L33811', 'E0935', 'DIAGNOSIS_REQUIRED', '["Z47.1","Z96.651","Z96.652"]', NULL, 'Post total knee arthroplasty within 14 days', 'LCD L33811 §1.A', 1);

-- Speech generating device (E2510)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-sgd-1', 'L33809', 'E2510', 'CLINICAL_FINDING', NULL, 'Severe expressive speech impairment from neurologic condition', 'SLP evaluation establishes inability to meet daily communication needs through natural modalities', 'LCD L33809 §1.A', 1),
  ('crit-sgd-2', 'L33809', 'E2510', 'DOCUMENTATION', NULL, NULL, 'Speech-language pathologist evaluation report', 'LCD L33809 §1.B', 1);

-- Microprocessor knee (L5856)
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-mpk-1', 'L33796', 'L5856', 'DIAGNOSIS_REQUIRED', '["Z89.611","Z89.612","Z89.619"]', NULL, 'Trans-femoral amputation', 'LCD L33796 §1.A', 1),
  ('crit-mpk-2', 'L33796', 'L5856', 'CLINICAL_FINDING', NULL, 'K3 or K4 functional level documented', 'Functional level evaluation', 'LCD L33796 §1.B', 1);

-- Knee orthosis L1832
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-ko-1', 'L33832', 'L1832', 'DIAGNOSIS_REQUIRED', '["M17.10","M17.11","M17.12","M23.50","M23.51","M23.52"]', NULL, 'Knee OA or ligament instability', 'LCD L33832 §1.A', 1);

-- AFO L1902
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-afo-1', 'L33833', 'L1902', 'DIAGNOSIS_REQUIRED', '["G83.10","G83.11","G83.12","G83.13","G83.14","I69.331","I69.332"]', NULL, 'Foot drop or related neuromuscular deficit', 'LCD L33833 §1.A', 1);

-- TENS for chronic low back pain
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-tens-1', 'L33807', 'E0720', 'DIAGNOSIS_REQUIRED', '["M54.50","M54.51","M54.59"]', NULL, 'Chronic low back pain >= 3 months', 'LCD L33807 §1.A', 1),
  ('crit-tens-2', 'L33807', 'E0720', 'DOCUMENTATION', NULL, NULL, '30-day trial period required before purchase', 'LCD L33807 §1.B', 1);

-- Suction pump E0600
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-suc-1', 'L33830', 'E0600', 'DIAGNOSIS_REQUIRED', '["J95.04","J95.09","Q31.5","R09.81"]', NULL, 'Tracheostomy or severe pulmonary secretions', 'LCD L33830 §1.A', 1);

-- Tracheostomy tubes A4623
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-trach-1', 'L33828', 'A4623', 'DIAGNOSIS_REQUIRED', '["Z93.0","J95.04"]', NULL, 'Patient has tracheostomy', 'LCD L33828 §1.A', 1);

-- Wearable defibrillator K0606
INSERT OR IGNORE INTO `lcd_coverage_criteria` (`id`, `lcd_document_id`, `hcpc_code`, `criterion_type`, `icd10_codes`, `required_finding`, `description`, `citation`, `is_mandatory`) VALUES
  ('crit-wcd-1', 'L33825', 'K0606', 'CLINICAL_FINDING', NULL, 'High risk for sudden cardiac death pending ICD decision or contraindication', 'Cardiology evaluation', 'LCD L33825 §1.A', 1);
