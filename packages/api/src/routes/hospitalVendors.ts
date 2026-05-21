import { Hono } from 'hono';
import { eq, and, like, or, asc, desc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { hospitalVendors, hospitals, vendors, hospitalFacilities } from '@curavend/db';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors';
import type { Env } from '../lib/env';

// Normalize an item-categories input into a JSON string (or NULL).
function normalizeCategories(input: unknown): string | null {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const clean = input
      .map((x) => String(x).trim().toUpperCase())
      .filter(Boolean);
    return clean.length > 0 ? JSON.stringify(clean) : null;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeCategories(parsed);
    } catch {
      /* fall through */
    }
    return normalizeCategories(trimmed.split(',').map((s) => s.trim()));
  }
  return null;
}

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

const SORT_COLUMNS: Record<string, any> = {
  vendorName: vendors.name,
  hospitalName: hospitals.name,
  contractRate: hospitalVendors.contractRate,
  status: hospitalVendors.state,
  createdAt: hospitalVendors.createdAt,
};

// GET /hospital-vendors - List hospital-vendor relationships
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const {
    hospitalId: queryHospitalId,
    vendorId: queryVendorId,
    search,
    status,
    limit = '50',
    offset = '0',
    sortBy,
    sortOrder,
  } = c.req.query();

  const conditions: any[] = [];

  // Scope by user role
  if (user.userType === 'HOSPITAL' && user.hospitalId) {
    conditions.push(eq(hospitalVendors.hospitalId, user.hospitalId));
  } else if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(hospitalVendors.vendorId, user.vendorId));
  }

  if (queryHospitalId && user.userType !== 'HOSPITAL') {
    conditions.push(eq(hospitalVendors.hospitalId, queryHospitalId));
  }
  if (queryVendorId && user.userType !== 'VENDOR') {
    conditions.push(eq(hospitalVendors.vendorId, queryVendorId));
  }
  if (status) {
    conditions.push(eq(hospitalVendors.state, status));
  }
  if (search) {
    conditions.push(
      or(
        like(vendors.name, `%${search}%`),
        like(hospitals.name, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const sortCol = (sortBy && SORT_COLUMNS[sortBy]) || hospitalVendors.createdAt;
  const orderFn = sortOrder === 'asc' ? asc : desc;
  const lim = Math.min(parseInt(limit) || 50, 200);
  const off = Math.max(parseInt(offset) || 0, 0);

  const [results, countResult] = await Promise.all([
    db
      .select({
        id: hospitalVendors.id,
        hospitalId: hospitalVendors.hospitalId,
        vendorId: hospitalVendors.vendorId,
        providerId: hospitalVendors.providerId,
        facilityId: hospitalVendors.facilityId,
        facilityName: hospitalFacilities.name,
        priority: hospitalVendors.priority,
        itemCategories: hospitalVendors.itemCategories,
        hospitalName: hospitals.name,
        vendorName: vendors.name,
        status: hospitalVendors.state,
        contractRate: hospitalVendors.contractRate,
        customFeeScheduleId: hospitalVendors.customFeeScheduleId,
        consignmentClosetId: hospitalVendors.consignmentClosetId,
        contractId: hospitalVendors.contractId,
        createdAt: hospitalVendors.createdAt,
        updatedAt: hospitalVendors.updatedAt,
      })
      .from(hospitalVendors)
      .leftJoin(hospitals, eq(hospitalVendors.hospitalId, hospitals.id))
      .leftJoin(vendors, eq(hospitalVendors.vendorId, vendors.id))
      .leftJoin(
        hospitalFacilities,
        eq(hospitalVendors.facilityId, hospitalFacilities.id),
      )
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(lim)
      .offset(off),
    db
      .select({ count: sql<number>`count(*)` })
      .from(hospitalVendors)
      .leftJoin(hospitals, eq(hospitalVendors.hospitalId, hospitals.id))
      .leftJoin(vendors, eq(hospitalVendors.vendorId, vendors.id))
      .where(whereClause),
  ]);

  // Parse stored JSON arrays for the client
  const normalized = results.map((r: any) => ({
    ...r,
    itemCategories: (() => {
      if (!r.itemCategories) return null;
      try {
        const parsed = JSON.parse(r.itemCategories);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })(),
  }));

  return c.json({ items: normalized, total: countResult[0]?.count ?? 0 });
});

// POST /hospital-vendors - Create a new hospital-vendor relationship
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();

  if (!body.hospitalId) throw new ValidationError('Hospital ID is required');
  if (!body.vendorId) throw new ValidationError('Vendor ID is required');
  if (!body.providerId) throw new ValidationError('Provider ID is required');

  const facilityId: string | null = body.facilityId || null;
  const itemCategoriesJson = normalizeCategories(body.itemCategories);

  // New-shape uniqueness: (hospital, vendor, facility, itemCategories).
  // Use COALESCE in SQL so NULLs collapse into a single slot.
  const dupCheck: any = await db.run(sql`
    SELECT id FROM hospital_vendors
    WHERE hospital_id = ${body.hospitalId}
      AND vendor_id   = ${body.vendorId}
      AND COALESCE(facility_id, '')     = ${facilityId ?? ''}
      AND COALESCE(item_categories, '') = ${itemCategoriesJson ?? ''}
    LIMIT 1
  `);
  const dupRow = dupCheck.results?.[0] ?? dupCheck[0];
  if (dupRow) {
    throw new ConflictError(
      'A preference with this (hospital, vendor, facility, categories) scope already exists',
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(hospitalVendors).values({
    id,
    hospitalId: body.hospitalId,
    vendorId: body.vendorId,
    providerId: body.providerId,
    facilityId,
    priority:
      body.priority === undefined || body.priority === null
        ? 100
        : Number(body.priority),
    itemCategories: itemCategoriesJson,
    state: body.state || 'Active',
    contractRate: body.contractRate ?? null,
    customFeeScheduleId: body.customFeeScheduleId || null,
    consignmentClosetId: body.consignmentClosetId || null,
    contractId: body.contractId || null,
    createdAt: now,
    updatedAt: now,
  });

  const result = await db
    .select()
    .from(hospitalVendors)
    .where(eq(hospitalVendors.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// GET /hospital-vendors/:id
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const relationship = await db
    .select()
    .from(hospitalVendors)
    .where(eq(hospitalVendors.id, id))
    .limit(1);

  if (!relationship.length) throw new NotFoundError('Hospital-vendor relationship not found');
  return c.json(relationship[0]);
});

// PUT /hospital-vendors/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(hospitalVendors)
    .where(eq(hospitalVendors.id, id))
    .limit(1);

  if (!existing.length) throw new NotFoundError('Hospital-vendor relationship not found');

  const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.contractRate !== undefined) updateData.contractRate = body.contractRate;
  if (body.customFeeScheduleId !== undefined) updateData.customFeeScheduleId = body.customFeeScheduleId;
  if (body.consignmentClosetId !== undefined) updateData.consignmentClosetId = body.consignmentClosetId;
  if (body.state !== undefined) updateData.state = body.state;
  if (body.contractId !== undefined) updateData.contractId = body.contractId;
  if (body.facilityId !== undefined) updateData.facilityId = body.facilityId || null;
  if (body.priority !== undefined)
    updateData.priority = Number(body.priority) || 100;
  if (body.itemCategories !== undefined)
    updateData.itemCategories = normalizeCategories(body.itemCategories);

  await db.update(hospitalVendors).set(updateData).where(eq(hospitalVendors.id, id));

  const result = await db.select().from(hospitalVendors).where(eq(hospitalVendors.id, id)).limit(1);
  return c.json(result[0]);
});

// DELETE /hospital-vendors/:id
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const existing = await db
    .select()
    .from(hospitalVendors)
    .where(eq(hospitalVendors.id, id))
    .limit(1);

  if (!existing.length) throw new NotFoundError('Hospital-vendor relationship not found');

  await db.delete(hospitalVendors).where(eq(hospitalVendors.id, id));
  return c.json({ success: true });
});

export default app;
