/**
 * /api/item-master-hygiene — formulary data quality reports.
 *
 *   GET /duplicates   — find likely duplicates by (hcpcCode, normalized desc)
 *   GET /missing      — items with missing required fields
 *   GET /unmapped     — items not linked to a vendor SKU (no purchase path)
 *
 * Hospital-scoped; admin can pass ?hospitalId.
 */
import { Hono } from 'hono';
import { and, desc, eq, sql, isNull, or } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { formularyItems, vendorItemSkus } from '@curavend/db';
import { ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdmin(u: AuthUser) {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}
function scopeHospital(c: any): string {
  const u = c.get('user') as AuthUser;
  const id = isAdmin(u) ? c.req.query('hospitalId') ?? u.hospitalId : u.hospitalId;
  if (!id) throw new ForbiddenError('hospitalId required');
  return id;
}

// GET /duplicates — group by (hcpcCode + lower-cased trimmed description prefix).
// Surfaces groups with >1 row so the operator can decide which to keep.
app.get('/duplicates', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  // Raw SQL — drizzle's grouping ergonomics are heavy.
  const result = await (db as any).all(sql.raw(`
    SELECT
      hcpc_code,
      LOWER(SUBSTR(TRIM(COALESCE(description, '')), 1, 40)) AS desc_key,
      COUNT(*) AS row_count,
      GROUP_CONCAT(id) AS ids
    FROM formulary_items
    WHERE hospital_id = '${hospitalId.replace(/'/g, "''")}'
      AND status = 'ACTIVE'
    GROUP BY hcpc_code, desc_key
    HAVING row_count > 1
    ORDER BY row_count DESC
    LIMIT 200
  `));
  const groups = (result.results ?? []).map((r: any) => ({
    hcpcCode: r.hcpc_code,
    descKey: r.desc_key,
    rowCount: Number(r.row_count),
    ids: String(r.ids ?? '').split(','),
  }));
  return c.json({ items: groups, count: groups.length });
});

// GET /missing — items where required-for-procurement fields are null.
app.get('/missing', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  const rows = await db
    .select()
    .from(formularyItems)
    .where(
      and(
        eq(formularyItems.hospitalId, hospitalId),
        eq(formularyItems.status, 'ACTIVE'),
        or(
          isNull(formularyItems.hcpcCode),
          isNull(formularyItems.description),
          isNull(formularyItems.preferredVendorId),
        )!,
      ),
    )
    .limit(500);
  // Annotate with which fields are missing — easier triage in UI.
  const annotated = rows.map((r: any) => ({
    ...r,
    missingFields: [
      !r.hcpcCode && 'hcpcCode',
      !r.description && 'description',
      !r.preferredVendorId && 'preferredVendorId',
    ].filter(Boolean) as string[],
  }));
  return c.json({ items: annotated, count: annotated.length });
});

// GET /unmapped — formulary items with no vendor_item_skus row at any vendor.
// These can't be purchased through any normal flow.
app.get('/unmapped', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const hospitalId = scopeHospital(c);
  // Raw SQL because the LEFT JOIN + IS NULL pattern is clearer than drizzle.
  const result = await (db as any).all(sql.raw(`
    SELECT fi.id, fi.hcpc_code, fi.description, fi.preferred_vendor_id,
           fi.facility_id, fi.created_at
    FROM formulary_items fi
    LEFT JOIN vendor_item_skus vis ON vis.hcpc_code = fi.hcpc_code
    WHERE fi.hospital_id = '${hospitalId.replace(/'/g, "''")}'
      AND fi.status = 'ACTIVE'
      AND vis.id IS NULL
    LIMIT 500
  `));
  return c.json({
    items: result.results ?? [],
    count: (result.results ?? []).length,
  });
});

export default app;
