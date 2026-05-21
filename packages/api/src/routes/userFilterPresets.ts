import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { userFilterPresets } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /user-filter-presets?entity=orders
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { entity } = c.req.query();

  if (!entity) throw new ValidationError('entity query param is required');

  const rows = await db
    .select()
    .from(userFilterPresets)
    .where(
      and(
        eq(userFilterPresets.userId, user.id),
        eq(userFilterPresets.entity, entity),
      ),
    )
    .orderBy(desc(userFilterPresets.isDefault), desc(userFilterPresets.updatedAt));

  const items = rows.map((r) => ({
    ...r,
    isDefault: !!r.isDefault,
    filters: safeParse(r.filters),
  }));

  return c.json({ items });
});

// POST /user-filter-presets
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  if (!body.entity) throw new ValidationError('entity is required');
  if (!body.name || typeof body.name !== 'string') throw new ValidationError('name is required');
  if (body.filters === undefined || body.filters === null) {
    throw new ValidationError('filters is required');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isDefault = body.isDefault ? 1 : 0;

  // If setting default, unset any existing default for this (user, entity)
  if (isDefault) {
    await db
      .update(userFilterPresets)
      .set({ isDefault: 0, updatedAt: now })
      .where(
        and(
          eq(userFilterPresets.userId, user.id),
          eq(userFilterPresets.entity, body.entity),
          eq(userFilterPresets.isDefault, 1),
        ),
      );
  }

  await db.insert(userFilterPresets).values({
    id,
    userId: user.id,
    entity: body.entity,
    name: body.name.trim().slice(0, 100),
    filters: JSON.stringify(body.filters),
    isDefault,
    createdAt: now,
    updatedAt: now,
  });

  const row = await db
    .select()
    .from(userFilterPresets)
    .where(eq(userFilterPresets.id, id))
    .limit(1);

  return c.json(
    { ...row[0], isDefault: !!row[0].isDefault, filters: safeParse(row[0].filters) },
    201,
  );
});

// PUT /user-filter-presets/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(userFilterPresets)
    .where(eq(userFilterPresets.id, id))
    .limit(1);

  if (!existing.length) throw new NotFoundError('Preset not found');
  if (existing[0].userId !== user.id) throw new ForbiddenError('Access denied');

  const now = new Date().toISOString();
  const updateData: Record<string, any> = { updatedAt: now };

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new ValidationError('name must be a non-empty string');
    }
    updateData.name = body.name.trim().slice(0, 100);
  }
  if (body.filters !== undefined) {
    updateData.filters = JSON.stringify(body.filters);
  }
  if (body.isDefault !== undefined) {
    updateData.isDefault = body.isDefault ? 1 : 0;

    // If setting default, unset any other default for this (user, entity)
    if (body.isDefault) {
      await db
        .update(userFilterPresets)
        .set({ isDefault: 0, updatedAt: now })
        .where(
          and(
            eq(userFilterPresets.userId, user.id),
            eq(userFilterPresets.entity, existing[0].entity),
            eq(userFilterPresets.isDefault, 1),
          ),
        );
    }
  }

  await db.update(userFilterPresets).set(updateData).where(eq(userFilterPresets.id, id));

  const row = await db
    .select()
    .from(userFilterPresets)
    .where(eq(userFilterPresets.id, id))
    .limit(1);

  return c.json({ ...row[0], isDefault: !!row[0].isDefault, filters: safeParse(row[0].filters) });
});

// DELETE /user-filter-presets/:id
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const existing = await db
    .select()
    .from(userFilterPresets)
    .where(eq(userFilterPresets.id, id))
    .limit(1);

  if (!existing.length) throw new NotFoundError('Preset not found');
  if (existing[0].userId !== user.id) throw new ForbiddenError('Access denied');

  await db.delete(userFilterPresets).where(eq(userFilterPresets.id, id));
  return c.json({ success: true });
});

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export default app;
