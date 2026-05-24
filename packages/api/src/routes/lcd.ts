/**
 * /api/lcd — Coverage criteria + check service.
 *
 *   POST /check                   — run coverage check (hcpc + icd10 + setting + optional orderId)
 *   GET  /documents               — list LCD documents
 *   GET  /documents/:id/criteria  — list criteria for an LCD
 *   POST /ingest                  — admin: bulk-upsert LCD JSON
 *   GET  /pa-required             — list CMS PA-required HCPCs
 *   GET  /pa-required/:hcpc       — check if a single HCPC needs CMS PA
 *   POST /pa-required             — admin: add HCPC to CMS PA list
 *   DELETE /pa-required/:hcpc     — admin: remove HCPC from list
 */
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  cmsPaRequiredHcpcs,
  lcdDocuments,
  lcdCoverageCriteria,
  lcdCheckResults,
} from '@curavend/db';
import { desc } from 'drizzle-orm';
import { ValidationError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { evaluateLcdCoverage, persistLcdCheck, ingestLcdJson } from '../services/lcdService';
import { fetchAndParseLcd } from '../services/cmsMcdScraper';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── POST /check ──────────────────────────────────────────────────────────
app.post('/check', async (c) => {
  const body = (await c.req.json()) as {
    hcpcCode?: string;
    icd10List?: string[];
    setting?: string;
    orderId?: string;
    findings?: Record<string, number | null>;
  };
  if (!body.hcpcCode?.trim()) throw new ValidationError('hcpcCode required');
  const user = c.get('user');
  const result = await evaluateLcdCoverage(c.env.DB, {
    hcpcCode: body.hcpcCode.trim().toUpperCase(),
    icd10List: body.icd10List ?? [],
    setting: body.setting,
    orderId: body.orderId,
    findings: body.findings,
  });
  // Cache for later display
  await persistLcdCheck(c.env.DB, result, {
    orderId: body.orderId,
    userId: user.id,
    icd10List: body.icd10List,
  });
  return c.json(result);
});

// ─── GET /documents ───────────────────────────────────────────────────────
app.get('/documents', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(lcdDocuments).where(eq(lcdDocuments.isActive, 1));
  return c.json({ items: rows });
});

// ─── GET /required-findings/:hcpc ─────────────────────────────────────────
// Returns the structured CLINICAL_FINDING_THRESHOLD criteria for an HCPC so
// the wizard knows which numeric inputs to render.
app.get('/required-findings/:hcpc', async (c) => {
  const db = getDb(c.env.DB);
  const { hcpc } = c.req.param();
  const rows = await db
    .select()
    .from(lcdCoverageCriteria)
    .where(eq(lcdCoverageCriteria.hcpcCode, hcpc.toUpperCase()));
  const findings = rows
    .filter((r: any) => r.criterionType === 'CLINICAL_FINDING_THRESHOLD' && r.findingName)
    .map((r: any) => ({
      findingName: r.findingName,
      operator: r.findingOperator,
      threshold: r.findingThreshold,
      threshold2: r.findingThreshold2,
      unit: r.findingUnit,
      description: r.description,
      citation: r.citation,
    }));
  return c.json({ hcpcCode: hcpc.toUpperCase(), findings });
});

// ─── GET /check-history/order/:orderId ────────────────────────────────────
// Cached coverage check results for an order (most recent first).
app.get('/check-history/order/:orderId', async (c) => {
  const db = getDb(c.env.DB);
  const { orderId } = c.req.param();
  const rows = await db
    .select()
    .from(lcdCheckResults)
    .where(eq(lcdCheckResults.orderId, orderId))
    .orderBy(desc(lcdCheckResults.checkedAt))
    .limit(100);
  return c.json({ items: rows });
});

// ─── GET /documents/:id/criteria ──────────────────────────────────────────
app.get('/documents/:id/criteria', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db
    .select()
    .from(lcdCoverageCriteria)
    .where(eq(lcdCoverageCriteria.lcdDocumentId, id));
  return c.json({ items: rows });
});

// ─── POST /fetch-from-cms ─────────────────────────────────────────────────
// Admin scrapes a single LCD from cms.gov MCD into our structured format.
// Returns the parsed payload WITHOUT persisting — admin can edit then call /ingest.
// Body: { lcdId: "L33718" or "33718", autoIngest?: boolean }
app.post('/fetch-from-cms', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const body = (await c.req.json()) as { lcdId?: string; autoIngest?: boolean };
  if (!body.lcdId?.trim()) throw new ValidationError('lcdId required');
  let scraped;
  try {
    scraped = await fetchAndParseLcd(body.lcdId.trim());
  } catch (err: any) {
    throw new ValidationError(`Scrape failed: ${err?.message ?? 'unknown'}`);
  }
  if (body.autoIngest) {
    // Coerce scraper's `string | null` optionals to `string | undefined` for
    // ingestLcdJson's stricter shape. Null and undefined are semantically the
    // same here ("not provided").
    const forIngest = {
      ...scraped,
      contractor: scraped.contractor ?? undefined,
      jurisdiction: scraped.jurisdiction ?? undefined,
      effectiveDate: scraped.effectiveDate ?? undefined,
      revisionDate: scraped.revisionDate ?? undefined,
      sourceUrl: scraped.sourceUrl ?? undefined,
      summary: scraped.summary ?? undefined,
    };
    const r = await ingestLcdJson(c.env.DB, [forIngest]);
    return c.json({ scraped, ingested: r });
  }
  return c.json({ scraped, ingested: null });
});

// ─── POST /ingest ─────────────────────────────────────────────────────────
app.post('/ingest', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const body = (await c.req.json()) as any;
  if (!Array.isArray(body.documents)) throw new ValidationError('documents[] required');
  const r = await ingestLcdJson(c.env.DB, body.documents);
  return c.json(r);
});

// ─── POST /ingest-csv ─────────────────────────────────────────────────────
// Admin-friendlier ingest. Accepts a CSV in the body (`csv` field) with one
// criterion per row. Required headers:
//   lcd_id, lcd_kind, lcd_title, hcpc_code, criterion_type, description
// Optional headers:
//   contractor, jurisdiction, effective_date, source_url, icd10_codes
//   (pipe-separated, e.g. "G47.33|G47.30"), required_finding, citation,
//   is_mandatory (1/0)
//
// Rows are grouped by lcd_id; existing LCD + criteria for that lcd_id are
// replaced (idempotent).
app.post('/ingest-csv', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const body = (await c.req.json()) as { csv?: string };
  if (!body.csv?.trim()) throw new ValidationError('csv (string) required');

  // Tiny CSV parser — quoted fields supported, commas inside quotes preserved.
  const parseCsv = (txt: string): Record<string, string>[] => {
    const rows: string[][] = [];
    let cur: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (inQ) {
        if (ch === '"' && txt[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') inQ = false;
        else field += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { cur.push(field); field = ''; }
        else if (ch === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; }
        else if (ch === '\r') { /* skip */ }
        else field += ch;
      }
    }
    if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== '')).map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = (r[i] ?? '').trim()));
      return obj;
    });
  };

  const rows = parseCsv(body.csv);
  if (rows.length === 0) throw new ValidationError('CSV has no data rows');

  // Group by lcd_id
  const byLcd = new Map<string, { meta: any; criteria: any[] }>();
  for (const r of rows) {
    if (!r.lcd_id || !r.hcpc_code || !r.criterion_type || !r.description) continue;
    if (!byLcd.has(r.lcd_id)) {
      byLcd.set(r.lcd_id, {
        meta: {
          id: r.lcd_id,
          kind: r.lcd_kind || 'LCD',
          title: r.lcd_title || r.lcd_id,
          contractor: r.contractor || undefined,
          jurisdiction: r.jurisdiction || undefined,
          effectiveDate: r.effective_date || undefined,
          sourceUrl: r.source_url || undefined,
        },
        criteria: [],
      });
    }
    byLcd.get(r.lcd_id)!.criteria.push({
      hcpcCode: r.hcpc_code,
      criterionType: r.criterion_type,
      icd10Codes: r.icd10_codes ? r.icd10_codes.split('|').map((s) => s.trim()).filter(Boolean) : undefined,
      requiredFinding: r.required_finding || undefined,
      description: r.description,
      citation: r.citation || undefined,
      isMandatory: r.is_mandatory ? r.is_mandatory !== '0' && r.is_mandatory.toLowerCase() !== 'false' : true,
    });
  }

  const documents = Array.from(byLcd.values()).map(({ meta, criteria }) => ({ ...meta, criteria }));
  const result = await ingestLcdJson(c.env.DB, documents);
  return c.json({ ...result, parsedRows: rows.length });
});

// ─── GET /pa-required ─────────────────────────────────────────────────────
app.get('/pa-required', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(cmsPaRequiredHcpcs)
    .where(eq(cmsPaRequiredHcpcs.isActive, 1));
  return c.json({ items: rows });
});

// ─── GET /pa-required/:hcpc ───────────────────────────────────────────────
app.get('/pa-required/:hcpc', async (c) => {
  const db = getDb(c.env.DB);
  const { hcpc } = c.req.param();
  const [row] = await db
    .select()
    .from(cmsPaRequiredHcpcs)
    .where(eq(cmsPaRequiredHcpcs.hcpcCode, hcpc.toUpperCase()))
    .limit(1);
  return c.json({ hcpcCode: hcpc.toUpperCase(), required: !!row && row.isActive === 1, info: row ?? null });
});

// ─── POST /pa-required ────────────────────────────────────────────────────
app.post('/pa-required', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as any;
  if (!body.hcpcCode?.trim()) throw new ValidationError('hcpcCode required');
  const code = body.hcpcCode.trim().toUpperCase();
  try {
    await db.insert(cmsPaRequiredHcpcs).values({
      hcpcCode: code,
      description: body.description ?? null,
      effectiveDate: body.effectiveDate ?? null,
      sourceUrl: body.sourceUrl ?? null,
      notes: body.notes ?? null,
      isActive: 1,
      addedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      // Update instead
      await db
        .update(cmsPaRequiredHcpcs)
        .set({
          description: body.description ?? null,
          effectiveDate: body.effectiveDate ?? null,
          sourceUrl: body.sourceUrl ?? null,
          notes: body.notes ?? null,
          isActive: 1,
        })
        .where(eq(cmsPaRequiredHcpcs.hcpcCode, code));
    } else {
      throw err;
    }
  }
  return c.json({ hcpcCode: code }, 201);
});

// ─── DELETE /pa-required/:hcpc ────────────────────────────────────────────
app.delete('/pa-required/:hcpc', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { hcpc } = c.req.param();
  await db
    .update(cmsPaRequiredHcpcs)
    .set({ isActive: 0 })
    .where(eq(cmsPaRequiredHcpcs.hcpcCode, hcpc.toUpperCase()));
  return c.json({ hcpcCode: hcpc.toUpperCase(), deactivated: true });
});

export default app;
