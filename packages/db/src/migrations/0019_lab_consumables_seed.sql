-- 0019_lab_consumables_seed.sql
-- Seed common lab consumables (50+) and test→consumable mappings (top tests).
-- Catalog rows are platform-wide (lab_group_id NULL) so every tenant inherits.
-- Mappings are also platform-wide; individual labs can override by inserting
-- rows with their own lab_group_id (the wizard prefers tenant-specific maps).

-- ── Reagents (molecular, immunoassay, chemistry) ──────────────────────────
INSERT OR IGNORE INTO `lab_consumables` (
  `id`, `lab_group_id`, `item_code`, `description`, `category`,
  `manufacturer`, `storage_temp_min_c`, `storage_temp_max_c`, `hazard_class`,
  `usage_uom`, `units_per_case`, `min_threshold`, `max_threshold`, `reorder_point`,
  `reorder_quantity`, `requires_lot_tracking`, `default_unit_price_usd`
) VALUES
  ('seed-rxg-pcr-mix',   NULL, 'PCR-MM-2X',    '2× PCR master mix, 1mL',                   'REAGENT',    'ThermoFisher', -20, -10, 'NONE',      'mL',   10, 50,  500, 100, 200, 1, 18.50),
  ('seed-rxg-rt-mix',    NULL, 'RT-MM-1X',     'One-step RT-PCR master mix, 1mL',          'REAGENT',    'ThermoFisher', -20, -10, 'NONE',      'mL',   10, 30,  300, 60,  120, 1, 28.75),
  ('seed-rxg-flu-primer',NULL, 'FLU-PRIMER',   'Influenza A/B primer probe mix',           'REAGENT',    'IDT',           2,   8, 'NONE',      'rxn', 100, 100, 1000, 200, 400, 1, 1.25),
  ('seed-rxg-cov-primer',NULL, 'COV-PRIMER',   'SARS-CoV-2 N1/N2 primer probe mix',        'REAGENT',    'IDT',           2,   8, 'NONE',      'rxn', 100, 200, 2000, 400, 800, 1, 1.35),
  ('seed-rxg-rsv-primer',NULL, 'RSV-PRIMER',   'RSV A/B primer probe mix',                 'REAGENT',    'IDT',           2,   8, 'NONE',      'rxn', 100, 50,  500, 100, 200, 1, 1.20),
  ('seed-rxg-strep-prim',NULL, 'STREP-PRIMER', 'Strep A primer probe mix',                 'REAGENT',    'IDT',           2,   8, 'NONE',      'rxn', 100, 50,  500, 100, 200, 1, 1.15),
  ('seed-rxg-hiv-pcr',   NULL, 'HIV-PROBE',    'HIV-1 viral load PCR probe kit',           'REAGENT',    'Roche',        -20, -10, 'BIOHAZARD', 'rxn',  48,  20, 100, 40,   60, 1, 12.40),
  ('seed-rxg-rpr-rgt',   NULL, 'RPR-CARD',     'RPR card test antigen + control',          'REAGENT',    'BD',            2,   8, 'NONE',      'test', 50,  20, 200, 40,   80, 1, 2.10),
  ('seed-rxg-cbc-rgt',   NULL, 'CBC-DIL',      'CBC diluent reagent, 20L',                 'REAGENT',    'Sysmex',        15,  30, 'NONE',      'L',     4,   8,  60, 16,   32, 1, 87.00),
  ('seed-rxg-cbc-lyse',  NULL, 'CBC-LYSE',     'CBC lysing reagent, 5L',                   'REAGENT',    'Sysmex',        15,  30, 'CHEMICAL',  'L',     4,  12,  80, 24,   48, 1, 64.00),
  ('seed-rxg-cbc-stain', NULL, 'CBC-STAIN',    'CBC stain reagent, 1L',                    'REAGENT',    'Sysmex',         2,   8, 'CHEMICAL',  'L',     4,   8,  60, 16,   32, 1, 110.00),
  ('seed-rxg-bmp-rgt',   NULL, 'BMP-RGT',      'Basic metabolic panel reagent pack',       'REAGENT',    'Roche',          2,   8, 'NONE',      'pack', 10,  10, 100, 20,   40, 1, 145.00),
  ('seed-rxg-ua-strip',  NULL, 'UA-STRIP',     'Urinalysis test strip, 10-panel',          'REAGENT',    'Siemens',       15,  30, 'NONE',      'each',100, 200, 2000, 400, 800, 1, 0.18),
  ('seed-rxg-blood-glu', NULL, 'BG-STRIP',     'Blood glucose test strip',                 'REAGENT',    'Abbott',         2,  30, 'NONE',      'each',100, 200, 5000, 800, 1600, 1, 0.32),

-- ── Controls + calibrators ────────────────────────────────────────────────
  ('seed-ctrl-cbc-high', NULL, 'CTRL-CBC-H',   'CBC high-range control, 4 vials',          'CONTROL',    'Sysmex',         2,   8, 'BIOHAZARD', 'vial', 4,   8,  40, 12,   16, 1, 95.00),
  ('seed-ctrl-cbc-low',  NULL, 'CTRL-CBC-L',   'CBC low-range control, 4 vials',           'CONTROL',    'Sysmex',         2,   8, 'BIOHAZARD', 'vial', 4,   8,  40, 12,   16, 1, 95.00),
  ('seed-ctrl-chem-l1',  NULL, 'CTRL-CHEM-L1', 'Chemistry control level 1',                'CONTROL',    'Bio-Rad',        2,   8, 'BIOHAZARD', 'vial', 6,   6,  30,  9,   12, 1, 120.00),
  ('seed-ctrl-chem-l2',  NULL, 'CTRL-CHEM-L2', 'Chemistry control level 2',                'CONTROL',    'Bio-Rad',        2,   8, 'BIOHAZARD', 'vial', 6,   6,  30,  9,   12, 1, 120.00),
  ('seed-ctrl-pcr-pos',  NULL, 'CTRL-PCR-POS', 'PCR positive control template',            'CONTROL',    'ATCC',         -20, -10, 'NONE',      'vial', 5,   3,  20,  6,    8, 1, 78.00),
  ('seed-ctrl-pcr-neg',  NULL, 'CTRL-PCR-NEG', 'PCR negative control (NTC)',               'CONTROL',    'ATCC',         -20, -10, 'NONE',      'vial', 5,   3,  20,  6,    8, 1, 22.00),
  ('seed-cal-glu',       NULL, 'CAL-GLU',      'Glucose calibrator, multi-level',          'CALIBRATOR', 'Roche',          2,   8, 'NONE',      'pack', 1,   2,  12,  4,    6, 1, 78.00),

-- ── Kits ──────────────────────────────────────────────────────────────────
  ('seed-kit-flu',       NULL, 'KIT-FLU-PCR',  'Influenza A/B PCR kit (96 tests)',         'KIT',        'Cepheid',        2,   8, 'BIOHAZARD', 'kit',  4,   2,  20,  4,    8, 1, 245.00),
  ('seed-kit-cov',       NULL, 'KIT-COV-PCR',  'SARS-CoV-2 PCR kit (96 tests)',            'KIT',        'Cepheid',        2,   8, 'BIOHAZARD', 'kit',  4,   4,  30,  8,   12, 1, 285.00),
  ('seed-kit-strep',     NULL, 'KIT-STREP-PCR','Strep A PCR kit (50 tests)',               'KIT',        'BD',             2,   8, 'BIOHAZARD', 'kit',  4,   2,  16,  4,    8, 1, 195.00),
  ('seed-kit-hcg',       NULL, 'KIT-HCG',      'Urine pregnancy hCG test cassette',        'KIT',        'Abbott',        15,  30, 'NONE',      'each',50, 100,  800, 200, 400, 0, 1.40),
  ('seed-kit-cov-rapid', NULL, 'KIT-COV-RAP',  'COVID rapid antigen test',                 'KIT',        'BD',             2,  30, 'BIOHAZARD', 'each',25,  50,  500, 100, 200, 1, 6.85),

-- ── Swabs + collection ────────────────────────────────────────────────────
  ('seed-swab-np',       NULL, 'SWAB-NP',      'Nasopharyngeal flocked swab, sterile',     'SWAB',       'Copan',         15,  30, 'NONE',      'each',100, 200, 2000, 400, 800, 1, 0.85),
  ('seed-swab-throat',   NULL, 'SWAB-THROAT',  'Throat swab, Dacron, sterile',             'SWAB',       'Copan',         15,  30, 'NONE',      'each',100, 100, 1000, 200, 400, 1, 0.42),
  ('seed-swab-wound',    NULL, 'SWAB-WOUND',   'Wound culture swab w transport media',     'SWAB',       'BBL',           15,  30, 'BIOHAZARD', 'each', 50,  50,  500, 100, 200, 1, 1.10),
  ('seed-vtm',           NULL, 'VTM-3ML',      'Viral transport media, 3mL tube',          'TUBE',       'Copan',          2,   8, 'NONE',      'each',100, 200, 2000, 400, 800, 1, 0.95),

-- ── Collection tubes (by additive) ────────────────────────────────────────
  ('seed-tube-edta',     NULL, 'TUBE-EDTA',    'EDTA (lavender) blood tube, 4mL',          'TUBE',       'BD Vacutainer', 15,  30, 'NONE',      'each',100, 200, 2000, 400, 800, 1, 0.28),
  ('seed-tube-sst',      NULL, 'TUBE-SST',     'SST (gold) serum separator tube, 5mL',     'TUBE',       'BD Vacutainer', 15,  30, 'NONE',      'each',100, 200, 2000, 400, 800, 1, 0.32),
  ('seed-tube-citrate',  NULL, 'TUBE-CIT',     'Citrate (blue) coag tube, 2.7mL',          'TUBE',       'BD Vacutainer', 15,  30, 'NONE',      'each',100, 100, 1000, 200, 400, 1, 0.31),
  ('seed-tube-hep',      NULL, 'TUBE-HEP',     'Lithium heparin (green) tube, 4mL',        'TUBE',       'BD Vacutainer', 15,  30, 'NONE',      'each',100, 100, 1000, 200, 400, 1, 0.30),
  ('seed-tube-fluoride', NULL, 'TUBE-FLU',     'Fluoride/oxalate (gray) glucose tube',     'TUBE',       'BD Vacutainer', 15,  30, 'NONE',      'each',100,  50,  500, 100, 200, 1, 0.34),
  ('seed-tube-urine',    NULL, 'TUBE-URINE',   'Urine collection tube, sterile, 10mL',     'TUBE',       'BD',            15,  30, 'NONE',      'each',100, 100, 1000, 200, 400, 0, 0.18),

-- ── Tips + consumables ────────────────────────────────────────────────────
  ('seed-tip-10',        NULL, 'TIP-10UL',     'Pipette tip 10µL, filtered, sterile',      'PIPETTE_TIP','Eppendorf',     15,  30, 'NONE',      'each',960, 960, 9600, 1920, 3840, 0, 0.05),
  ('seed-tip-200',       NULL, 'TIP-200UL',    'Pipette tip 200µL, filtered, sterile',     'PIPETTE_TIP','Eppendorf',     15,  30, 'NONE',      'each',960, 960, 9600, 1920, 3840, 0, 0.06),
  ('seed-tip-1000',      NULL, 'TIP-1000UL',   'Pipette tip 1000µL, filtered, sterile',    'PIPETTE_TIP','Eppendorf',     15,  30, 'NONE',      'each',960, 960, 9600, 1920, 3840, 0, 0.08),

-- ── Plates ────────────────────────────────────────────────────────────────
  ('seed-plate-96',      NULL, 'PLATE-96W',    '96-well PCR plate, semi-skirted, white',   'PLATE',      'Bio-Rad',       15,  30, 'NONE',      'each',50,  20,  200, 40,   80, 1, 4.20),
  ('seed-plate-elisa',   NULL, 'PLATE-ELISA',  '96-well ELISA plate, high-binding',        'PLATE',      'Corning',       15,  30, 'NONE',      'each',50,  10,  100, 20,   40, 1, 8.50),
  ('seed-plate-seal',    NULL, 'PLATE-SEAL',   'PCR plate seal, optical, adhesive',        'PLATE',      'Applied',       15,  30, 'NONE',      'each',100, 50,  500, 100, 200, 0, 0.65),

-- ── PPE ───────────────────────────────────────────────────────────────────
  ('seed-ppe-glove-s',   NULL, 'GLOVE-NIT-S',  'Nitrile glove, powder-free, small',        'PPE',        'Kimtech',       15,  30, 'NONE',      'each',100, 500, 5000, 1000, 2000, 0, 0.09),
  ('seed-ppe-glove-m',   NULL, 'GLOVE-NIT-M',  'Nitrile glove, powder-free, medium',       'PPE',        'Kimtech',       15,  30, 'NONE',      'each',100, 1000, 10000, 2000, 4000, 0, 0.09),
  ('seed-ppe-glove-l',   NULL, 'GLOVE-NIT-L',  'Nitrile glove, powder-free, large',        'PPE',        'Kimtech',       15,  30, 'NONE',      'each',100, 500, 5000, 1000, 2000, 0, 0.09),
  ('seed-ppe-gown',      NULL, 'GOWN-ISO',     'Isolation gown, level 2, disposable',      'PPE',        'Halyard',       15,  30, 'NONE',      'each', 50,  50,  500, 100, 200, 0, 1.80),
  ('seed-ppe-n95',       NULL, 'MASK-N95',     'N95 respirator, NIOSH-approved',           'PPE',        '3M',            15,  30, 'NONE',      'each', 20,  40,  400,  80, 160, 0, 1.95),
  ('seed-ppe-surgmask',  NULL, 'MASK-SURG',    'Surgical mask, 3-ply, earloop',            'PPE',        '3M',            15,  30, 'NONE',      'each',100, 200, 2000, 400, 800, 0, 0.18),
  ('seed-ppe-shield',    NULL, 'FACE-SHIELD',  'Face shield, anti-fog',                    'PPE',        'Honeywell',     15,  30, 'NONE',      'each', 25,  20,  200,  40,  80, 0, 4.50),

-- ── Cleaning ─────────────────────────────────────────────────────────────
  ('seed-clean-bleach',  NULL, 'BLEACH-1G',    'Sodium hypochlorite 5.25%, 1 gallon',      'CLEANING',   'Clorox',        15,  30, 'CORROSIVE', 'each',  4,   4,   40,  8,   16, 0, 12.00),
  ('seed-clean-etoh',    NULL, 'ETOH-70-1L',   '70% Ethanol, 1L bottle',                   'CLEANING',   'Sigma',         15,  30, 'FLAMMABLE', 'each',  6,  10,  100, 20,   40, 0, 18.40),
  ('seed-clean-iso',     NULL, 'ISO-99-1L',    'Isopropanol 99%, 1L bottle',               'CLEANING',   'Sigma',         15,  30, 'FLAMMABLE', 'each',  6,  10,  100, 20,   40, 0, 16.20);

-- ── Test → consumable usage map ──────────────────────────────────────────
-- (testCode in CPT format; mappings are platform-wide so any lab tenant
--  with matching kit-site + ordered tests gets a forecast.)
INSERT OR IGNORE INTO `lab_test_consumables` (
  `id`, `lab_group_id`, `test_code`, `test_description`, `consumable_id`, `quantity_per_test`, `is_critical`
) VALUES
  -- Flu PCR (CPT 87502)
  ('map-flu-swab',   NULL, '87502', 'Influenza A/B by NAAT',                  'seed-swab-np',      1,   1),
  ('map-flu-vtm',    NULL, '87502', 'Influenza A/B by NAAT',                  'seed-vtm',          1,   1),
  ('map-flu-pcrmix', NULL, '87502', 'Influenza A/B by NAAT',                  'seed-rxg-pcr-mix',  0.025, 1),
  ('map-flu-primer', NULL, '87502', 'Influenza A/B by NAAT',                  'seed-rxg-flu-primer', 1, 1),
  ('map-flu-plate',  NULL, '87502', 'Influenza A/B by NAAT',                  'seed-plate-96',     0.0104, 0),
  ('map-flu-tip200', NULL, '87502', 'Influenza A/B by NAAT',                  'seed-tip-200',      3,   0),

  -- COVID PCR (CPT 87635)
  ('map-cov-swab',   NULL, '87635', 'SARS-CoV-2 by NAAT',                     'seed-swab-np',      1,   1),
  ('map-cov-vtm',    NULL, '87635', 'SARS-CoV-2 by NAAT',                     'seed-vtm',          1,   1),
  ('map-cov-rtmix',  NULL, '87635', 'SARS-CoV-2 by NAAT',                     'seed-rxg-rt-mix',   0.025, 1),
  ('map-cov-primer', NULL, '87635', 'SARS-CoV-2 by NAAT',                     'seed-rxg-cov-primer', 1, 1),
  ('map-cov-plate',  NULL, '87635', 'SARS-CoV-2 by NAAT',                     'seed-plate-96',     0.0104, 0),
  ('map-cov-tip200', NULL, '87635', 'SARS-CoV-2 by NAAT',                     'seed-tip-200',      3,   0),

  -- Strep A PCR (CPT 87651)
  ('map-strep-swab',   NULL, '87651', 'Strep A by NAAT',                      'seed-swab-throat',  1,   1),
  ('map-strep-rtmix',  NULL, '87651', 'Strep A by NAAT',                      'seed-rxg-pcr-mix',  0.025, 1),
  ('map-strep-primer', NULL, '87651', 'Strep A by NAAT',                      'seed-rxg-strep-prim', 1, 1),

  -- CBC (CPT 85025)
  ('map-cbc-tube',  NULL, '85025', 'CBC with differential',                   'seed-tube-edta',    1, 1),
  ('map-cbc-dil',   NULL, '85025', 'CBC with differential',                   'seed-rxg-cbc-rgt',  0.01, 1),
  ('map-cbc-lyse',  NULL, '85025', 'CBC with differential',                   'seed-rxg-cbc-lyse', 0.002, 1),
  ('map-cbc-stain', NULL, '85025', 'CBC with differential',                   'seed-rxg-cbc-stain', 0.001, 1),
  ('map-cbc-tip10', NULL, '85025', 'CBC with differential',                   'seed-tip-10',       2,   0),

  -- BMP (CPT 80048)
  ('map-bmp-tube',   NULL, '80048', 'Basic metabolic panel',                  'seed-tube-sst',     1, 1),
  ('map-bmp-rgt',    NULL, '80048', 'Basic metabolic panel',                  'seed-rxg-bmp-rgt',  0.025, 1),
  ('map-bmp-tip200', NULL, '80048', 'Basic metabolic panel',                  'seed-tip-200',      2,   0),

  -- Urinalysis (CPT 81003)
  ('map-ua-tube',   NULL, '81003', 'Urinalysis automated dipstick',           'seed-tube-urine',   1, 1),
  ('map-ua-strip',  NULL, '81003', 'Urinalysis automated dipstick',           'seed-rxg-ua-strip', 1, 1),

  -- Blood glucose (CPT 82962)
  ('map-bg-strip',  NULL, '82962', 'Glucose by reagent strip',                'seed-rxg-blood-glu', 1, 1),

  -- RPR (CPT 86593)
  ('map-rpr-tube',  NULL, '86593', 'RPR (syphilis screen)',                   'seed-tube-sst',     1, 1),
  ('map-rpr-rgt',   NULL, '86593', 'RPR (syphilis screen)',                   'seed-rxg-rpr-rgt',  1, 1),

  -- HIV viral load (CPT 87536)
  ('map-hiv-tube',  NULL, '87536', 'HIV-1 viral load',                        'seed-tube-edta',    1, 1),
  ('map-hiv-probe', NULL, '87536', 'HIV-1 viral load',                        'seed-rxg-hiv-pcr',  1, 1),
  ('map-hiv-plate', NULL, '87536', 'HIV-1 viral load',                        'seed-plate-96',     0.0104, 0),

  -- Pregnancy urine (CPT 81025)
  ('map-hcg-tube',  NULL, '81025', 'Urine pregnancy hCG',                     'seed-tube-urine',   1, 0),
  ('map-hcg-kit',   NULL, '81025', 'Urine pregnancy hCG',                     'seed-kit-hcg',      1, 1),

  -- Cross-cutting PPE — every patient encounter consumes ~1 glove + 1 mask
  -- (caller can override per lab tenant). Mapped to a synthetic "encounter"
  -- testCode so labs can opt-in by adding it to their tests log.
  ('map-enc-glove-m', NULL, 'ENCOUNTER', 'Per-patient PPE consumption',       'seed-ppe-glove-m',  2, 0),
  ('map-enc-mask',    NULL, 'ENCOUNTER', 'Per-patient PPE consumption',       'seed-ppe-surgmask', 1, 0);
