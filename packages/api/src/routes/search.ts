/**
 * Combined search across orders + SKUs + contracts.
 *
 *   GET /search?q=&types=orders,skus,contracts&limit=&offset=
 *
 * V1 uses indexed LIKE patterns on key text columns. Future enhancement:
 * D1 FTS5 virtual tables with triggers (would require migration + sync logic).
 *
 * Results are grouped by entity type. Tenant scoping is applied per-type.
 */
import { Hono } from 'hono';
import { eq, and, like, or, sql, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  orders,
  vendorItemSkus,
  contracts,
  hospitalVendors,
  vendors,
  hospitals,
} from '@curavend/db';
import { ValidationError } from '../lib/errors';
import { logPhiAccess } from '../services/phiAuditService';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

interface SearchGroup {
  type: 'orders' | 'skus' | 'contracts';
  results: any[];
  total: number;
}

// The search term can be a patient name (PHI), which must NOT travel in a URL
// query string (leaks to access logs, browser history, referrer headers).
// The handler is registered on POST (preferred, term in JSON body) and GET
// (kept for backward compatibility). The frontend uses POST.
const searchHandler = async (c: any) => {
  const user = c.get('user') as AuthUser;
  let body: any = {};
  if (c.req.method === 'POST') {
    body = await c.req.json().catch(() => ({}));
  }
  const q = (body.q as string | undefined) ?? c.req.query('q');
  const typesParam =
    (body.types as string | undefined) ?? c.req.query('types') ?? 'orders,skus,contracts';
  const limit = Math.min(parseInt(String(body.limit ?? c.req.query('limit') ?? '20')), 50);
  if (!q || q.trim().length < 2) {
    throw new ValidationError('q must be at least 2 characters');
  }
  const pattern = `%${q.trim()}%`;
  const wantedTypes = new Set(String(typesParam).split(',').map((t: string) => t.trim()));
  const db = getDb(c.env.DB);
  const groups: SearchGroup[] = [];

  // ── Orders ─────────────────────────────────────────────────────────────
  if (wantedTypes.has('orders')) {
    const conditions: any[] = [
      or(
        like(orders.identifier, pattern),
        like(orders.patientName, pattern),
        like(orders.patientLastName, pattern),
        like(orders.comment, pattern),
      ),
    ];
    if (user.userType === 'HOSPITAL' && user.hospitalId) {
      conditions.push(eq(orders.hospitalId, user.hospitalId));
    } else if (user.userType === 'VENDOR' && user.vendorId) {
      conditions.push(eq(orders.vendorId, user.vendorId));
    } else if (user.userType === 'PROVIDER' && user.providerId) {
      conditions.push(eq(orders.providerId, user.providerId));
    } else if (user.userType !== 'ADMIN') {
      conditions.push(sql`1 = 0`);
    }
    const ordersRows = await db
      .select({
        id: orders.id,
        identifier: orders.identifier,
        patientName: orders.patientName,
        patientLastName: orders.patientLastName,
        status: orders.status,
        orderSubStatus: orders.orderSubStatus,
        hospitalId: orders.hospitalId,
        vendorId: orders.vendorId,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(...conditions))
      .limit(limit);
    groups.push({ type: 'orders', results: ordersRows, total: ordersRows.length });
  }

  // ── SKUs ───────────────────────────────────────────────────────────────
  if (wantedTypes.has('skus')) {
    const conditions: any[] = [
      eq(vendorItemSkus.isActive, 1),
      or(
        like(vendorItemSkus.hcpcCode, pattern),
        like(vendorItemSkus.vendorSku, pattern),
        like(vendorItemSkus.description, pattern),
        like(vendorItemSkus.manufacturerName, pattern),
        like(vendorItemSkus.tagline, pattern),
      ),
    ];
    // Tenant scope: hospitals can see SKUs from their contracted vendors
    if (user.userType === 'HOSPITAL' && user.hospitalId) {
      const hv = await db
        .select({ vendorId: hospitalVendors.vendorId })
        .from(hospitalVendors)
        .where(eq(hospitalVendors.hospitalId, user.hospitalId));
      const vids = hv.map((r) => r.vendorId).filter((v): v is string => !!v);
      if (vids.length === 0) {
        groups.push({ type: 'skus', results: [], total: 0 });
      } else {
        conditions.push(inArray(vendorItemSkus.vendorId, vids));
      }
    } else if (user.userType === 'VENDOR' && user.vendorId) {
      conditions.push(eq(vendorItemSkus.vendorId, user.vendorId));
    } else if (user.userType !== 'ADMIN') {
      conditions.push(sql`1 = 0`);
    }
    if (!(user.userType === 'HOSPITAL' && (await db.select({ count: sql<number>`count(*)` }).from(hospitalVendors).where(eq(hospitalVendors.hospitalId, user.hospitalId ?? '')))[0]?.count === 0)) {
      const skuRows = await db
        .select({
          id: vendorItemSkus.id,
          vendorId: vendorItemSkus.vendorId,
          hcpcCode: vendorItemSkus.hcpcCode,
          vendorSku: vendorItemSkus.vendorSku,
          description: vendorItemSkus.description,
          tagline: vendorItemSkus.tagline,
          imageUrl: vendorItemSkus.imageUrl,
          listPriceCents: vendorItemSkus.listPriceCents,
          vendorName: vendors.name,
        })
        .from(vendorItemSkus)
        .leftJoin(vendors, eq(vendorItemSkus.vendorId, vendors.id))
        .where(and(...conditions))
        .limit(limit);
      groups.push({ type: 'skus', results: skuRows, total: skuRows.length });
    }
  }

  // ── Contracts ──────────────────────────────────────────────────────────
  if (wantedTypes.has('contracts')) {
    const conditions: any[] = [
      or(like(contracts.name, pattern), like(contracts.id, pattern)),
    ];
    if (user.userType === 'HOSPITAL' && user.hospitalId) {
      conditions.push(eq(contracts.hospitalId, user.hospitalId));
    } else if (user.userType === 'VENDOR' && user.vendorId) {
      conditions.push(eq(contracts.vendorId, user.vendorId));
    } else if (user.userType !== 'ADMIN') {
      conditions.push(sql`1 = 0`);
    }
    const contractRows = await db
      .select({
        id: contracts.id,
        name: contracts.name,
        status: contracts.status,
        hospitalId: contracts.hospitalId,
        vendorId: contracts.vendorId,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        vendorName: vendors.name,
        hospitalName: hospitals.name,
      })
      .from(contracts)
      .leftJoin(vendors, eq(contracts.vendorId, vendors.id))
      .leftJoin(hospitals, eq(contracts.hospitalId, hospitals.id))
      .where(and(...conditions))
      .limit(limit);
    groups.push({ type: 'contracts', results: contractRows, total: contractRows.length });
  }

  const total = groups.reduce((s, g) => s + g.total, 0);
  await logPhiAccess(c.env, {
    userId: user.id,
    userEmail: user.email,
    userType: user.userType,
    resourceType: 'SEARCH',
    resourceId: 'patient-search',
    action: 'SEARCH',
    ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? undefined,
    userAgent: c.req.header('User-Agent') ?? undefined,
  });
  return c.json({ q: q.trim(), groups, total });
};

// POST (preferred — keeps PHI search terms out of the URL) + GET (compat).
app.post('/', searchHandler);
app.get('/', searchHandler);

// ─── Advanced search (Medzah-style DSL) ────────────────────────────────────

import {
  buildFilterClause,
  buildSortClause,
  buildPagedResponse,
  parsePagination,
  type SearchInput,
  type FieldMap,
} from '../lib/advancedSearch';
import { count } from 'drizzle-orm';

const ORDER_FIELDS: FieldMap = {
  id: orders.id,
  identifier: orders.identifier,
  status: orders.status,
  orderSubStatus: orders.orderSubStatus,
  vendorId: orders.vendorId,
  hospitalId: orders.hospitalId,
  patientName: orders.patientName,
  patientLastName: orders.patientLastName,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
};

app.post('/advanced', async (c) => {
  const user = c.get('user') as any;
  const body = (await c.req.json()) as { entity?: string } & SearchInput;
  const entity = body.entity ?? 'orders';
  if (entity !== 'orders') {
    throw new ValidationError(`Unsupported entity '${entity}' (only 'orders' in v1)`);
  }
  const db = getDb(c.env.DB);
  const { pageNumber, pageSize, offset } = parsePagination(body);
  // Tenant scoping
  const scopeFilters: any[] = [];
  if (user.userType === 'HOSPITAL' && user.hospitalId) scopeFilters.push(eq(orders.hospitalId, user.hospitalId));
  if (user.userType === 'VENDOR' && user.vendorId) scopeFilters.push(eq(orders.vendorId, user.vendorId));
  if (user.userType === 'PROVIDER' && user.providerId) scopeFilters.push(eq(orders.providerId, user.providerId));
  const userFilter = buildFilterClause(ORDER_FIELDS, body.filters ?? []);
  const combined = scopeFilters.length || userFilter
    ? and(...scopeFilters, ...(userFilter ? [userFilter] : []))
    : undefined;
  const sortClauses = buildSortClause(ORDER_FIELDS, body.sort ?? []);
  const totalRes = await db.select({ c: count() }).from(orders).where(combined as any);
  const total = Number(totalRes[0]?.c ?? 0);
  let q = db.select().from(orders).where(combined as any);
  if (sortClauses.length) q = q.orderBy(...sortClauses) as typeof q;
  const rows = await q.limit(pageSize).offset(offset);
  return c.json(buildPagedResponse(rows, total, pageNumber, pageSize));
});

export default app;
