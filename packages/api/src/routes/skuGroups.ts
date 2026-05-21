/**
 * SKU group management. Vendors define a group ("ProBrace Elite XYZ") with
 * shared marketing copy + documentation; each variant SKU points to it via
 * `vendor_item_skus.groupId`.
 */
import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { skuGroups, vendorItemSkus } from '@curavend/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function assertVendorScope(user: AuthUser, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  throw new ForbiddenError('You do not have write access to this vendor');
}

// GET /sku-groups — list (scoped)
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { vendorId, isActive, limit = '100', offset = '0' } = c.req.query();

  const conditions: any[] = [];
  if (vendorId) conditions.push(eq(skuGroups.vendorId, vendorId));
  if (user.userType !== 'ADMIN') {
    if (user.userType === 'VENDOR' && user.vendorId) {
      conditions.push(eq(skuGroups.vendorId, user.vendorId));
    } else if (user.userType !== 'HOSPITAL') {
      return c.json({ items: [], total: 0 });
    }
    // Hospital users can browse all active groups
  }
  if (isActive === 'true' || isActive === undefined) {
    conditions.push(eq(skuGroups.isActive, 1));
  } else if (isActive === 'false') {
    conditions.push(eq(skuGroups.isActive, 0));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, count] = await Promise.all([
    db
      .select()
      .from(skuGroups)
      .where(where)
      .orderBy(desc(skuGroups.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` }).from(skuGroups).where(where),
  ]);
  return c.json({ items, total: count[0]?.count ?? 0 });
});

// GET /sku-groups/:id — group + child SKUs
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();

  const rows = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('SKU group not found');

  const skus = await db.select().from(vendorItemSkus).where(eq(vendorItemSkus.groupId, id));
  return c.json({ ...rows[0], skus });
});

// POST /sku-groups — create
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  let vendorId: string = body.vendorId;
  if (user.userType !== 'ADMIN') {
    if (user.userType !== 'VENDOR' || !user.vendorId) {
      throw new ForbiddenError('Only vendor users or admins can create SKU groups');
    }
    vendorId = user.vendorId;
  }
  if (!vendorId) throw new ValidationError('vendorId is required');
  if (!body.groupName) throw new ValidationError('groupName is required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(skuGroups).values({
    id,
    vendorId,
    groupName: body.groupName,
    tagline: body.tagline ?? null,
    longDescription: body.longDescription ?? null,
    salientFeatures: body.salientFeatures ? JSON.stringify(body.salientFeatures) : null,
    brandManufacturer: body.brandManufacturer ?? null,
    coverImageUrl: body.coverImageUrl ?? null,
    datasheetUrl: body.datasheetUrl ?? null,
    ifuUrl: body.ifuUrl ?? null,
    msdsUrl: body.msdsUrl ?? null,
    brochureUrl: body.brochureUrl ?? null,
    videoUrl: body.videoUrl ?? null,
    categoryPath: body.categoryPath ? JSON.stringify(body.categoryPath) : null,
    variantAttributes: body.variantAttributes ? JSON.stringify(body.variantAttributes) : null,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });
  const created = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  return c.json(created[0], 201);
});

// PUT /sku-groups/:id — update
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const rows = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('SKU group not found');
  assertVendorScope(user, rows[0].vendorId);

  const update: any = { updatedAt: new Date().toISOString() };
  for (const k of ['groupName', 'tagline', 'longDescription', 'brandManufacturer', 'coverImageUrl', 'datasheetUrl', 'ifuUrl', 'msdsUrl', 'brochureUrl', 'videoUrl', 'isActive']) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  if (body.salientFeatures !== undefined) {
    update.salientFeatures = body.salientFeatures ? JSON.stringify(body.salientFeatures) : null;
  }
  if (body.categoryPath !== undefined) {
    update.categoryPath = body.categoryPath ? JSON.stringify(body.categoryPath) : null;
  }
  if (body.variantAttributes !== undefined) {
    update.variantAttributes = body.variantAttributes ? JSON.stringify(body.variantAttributes) : null;
  }

  await db.update(skuGroups).set(update).where(eq(skuGroups.id, id));
  const updated = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  return c.json(updated[0]);
});

// DELETE /sku-groups/:id — only if no SKUs attached
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('SKU group not found');
  assertVendorScope(user, rows[0].vendorId);

  const linked = await db
    .select({ count: sql<number>`count(*)` })
    .from(vendorItemSkus)
    .where(eq(vendorItemSkus.groupId, id));
  if ((linked[0]?.count ?? 0) > 0) {
    throw new ValidationError('Cannot delete group with attached SKUs — detach them first');
  }

  await db.delete(skuGroups).where(eq(skuGroups.id, id));
  return c.json({ success: true });
});

// POST /sku-groups/:id/skus — attach a SKU to this group
app.post('/:id/skus', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();
  if (!body.skuId) throw new ValidationError('skuId is required');

  const groupRow = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  if (!groupRow.length) throw new NotFoundError('SKU group not found');
  assertVendorScope(user, groupRow[0].vendorId);

  const skuRow = await db.select().from(vendorItemSkus).where(eq(vendorItemSkus.id, body.skuId)).limit(1);
  if (!skuRow.length) throw new NotFoundError('SKU not found');
  if (skuRow[0].vendorId !== groupRow[0].vendorId) {
    throw new ValidationError('SKU vendor does not match group vendor');
  }

  await db
    .update(vendorItemSkus)
    .set({
      groupId: id,
      variantAttributes: body.variantAttributes ? JSON.stringify(body.variantAttributes) : skuRow[0].variantAttributes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(vendorItemSkus.id, body.skuId));
  return c.json({ success: true });
});

// DELETE /sku-groups/:id/skus/:skuId — detach
app.delete('/:id/skus/:skuId', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id, skuId } = c.req.param();

  const groupRow = await db.select().from(skuGroups).where(eq(skuGroups.id, id)).limit(1);
  if (!groupRow.length) throw new NotFoundError('SKU group not found');
  assertVendorScope(user, groupRow[0].vendorId);

  await db
    .update(vendorItemSkus)
    .set({ groupId: null, updatedAt: new Date().toISOString() })
    .where(eq(vendorItemSkus.id, skuId));
  return c.json({ success: true });
});

export default app;
