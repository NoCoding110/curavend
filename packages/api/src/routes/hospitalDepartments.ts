import { Hono } from 'hono';
import { eq, and, like, asc, desc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { hospitalDepartments, hospitalFacilities } from '@curavend/db';
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

// GET /hospital-departments
const DEPARTMENT_SORT_COLUMNS: Record<string, any> = {
  name: hospitalDepartments.name,
  number: hospitalDepartments.number,
  facilityName: hospitalFacilities.name,
  status: hospitalDepartments.status,
  createdAt: hospitalDepartments.createdAt,
};

app.get('/', requirePermission('departments', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const {
    hospitalId: qHospitalId,
    facilityId,
    search,
    limit: limitStr,
    offset: offsetStr,
    sortBy,
    sortOrder,
  } = c.req.query();

  const hospitalId = getHospitalScope(user, qHospitalId);
  const conditions: any[] = [eq(hospitalDepartments.hospitalId, hospitalId)];
  if (facilityId) conditions.push(eq(hospitalDepartments.facilityId, facilityId));
  if (search) conditions.push(like(hospitalDepartments.name, `%${search}%`));

  const limit = Math.min(parseInt(limitStr || '100', 10) || 100, 200);
  const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

  const sortCol = (sortBy && DEPARTMENT_SORT_COLUMNS[sortBy]) || hospitalDepartments.name;
  const orderFn = sortOrder === 'desc' ? desc : asc;

  const whereClause = and(...conditions);

  const [results, countResult] = await Promise.all([
    db
      .select({
        id: hospitalDepartments.id,
        hospitalId: hospitalDepartments.hospitalId,
        facilityId: hospitalDepartments.facilityId,
        name: hospitalDepartments.name,
        number: hospitalDepartments.number,
        status: hospitalDepartments.status,
        createdAt: hospitalDepartments.createdAt,
        updatedAt: hospitalDepartments.updatedAt,
        facilityName: hospitalFacilities.name,
      })
      .from(hospitalDepartments)
      .leftJoin(hospitalFacilities, eq(hospitalDepartments.facilityId, hospitalFacilities.id))
      .where(whereClause)
      .orderBy(orderFn(sortCol))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(hospitalDepartments)
      .where(whereClause),
  ]);

  return c.json({ items: results, total: countResult[0]?.count ?? 0 });
});

// GET /hospital-departments/:id
app.get('/:id', requirePermission('departments', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const row = await db.select().from(hospitalDepartments).where(eq(hospitalDepartments.id, id)).limit(1);
  if (!row.length) throw new NotFoundError('Department not found');

  return c.json(row[0]);
});

// POST /hospital-departments
app.post('/', requirePermission('departments', 'WRITE'), async (c) => {
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

  await db.insert(hospitalDepartments).values({
    id,
    hospitalId,
    facilityId: body.facilityId || null,
    name: body.name,
    number: body.number || null,
    status: body.status || 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  const result = await db.select().from(hospitalDepartments).where(eq(hospitalDepartments.id, id)).limit(1);
  return c.json(result[0], 201);
});

// PUT /hospital-departments/:id
app.put('/:id', requirePermission('departments', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db.select().from(hospitalDepartments).where(eq(hospitalDepartments.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Department not found');

  const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.number !== undefined) updateData.number = body.number;
  if (body.facilityId !== undefined) updateData.facilityId = body.facilityId;
  if (body.status !== undefined) updateData.status = body.status;

  await db.update(hospitalDepartments).set(updateData).where(eq(hospitalDepartments.id, id));

  const result = await db.select().from(hospitalDepartments).where(eq(hospitalDepartments.id, id)).limit(1);
  return c.json(result[0]);
});

// DELETE /hospital-departments/:id — soft delete
app.delete('/:id', requirePermission('departments', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const existing = await db.select().from(hospitalDepartments).where(eq(hospitalDepartments.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Department not found');

  await db.update(hospitalDepartments).set({ status: 'INACTIVE', updatedAt: new Date().toISOString() }).where(eq(hospitalDepartments.id, id));

  return c.json({ success: true });
});

export default app;
