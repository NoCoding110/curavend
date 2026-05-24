import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * CMS Required Prior Authorization list.
 *
 * CMS maintains a list of DMEPOS HCPCS that REQUIRE prior authorization
 * before Medicare will pay. When a hospital creates an order with one of
 * these codes, Curavend auto-creates a prior_auths row in NEEDED status
 * and flags `dme_order_extensions.cms_pa_required = 1`.
 *
 * Seeded from the published CMS list as of the most-recent quarterly update.
 * Refreshable via /api/admin/cms-pa-list/refresh (admin only).
 */
export const cmsPaRequiredHcpcs = sqliteTable(
  'cms_pa_required_hcpcs',
  {
    hcpcCode: text('hcpc_code').primaryKey(),
    description: text('description'),
    effectiveDate: text('effective_date'),
    sourceUrl: text('source_url'),
    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),
    addedAt: text('added_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

/**
 * CMS LCD (Local Coverage Determination) and NCD (National Coverage
 * Determination) documents. Each LCD covers a topic (e.g. "Continuous
 * Positive Airway Pressure (CPAP) Therapy", "Oxygen and Oxygen
 * Equipment", "Power Mobility Devices").
 *
 * Stored as a header row with metadata; coverage criteria live in
 * `lcd_coverage_criteria` (one row per criterion).
 */
export const LCD_KINDS = ['LCD', 'NCD', 'LCA'] as const; // LCA = Local Coverage Article
export type LcdKind = (typeof LCD_KINDS)[number];

export const lcdDocuments = sqliteTable(
  'lcd_documents',
  {
    id: text('id').primaryKey(),                       // CMS document ID (e.g. L33718)
    kind: text('kind').notNull(),                      // LCD / NCD / LCA
    title: text('title').notNull(),
    contractor: text('contractor'),                    // e.g. CGS, Noridian, Palmetto
    jurisdiction: text('jurisdiction'),                // e.g. J15, JE, JF
    effectiveDate: text('effective_date'),
    revisionDate: text('revision_date'),
    sourceUrl: text('source_url'),
    summary: text('summary'),
    isActive: integer('is_active').notNull().default(1),
    fetchedAt: text('fetched_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('lcd_documents_kind_idx').on(t.kind),
    index('lcd_documents_active_idx').on(t.isActive),
  ],
);

/**
 * Individual coverage criteria parsed from an LCD/NCD. Each row says:
 *   "for HCPC X (or range), the patient must meet condition Y, evidenced
 *   by diagnosis code Z (or clinical finding)."
 *
 * `criterionType` controls how the criterion is evaluated:
 *   - DIAGNOSIS_REQUIRED — patient must have one of `icd10Codes`
 *   - DIAGNOSIS_EXCLUDED — patient must NOT have any of `icd10Codes`
 *   - CLINICAL_FINDING   — narrative requirement (e.g. SpO2 ≤ 88%); not auto-evaluable
 *   - DOCUMENTATION      — specific document required (e.g. face-to-face within 6 months)
 *   - SETTING            — care setting restriction (e.g. not for SNF)
 */
export const CRITERION_TYPES = [
  'DIAGNOSIS_REQUIRED',
  'DIAGNOSIS_EXCLUDED',
  'CLINICAL_FINDING',
  'DOCUMENTATION',
  'SETTING',
  'OTHER',
] as const;
export type CriterionType = (typeof CRITERION_TYPES)[number];

export const lcdCoverageCriteria = sqliteTable(
  'lcd_coverage_criteria',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    lcdDocumentId: text('lcd_document_id').notNull(),
    hcpcCode: text('hcpc_code').notNull(),
    criterionType: text('criterion_type').notNull(),
    icd10Codes: text('icd10_codes'),          // JSON array, e.g. ["G47.33", "G47.30"]
    requiredFinding: text('required_finding'),
    description: text('description').notNull(),
    citation: text('citation'),               // e.g. "LCD L33718 §1.A"
    isMandatory: integer('is_mandatory').notNull().default(1),
    // ── Structured CLINICAL_FINDING_THRESHOLD support (Session 14 — caveats) ──
    // When criterionType = 'CLINICAL_FINDING_THRESHOLD', these columns define
    // the rule. e.g. findingName='SpO2', operator='<=', threshold=88, unit='%'.
    findingName: text('finding_name'),
    findingOperator: text('finding_operator'),       // '<=' | '<' | '>=' | '>' | '=' | '!=' | 'BETWEEN'
    findingThreshold: real('finding_threshold'),
    findingThreshold2: real('finding_threshold_2'),  // upper bound for BETWEEN
    findingUnit: text('finding_unit'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index('lcd_criteria_hcpc_idx').on(t.hcpcCode),
    index('lcd_criteria_lcd_idx').on(t.lcdDocumentId),
    index('lcd_criteria_type_idx').on(t.criterionType),
  ],
);

/**
 * Cached results of /api/lcd/check calls. Lets us show "last check" results
 * on the order detail page without re-evaluating every time.
 */
export const LCD_DECISIONS = ['MEETS', 'DOES_NOT_MEET', 'UNKNOWN', 'NEEDS_CLINICAL_REVIEW'] as const;
export type LcdDecision = (typeof LCD_DECISIONS)[number];

export const lcdCheckResults = sqliteTable(
  'lcd_check_results',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    orderId: text('order_id'),
    hcpcCode: text('hcpc_code').notNull(),
    icd10List: text('icd10_list'),                     // JSON array of patient's diagnoses at check time
    decision: text('decision').notNull(),
    citations: text('citations'),                      // JSON array of "LCD L33718" entries used
    explanation: text('explanation'),                  // human-readable reason
    checkedAt: text('checked_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    checkedByUserId: text('checked_by_user_id'),
  },
  (t) => [
    index('lcd_check_results_order_idx').on(t.orderId),
    index('lcd_check_results_hcpc_idx').on(t.hcpcCode),
    index('lcd_check_results_decision_idx').on(t.decision),
  ],
);
