import { Hono } from 'hono';
import { eq, and, like, asc, desc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { hospitalFacilities } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function getHospitalScope(user: any, queryHospitalId?: string): string {
  if (user.userType === 'HOSPITAL' && user.hospitalId) return user.hospitalId;
  if (user.userType === 'ADMIN' && queryHospitalId) return queryHospitalId;
  if (user.providerId && queryHospitalId) return queryHospitalId;
  throw new ForbiddenError('Hospital scope required');
}

// GET /hospital-facilities
const FACILITY_SORT_COLUMNS: Record<string, any> = {
  name: hospitalFacilities.name,
  number: hospitalFacilities.number,
  city: hospitalFacilities.city,
  state: hospitalFacilities.state,
  status: hospitalFacilities.status,
  createdAt: hospitalFacilities.createdAt,
};

app.get('/', requirePermission('facilities', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const {
    hospitalId: qHospitalId,
    search,
    limit: limitStr,
    offset: offsetStr,
    sortBy,
    sortOrder,
  } = c.req.query();

  const hospitalId = getHospitalScope(user, qHospitalId);
  const conditions: any[] = [eq(hospitalFacilities.hospitalId, hospitalId)];
  if (search) conditions.push(like(hospitalFacilities.name, `%${search}%`));

  const limit = Math.min(parseInt(limitStr || '100', 10) || 100, 200);
  const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

  const sortCol = (sortBy && FACILITY_SORT_COLUMNS[sortBy]) || hospitalFacilities.name;
  const orderFn = sortOrder === 'desc' ? desc : asc;

  const whereClause = and(...conditions);

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(hospitalFacilities)
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(hospitalFacilities)
      .where(whereClause),
  ]);

  return c.json({ items: results, total: countResult[0]?.count ?? 0 });
});

// GET /hospital-facilities/:id
app.get('/:id', requirePermission('facilities', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const row = await db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, id)).limit(1);
  if (!row.length) throw new NotFoundError('Facility not found');

  return c.json(row[0]);
});

// POST /hospital-facilities
app.post('/', requirePermission('facilities', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.name) throw new ValidationError('Name is required');

  const hospitalId = user.userType === 'HOSPITAL' && user.hospitalId
    ? user.hospitalId
    : body.hospitalId;
  if (!hospitalId) throw new ValidationError('Hospital ID is required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(hospitalFacilities).values({
    id,
    hospitalId,
    name: body.name,
    number: body.number || null,
    streetAddress: body.streetAddress || null,
    city: body.city || null,
    state: body.state || null,
    zip: body.zip || null,
    phone: body.phone || null,
    status: body.status || 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  const result = await db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, id)).limit(1);
  return c.json(result[0], 201);
});

// PUT /hospital-facilities/:id
app.put('/:id', requirePermission('facilities', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Facility not found');

  const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.number !== undefined) updateData.number = body.number;
  if (body.streetAddress !== undefined) updateData.streetAddress = body.streetAddress;
  if (body.city !== undefined) updateData.city = body.city;
  if (body.state !== undefined) updateData.state = body.state;
  if (body.zip !== undefined) updateData.zip = body.zip;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.status !== undefined) updateData.status = body.status;

  await db.update(hospitalFacilities).set(updateData).where(eq(hospitalFacilities.id, id));

  const result = await db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, id)).limit(1);
  return c.json(result[0]);
});

// DELETE /hospital-facilities/:id — soft delete
app.delete('/:id', requirePermission('facilities', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const existing = await db.select().from(hospitalFacilities).where(eq(hospitalFacilities.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Facility not found');

  await db.update(hospitalFacilities).set({ status: 'INACTIVE', updatedAt: new Date().toISOString() }).where(eq(hospitalFacilities.id, id));

  return c.json({ success: true });
});

export default app;
