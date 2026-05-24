/**
 * CMS Medicare Coverage Database (MCD) scraper.
 *
 * Fetches the LCD/NCD page for a given document ID and parses the
 * "Coverage Indications, Limitations and/or Medical Necessity" section
 * into structured criteria ready for ingestLcdJson().
 *
 * Strategy:
 *   - CMS MCD URL: https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid={N}
 *     (numeric LCD ID without the leading "L")
 *   - Page returns HTML with predictable structure. We extract:
 *       * <title> — for LCD title
 *       * "Contractor Name" cell — for contractor
 *       * "Original Effective Date" cell — for effectiveDate
 *       * "Coverage Indications, Limitations and/or Medical Necessity" section
 *         — narrative free text we surface as a single CLINICAL_FINDING criterion
 *         per detected HCPC code (auto-extracted from "HCPCS Codes" table)
 *
 * The scraper produces a "good-enough" import for admin review — operator
 * still inspects + edits before saving via the existing /api/lcd/ingest.
 *
 * Notes:
 *   - CMS pages are heavyweight HTML (~300KB). We bail out early once we've
 *     captured the relevant chunks to keep CPU + memory low.
 *   - No external dependencies — uses native fetch and regex/string ops.
 *   - Rate limited at the call site (admin clicks button per LCD).
 */

export interface ScrapedLcd {
  id: string;                // e.g. "L33718"
  kind: 'LCD' | 'NCD';
  title: string;
  contractor: string | null;
  jurisdiction: string | null;
  effectiveDate: string | null;
  revisionDate: string | null;
  sourceUrl: string;
  summary: string | null;
  criteria: Array<{
    hcpcCode: string;
    criterionType: 'CLINICAL_FINDING' | 'DOCUMENTATION' | 'DIAGNOSIS_REQUIRED';
    description: string;
    citation: string;
    icd10Codes?: string[];
    isMandatory: boolean;
  }>;
  rawHcpcsCount: number;
  rawIcd10Count: number;
}

const HCPCS_REGEX = /\b([A-V]\d{4})\b/g;
const ICD10_REGEX = /\b([A-Z]\d{2}(?:\.\d{1,4})?)\b/g;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pull a metadata field by label from the page (header table). */
function findMetaField(html: string, label: string): string | null {
  // Patterns like:  <th>Original Effective Date</th><td>10/01/2015</td>
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}[^<]*<\/(?:th|td|span|dt|label)>\\s*<(?:td|span|dd)[^>]*>\\s*([^<]+?)\\s*<`,
    'i',
  );
  const m = re.exec(html);
  return m ? m[1].trim() : null;
}

/** Extract the "Coverage Indications..." section as a long paragraph blob. */
function extractCoverageSection(html: string): string | null {
  // Section heading variants vary; match anything starting with "Coverage Indications"
  const startRe =
    /Coverage Indications[\s,]*Limitations[\s,]*(?:and\/?or )?Medical Necessity[\s\S]{0,200}?<\/(?:h2|h3|h4|strong)>/i;
  const start = startRe.exec(html);
  if (!start) return null;
  const after = html.slice(start.index + start[0].length);
  // End at next major section heading or footer
  const endRe = /(?:<h[1-4][^>]*>|Coding Information|Bill Type Codes|Documentation Requirements|<div[^>]+class="[^"]*footer)/i;
  const end = endRe.exec(after);
  const blob = end ? after.slice(0, end.index) : after.slice(0, 30000);
  return stripHtml(blob).slice(0, 8000);
}

/** Look for the "Documentation Requirements" sibling section. */
function extractDocSection(html: string): string | null {
  const startRe = /Documentation Requirements[\s\S]{0,100}?<\/(?:h2|h3|h4|strong)>/i;
  const start = startRe.exec(html);
  if (!start) return null;
  const after = html.slice(start.index + start[0].length);
  const endRe = /(?:<h[1-4][^>]*>|<div[^>]+class="[^"]*footer)/i;
  const end = endRe.exec(after);
  return stripHtml(end ? after.slice(0, end.index) : after.slice(0, 20000)).slice(0, 4000);
}

export async function fetchAndParseLcd(lcdNumericId: string): Promise<ScrapedLcd> {
  // Normalize: accept "L33718", "33718", "l33718"
  const cleaned = lcdNumericId.replace(/^[Ll]/, '').replace(/\D/g, '');
  if (!cleaned) throw new Error('LCD id must contain digits');
  const lcdId = `L${cleaned}`;
  const sourceUrl = `https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=${cleaned}`;

  const resp = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Curavend/1.0 (LCD coverage importer)',
      Accept: 'text/html',
    },
  });
  if (!resp.ok) {
    throw new Error(`CMS MCD returned ${resp.status} for ${lcdId}`);
  }
  const html = await resp.text();

  // Title — from <title> tag
  const titleMatch = /<title>([^<]+?)<\/title>/i.exec(html);
  const fullTitle = titleMatch ? titleMatch[1].trim() : lcdId;
  // Trim CMS-style suffix
  const title = fullTitle.replace(/\s*\|\s*CMS.*$/i, '').trim();

  const contractor = findMetaField(html, 'Contractor Name')
    ?? findMetaField(html, 'Contractor');
  const jurisdiction = findMetaField(html, 'Jurisdiction');
  const effectiveDateRaw = findMetaField(html, 'Original Effective Date');
  const revisionDateRaw = findMetaField(html, 'Revision Effective Date');

  // Normalize MM/DD/YYYY -> YYYY-MM-DD
  const toIso = (s: string | null): string | null => {
    if (!s) return null;
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (!m) return null;
    const [, mm, dd, yy] = m;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  };

  const coverageSection = extractCoverageSection(html);
  const docSection = extractDocSection(html);

  // Extract unique HCPCS codes referenced in the coverage section
  const hcpcsFound = new Set<string>();
  if (coverageSection) {
    for (const m of coverageSection.matchAll(HCPCS_REGEX)) {
      hcpcsFound.add(m[1].toUpperCase());
    }
  }
  // Fallback: scan the entire doc if the section yielded nothing
  if (hcpcsFound.size === 0) {
    for (const m of html.matchAll(HCPCS_REGEX)) {
      hcpcsFound.add(m[1].toUpperCase());
    }
  }
  // Cap to avoid runaway codes (some MCD pages reference 100s of cross-refs)
  const hcpcs = Array.from(hcpcsFound).slice(0, 30);

  // Extract ICD-10 codes too — used to populate DIAGNOSIS_REQUIRED criteria
  const icd10Found = new Set<string>();
  if (coverageSection) {
    for (const m of coverageSection.matchAll(ICD10_REGEX)) {
      icd10Found.add(m[1].toUpperCase());
    }
  }
  const icd10 = Array.from(icd10Found).slice(0, 50);

  // Build criteria — one CLINICAL_FINDING per HCPC (narrative) + one
  // DIAGNOSIS_REQUIRED if any ICD-10s were captured + one DOCUMENTATION if
  // the Documentation Requirements section exists.
  const criteria: ScrapedLcd['criteria'] = [];
  for (const hcpc of hcpcs) {
    if (coverageSection) {
      criteria.push({
        hcpcCode: hcpc,
        criterionType: 'CLINICAL_FINDING',
        description: coverageSection.slice(0, 1000),
        citation: `${lcdId} (auto-imported)`,
        isMandatory: true,
      });
    }
    if (icd10.length > 0) {
      criteria.push({
        hcpcCode: hcpc,
        criterionType: 'DIAGNOSIS_REQUIRED',
        description: 'One of the qualifying ICD-10 diagnoses required',
        citation: `${lcdId} (auto-imported)`,
        icd10Codes: icd10,
        isMandatory: true,
      });
    }
    if (docSection) {
      criteria.push({
        hcpcCode: hcpc,
        criterionType: 'DOCUMENTATION',
        description: docSection.slice(0, 1000),
        citation: `${lcdId} Documentation Requirements`,
        isMandatory: true,
      });
    }
  }

  return {
    id: lcdId,
    kind: 'LCD',
    title,
    contractor,
    jurisdiction,
    effectiveDate: toIso(effectiveDateRaw),
    revisionDate: toIso(revisionDateRaw),
    sourceUrl,
    summary: coverageSection?.slice(0, 500) ?? null,
    criteria,
    rawHcpcsCount: hcpcsFound.size,
    rawIcd10Count: icd10Found.size,
  };
}
