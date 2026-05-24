/**
 * LCD/NCD coverage criteria evaluator.
 *
 * Given a (hcpcCode, icd10List, clinicalFindings) tuple, walks every active
 * lcd_coverage_criteria row for that HCPC and decides:
 *   MEETS                — all mandatory criteria satisfied
 *   DOES_NOT_MEET        — at least one mandatory criterion failed
 *   NEEDS_CLINICAL_REVIEW — clinical-finding criteria can't be evaluated automatically
 *   UNKNOWN              — no criteria on file for this HCPC
 *
 * Auto-evaluable criterion types:
 *   - DIAGNOSIS_REQUIRED — pass if any icd10 in icd10List ∈ criterion.icd10Codes
 *   - DIAGNOSIS_EXCLUDED — pass if no icd10 in icd10List ∈ criterion.icd10Codes
 *   - SETTING           — caller supplies setting in payload
 *
 * Manual-review criterion types:
 *   - CLINICAL_FINDING — narrative ("AHI/RDI >= 15"); returned in needsReview
 *   - DOCUMENTATION    — checked against dme_order_documents (received vs missing)
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  lcdCoverageCriteria,
  lcdDocuments,
  lcdCheckResults,
  dmeOrderDocuments,
  type LcdDecision,
} from '@curavend/db';
import type { D1Database } from '@cloudflare/workers-types';

export interface CriterionEvaluation {
  criterionId: string;
  criterionType: string;
  citation: string | null;
  description: string;
  passed: boolean | null;        // true / false / null (needs review)
  reason: string;                // human-readable explanation
}

export interface LcdCheckInput {
  hcpcCode: string;
  icd10List?: string[];
  setting?: string;              // HOME / SNF / HOSPICE / OTHER
  orderId?: string;              // for DOCUMENTATION checks
  // Free-text snippets — returned to user for confirmation when narrative
  // CLINICAL_FINDING criterion isn't structured. Optional.
  clinicalFindings?: string[];
  // Structured findings — keyed by criterion's `findingName`
  // (e.g. { "SpO2": 87, "AHI": 22, "wound_area_cm2": 14.5 }). When present,
  // CLINICAL_FINDING_THRESHOLD criteria are auto-evaluated.
  findings?: Record<string, number | null>;
}

export interface LcdCheckOutput {
  decision: LcdDecision;
  hcpcCode: string;
  evaluations: CriterionEvaluation[];
  citations: string[];
  explanation: string;
}

export async function evaluateLcdCoverage(
  d1: D1Database,
  input: LcdCheckInput,
): Promise<LcdCheckOutput> {
  const db = getDb(d1);

  const criteria = await db
    .select()
    .from(lcdCoverageCriteria)
    .where(eq(lcdCoverageCriteria.hcpcCode, input.hcpcCode));

  if (criteria.length === 0) {
    return {
      decision: 'UNKNOWN',
      hcpcCode: input.hcpcCode,
      evaluations: [],
      citations: [],
      explanation: `No LCD/NCD criteria on file for ${input.hcpcCode}. Manual coverage review recommended.`,
    };
  }

  // Pull received docs once if orderId is provided
  let receivedDocs = new Set<string>();
  if (input.orderId) {
    const docs = await db
      .select()
      .from(dmeOrderDocuments)
      .where(
        and(
          eq(dmeOrderDocuments.orderId, input.orderId),
          eq(dmeOrderDocuments.status, 'RECEIVED'),
        ),
      );
    receivedDocs = new Set(docs.map((d) => d.documentType));
  }

  const icd10Set = new Set((input.icd10List ?? []).map((c) => c.trim().toUpperCase()));
  const evaluations: CriterionEvaluation[] = [];
  let anyFailed = false;
  let anyNeedsReview = false;

  for (const c of criteria) {
    let passed: boolean | null = null;
    let reason = '';

    switch (c.criterionType) {
      case 'DIAGNOSIS_REQUIRED': {
        const required = c.icd10Codes ? (JSON.parse(c.icd10Codes) as string[]) : [];
        const requiredSet = new Set(required.map((s) => s.toUpperCase()));
        const hit = Array.from(icd10Set).find((d) => requiredSet.has(d));
        passed = !!hit;
        reason = hit
          ? `Diagnosis ${hit} matches required list`
          : `None of patient's diagnoses match required list: ${required.join(', ')}`;
        break;
      }
      case 'DIAGNOSIS_EXCLUDED': {
        const excluded = c.icd10Codes ? (JSON.parse(c.icd10Codes) as string[]) : [];
        const excludedSet = new Set(excluded.map((s) => s.toUpperCase()));
        const hit = Array.from(icd10Set).find((d) => excludedSet.has(d));
        passed = !hit;
        reason = hit
          ? `Patient has excluded diagnosis ${hit}`
          : `Patient has no excluded diagnoses`;
        break;
      }
      case 'SETTING': {
        const desc = c.description.toLowerCase();
        const setting = (input.setting ?? '').toUpperCase();
        if (!setting) {
          passed = null;
          reason = 'Care setting not specified';
          anyNeedsReview = true;
        } else if (desc.includes('home') && setting === 'HOME') {
          passed = true;
          reason = `Home setting matches`;
        } else if (desc.includes('home') && setting !== 'HOME') {
          passed = false;
          reason = `${setting} setting not covered (requires HOME)`;
        } else {
          passed = null;
          reason = 'Setting criterion requires manual review';
          anyNeedsReview = true;
        }
        break;
      }
      case 'DOCUMENTATION': {
        // Map free-text description to document type heuristically
        const d = c.description.toLowerCase();
        let needsType: string | null = null;
        if (d.includes('face-to-face')) needsType = 'FACE_TO_FACE';
        else if (d.includes('lmn') || d.includes('letter of medical')) needsType = 'LMN';
        else if (d.includes('oximetry') || d.includes('arterial blood gas')) needsType = 'OXIMETRY';
        else if (d.includes('sleep study')) needsType = 'SLEEP_STUDY';
        else if (d.includes('photo')) needsType = 'PHOTO';
        else if (d.includes('cmn')) needsType = 'CMN';
        else if (d.includes('progress notes')) needsType = 'PROGRESS_NOTES';

        if (!needsType) {
          passed = null;
          reason = 'Documentation criterion — manual review';
          anyNeedsReview = true;
        } else if (input.orderId) {
          passed = receivedDocs.has(needsType);
          reason = passed
            ? `Required ${needsType} document is on file`
            : `Required ${needsType} document is missing`;
        } else {
          passed = null;
          reason = `Requires ${needsType} document — order context not provided`;
          anyNeedsReview = true;
        }
        break;
      }
      case 'CLINICAL_FINDING_THRESHOLD': {
        // Auto-evaluable when the wizard captured the finding value.
        const name = (c as any).findingName as string | null;
        const op = (c as any).findingOperator as string | null;
        const thr = (c as any).findingThreshold as number | null;
        const thr2 = (c as any).findingThreshold2 as number | null;
        const unit = (c as any).findingUnit as string | null;
        if (!name || !op || thr == null) {
          passed = null;
          reason = 'Threshold rule incomplete; manual review';
          anyNeedsReview = true;
          break;
        }
        const v = input.findings?.[name];
        if (v == null || Number.isNaN(v)) {
          passed = null;
          reason = `${name} value not provided; manual review`;
          anyNeedsReview = true;
          break;
        }
        let ok = false;
        switch (op) {
          case '<=': ok = v <= thr; break;
          case '<':  ok = v <  thr; break;
          case '>=': ok = v >= thr; break;
          case '>':  ok = v >  thr; break;
          case '=':  ok = v === thr; break;
          case '!=': ok = v !== thr; break;
          case 'BETWEEN':
            ok = thr2 != null ? v >= thr && v <= thr2 : false;
            break;
          default:
            passed = null;
            reason = `Unknown operator ${op}; manual review`;
            anyNeedsReview = true;
            break;
        }
        if (passed === null && op !== undefined && reason === '') {
          // (fallthrough guard, shouldn't happen)
        }
        if (op === '<=' || op === '<' || op === '>=' || op === '>' || op === '=' || op === '!=' || op === 'BETWEEN') {
          passed = ok;
          const display = `${v}${unit ?? ''}`;
          const target = op === 'BETWEEN' ? `${thr}${unit ?? ''} – ${thr2}${unit ?? ''}` : `${op} ${thr}${unit ?? ''}`;
          reason = ok
            ? `${name} = ${display} satisfies ${target}`
            : `${name} = ${display} fails ${target}`;
        }
        break;
      }
      case 'CLINICAL_FINDING':
      default: {
        passed = null;
        reason = 'Clinical finding requires clinician review';
        anyNeedsReview = true;
        break;
      }
    }

    evaluations.push({
      criterionId: c.id,
      criterionType: c.criterionType,
      citation: c.citation,
      description: c.description,
      passed,
      reason,
    });

    if (passed === false && c.isMandatory) {
      anyFailed = true;
    }
  }

  // Decide. UNKNOWN is only emitted when there are no evaluable criteria
  // at all; otherwise the trinary below covers every reachable case.
  let decision: LcdDecision;
  let explanation: string;
  if (evaluations.length === 0) {
    decision = 'UNKNOWN';
    explanation = 'No criteria on file.';
  } else {
    if (anyFailed) decision = 'DOES_NOT_MEET';
    else if (anyNeedsReview) decision = 'NEEDS_CLINICAL_REVIEW';
    else decision = 'MEETS';
    switch (decision) {
      case 'MEETS':
        explanation = `All ${evaluations.length} criteria satisfied. Order appears to meet coverage.`;
        break;
      case 'DOES_NOT_MEET':
        explanation = `${evaluations.filter((e) => e.passed === false).length} mandatory criteria failed.`;
        break;
      case 'NEEDS_CLINICAL_REVIEW':
        explanation = `${evaluations.filter((e) => e.passed === null).length} criteria require clinician review.`;
        break;
    }
  }

  const citations = Array.from(
    new Set(evaluations.map((e) => e.citation).filter(Boolean) as string[]),
  );

  return { decision, hcpcCode: input.hcpcCode, evaluations, citations, explanation };
}

/** Cache a check result for later display on order detail. */
export async function persistLcdCheck(
  d1: D1Database,
  result: LcdCheckOutput,
  context: { orderId?: string; userId: string; icd10List?: string[] },
): Promise<void> {
  const db = getDb(d1);
  await db.insert(lcdCheckResults).values({
    id: crypto.randomUUID(),
    orderId: context.orderId ?? null,
    hcpcCode: result.hcpcCode,
    icd10List: context.icd10List ? JSON.stringify(context.icd10List) : null,
    decision: result.decision,
    citations: JSON.stringify(result.citations),
    explanation: result.explanation,
    checkedAt: new Date().toISOString(),
    checkedByUserId: context.userId,
  });
}

/**
 * Bulk upsert criteria from a JSON dump (real CMS data ingest). Each entry is
 * expected to follow the lcd_coverage_criteria shape. Returns count.
 */
export async function ingestLcdJson(
  d1: D1Database,
  documents: Array<{
    id: string;
    kind: string;
    title: string;
    contractor?: string;
    jurisdiction?: string;
    effectiveDate?: string;
    revisionDate?: string;
    sourceUrl?: string;
    summary?: string;
    criteria: Array<{
      hcpcCode: string;
      criterionType: string;
      icd10Codes?: string[];
      requiredFinding?: string;
      description: string;
      citation?: string;
      isMandatory?: boolean;
    }>;
  }>,
): Promise<{ documents: number; criteria: number }> {
  const db = getDb(d1);
  let docCount = 0;
  let critCount = 0;
  const now = new Date().toISOString();

  for (const doc of documents) {
    await (db as any).run(`DELETE FROM lcd_documents WHERE id = ?`, [doc.id]);
    await db.insert(lcdDocuments).values({
      id: doc.id,
      kind: doc.kind,
      title: doc.title,
      contractor: doc.contractor ?? null,
      jurisdiction: doc.jurisdiction ?? null,
      effectiveDate: doc.effectiveDate ?? null,
      revisionDate: doc.revisionDate ?? null,
      sourceUrl: doc.sourceUrl ?? null,
      summary: doc.summary ?? null,
      isActive: 1,
      fetchedAt: now,
    });
    docCount++;
    // Wipe old criteria for this LCD
    await (db as any).run(`DELETE FROM lcd_coverage_criteria WHERE lcd_document_id = ?`, [doc.id]);
    for (const c of doc.criteria ?? []) {
      await db.insert(lcdCoverageCriteria).values({
        id: crypto.randomUUID(),
        lcdDocumentId: doc.id,
        hcpcCode: c.hcpcCode.toUpperCase(),
        criterionType: c.criterionType,
        icd10Codes: c.icd10Codes ? JSON.stringify(c.icd10Codes) : null,
        requiredFinding: c.requiredFinding ?? null,
        description: c.description,
        citation: c.citation ?? null,
        isMandatory: c.isMandatory === false ? 0 : 1,
        createdAt: now,
      });
      critCount++;
    }
  }
  return { documents: docCount, criteria: critCount };
}
