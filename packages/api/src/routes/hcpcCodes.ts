import { Hono } from 'hono';
import { eq, and, like, or, sql, notInArray, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { hcpcCodes, inventory, inventoryItems } from '@curavend/db';
import { rbac } from '../middleware/rbac';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /hcpc-codes — Search codes with optional vendor overlay
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const { search, category, status, vendorId, limit: limitStr } = c.req.query();

  const limit = Math.min(parseInt(limitStr || '20', 10) || 20, 50);
  const statusFilter = status || 'ACTIVE';

  const items: any[] = [];
  const vendorCodes: string[] = [];

  // If vendorId provided, search vendor inventory first
  if (vendorId && search && search.length >= 2) {
    const searchPattern = `%${search}%`;
    const vendorResults = await db
      .select({
        code: inventoryItems.hcpcCode,
        description: inventoryItems.description,
        manufacturerName: inventoryItems.manufacturerName,
        manufacturerItemNumber: inventoryItems.manufacturerItemNumber,
      })
      .from(inventoryItems)
      .innerJoin(inventory, eq(inventoryItems.inventoryId, inventory.id))
      .where(
        and(
          eq(inventory.vendorId, vendorId),
          or(
            like(inventoryItems.hcpcCode, searchPattern),
            like(inventoryItems.description, searchPattern)
          )
        )
      )
      .limit(limit);

    for (const row of vendorResults) {
      vendorCodes.push(row.code);
      items.push({
        code: row.code,
        description: row.description || '',
        longDescription: null,
        category: null,
        source: 'vendor',
        vendorProductInfo: {
          manufacturerName: row.manufacturerName,
          manufacturerItemNumber: row.manufacturerItemNumber,
        },
      });
    }
  }

  // Search reference table (excluding codes already returned from vendor)
  if (search && search.length >= 2) {
    const searchPattern = `%${search}%`;
    const remaining = limit - items.length;

    if (remaining > 0) {
      const conditions: any[] = [
        eq(hcpcCodes.status, statusFilter),
        or(
          like(hcpcCodes.code, searchPattern),
          like(hcpcCodes.shortDescription, searchPattern),
          like(hcpcCodes.longDescription, searchPattern)
        ),
      ];

      if (category) {
        conditions.push(eq(hcpcCodes.category, category));
      }

      if (vendorCodes.length > 0) {
        conditions.push(notInArray(hcpcCodes.code, vendorCodes));
      }

      const refResults = await db
        .select()
        .from(hcpcCodes)
        .where(and(...conditions))
        .limit(remaining);

      for (const row of refResults) {
        items.push({
          code: row.code,
          description: row.shortDescription,
          longDescription: row.longDescription,
          category: row.category,
          source: 'reference',
          vendorProductInfo: null,
        });
      }
    }
  }

  return c.json({ items });
});

/**
 * Map a HCPC code to its procurement category — drives wizard auto-routing.
 *
 * Returns one of:
 *   DME            — needs the DME wizard (F2F, DWO, LCD check, DMEPOS supplier)
 *   ORTHOTIC       — orthotics; rules similar to DME but a separate L-code bucket
 *   PROSTHETIC     — prosthetics; also a separate L-code bucket
 *   SUPPLY         — disposable medical supplies; standard supply wizard
 *   PHARMACY       — drugs / biologics; J-codes
 *   LAB            — lab tests / pathology; P-codes (or 8xxxx CPT)
 *   OTHER          — falls outside the procurement workflow buckets
 *
 * Resolution order:
 *   1. If we have a row in hcpc_codes with a non-null category that maps to
 *      one of the buckets above, use it.
 *   2. Otherwise fall back to the CMS prefix convention:
 *        E0000–E9999 → DME
 *        K0000–K9999 → DMEPOS (we treat as DME for wizard purposes)
 *        L0000–L4999 → ORTHOTIC
 *        L5000–L9999 → PROSTHETIC
 *        A4000–A8999 → SUPPLY (medical & surgical supplies)
 *        A9000–A9999 → SUPPLY (admin & misc supplies)
 *        B4000–B9999 → SUPPLY (enteral / parenteral therapy)
 *        J0000–J9999 → PHARMACY
 *        Q0000–Q9999 → SUPPLY (temporary/quarterly codes — usually supplies)
 *        P0000–P9999 → LAB
 *        S0000–S9999 → SUPPLY (most are supplies/services)
 *        anything else → OTHER
 */
type ProcurementCategory = 'DME' | 'ORTHOTIC' | 'PROSTHETIC' | 'SUPPLY' | 'PHARMACY' | 'LAB' | 'OTHER';

function categorizeByPrefix(code: string): ProcurementCategory {
  const c = code.trim().toUpperCase();
  if (!c) return 'OTHER';
  const letter = c[0];
  const num = parseInt(c.slice(1), 10);
  if (Number.isNaN(num)) return 'OTHER';

  if (letter === 'E') return 'DME';
  if (letter === 'K') return 'DME';
  if (letter === 'L') return num <= 4999 ? 'ORTHOTIC' : 'PROSTHETIC';
  if (letter === 'A') return 'SUPPLY';
  if (letter === 'B') return 'SUPPLY';
  if (letter === 'J') return 'PHARMACY';
  if (letter === 'P') return 'LAB';
  if (letter === 'Q') return 'SUPPLY';
  if (letter === 'S') return 'SUPPLY';
  return 'OTHER';
}

/**
 * POST /hcpc-codes/categorize
 * Body: { codes: string[] }
 * Returns: { items: Array<{ code, category, source: 'DB' | 'PREFIX' | 'UNKNOWN' }>,
 *            summary: { dme: n, supply: n, ... },
 *            recommendedWizard: 'DME' | 'SUPPLY' }
 *
 * Used by the create-order wizards to recommend (or warn about) the right
 * wizard based on what the user is actually ordering. If ANY line categorises
 * to DME, the recommendation is DME (stricter regulatory profile wins).
 */
app.post('/categorize', async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as { codes?: string[] };
  const inputCodes = Array.isArray(body.codes)
    ? body.codes.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : [];
  if (inputCodes.length === 0) {
    return c.json({ items: [], summary: {}, recommendedWizard: 'SUPPLY' });
  }

  // Single batched DB lookup — saves N round-trips on a 20-line order.
  const dbRows = await db
    .select({ code: hcpcCodes.code, category: hcpcCodes.category })
    .from(hcpcCodes)
    .where(inArray(hcpcCodes.code, inputCodes));
  const dbMap = new Map(dbRows.map((r) => [r.code, r.category]));

  const valid = new Set<ProcurementCategory>([
    'DME', 'ORTHOTIC', 'PROSTHETIC', 'SUPPLY', 'PHARMACY', 'LAB', 'OTHER',
  ]);
  const items = inputCodes.map((code) => {
    const dbCat = dbMap.get(code);
    if (dbCat && valid.has(dbCat as ProcurementCategory)) {
      return { code, category: dbCat as ProcurementCategory, source: 'DB' as const };
    }
    return { code, category: categorizeByPrefix(code), source: 'PREFIX' as const };
  });

  // Roll up counts + recommend the strictest wizard the order needs.
  const summary: Record<string, number> = {};
  for (const it of items) summary[it.category] = (summary[it.category] ?? 0) + 1;
  const anyDme = items.some((i) => i.category === 'DME' || i.category === 'ORTHOTIC' || i.category === 'PROSTHETIC');
  const recommendedWizard: 'DME' | 'SUPPLY' = anyDme ? 'DME' : 'SUPPLY';

  return c.json({ items, summary, recommendedWizard });
});

// GET /hcpc-codes/:code — Single code lookup
app.get('/:code', async (c) => {
  const db = getDb(c.env.DB);
  const { code } = c.req.param();

  const row = await db
    .select()
    .from(hcpcCodes)
    .where(eq(hcpcCodes.code, code.toUpperCase()))
    .limit(1);

  if (!row.length) throw new NotFoundError('HCPC code not found');

  return c.json(row[0]);
});

// POST /hcpc-codes/bulk — Admin bulk import
app.post('/bulk', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();

  if (!body.codes || !Array.isArray(body.codes) || body.codes.length === 0) {
    throw new ValidationError('codes array is required');
  }

  if (body.codes.length > 500) {
    throw new ValidationError('Maximum 500 codes per request');
  }

  let imported = 0;
  const now = new Date().toISOString();

  for (const item of body.codes) {
    if (!item.code || !item.shortDescription) continue;

    await db
      .insert(hcpcCodes)
      .values({
        code: item.code.toUpperCase(),
        shortDescription: item.shortDescription,
        longDescription: item.longDescription || null,
        category: item.category || null,
        effectiveDate: item.effectiveDate || null,
        terminationDate: item.terminationDate || null,
        status: item.status || 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: hcpcCodes.code,
        set: {
          shortDescription: item.shortDescription,
          longDescription: item.longDescription || null,
          category: item.category || null,
          effectiveDate: item.effectiveDate || null,
          terminationDate: item.terminationDate || null,
          status: item.status || 'ACTIVE',
          updatedAt: now,
        },
      });

    imported++;
  }

  return c.json({ success: true, imported });
});

export default app;
