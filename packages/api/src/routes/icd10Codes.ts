import { Hono } from 'hono';
import { eq, and, like, or } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { icd10Codes } from '@curavend/db';
import { rbac } from '../middleware/rbac';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /icd10-codes — Search codes
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const { search, category, status, limit: limitStr } = c.req.query();

  const limit = Math.min(parseInt(limitStr || '20', 10) || 20, 50);
  const statusFilter = status || 'ACTIVE';

  if (!search || search.length < 2) {
    return c.json({ items: [] });
  }

  const searchPattern = `%${search}%`;

  const conditions: any[] = [
    eq(icd10Codes.status, statusFilter),
    or(
      like(icd10Codes.code, searchPattern),
      like(icd10Codes.description, searchPattern)
    ),
  ];

  if (category) {
    conditions.push(eq(icd10Codes.category, category));
  }

  const results = await db
    .select()
    .from(icd10Codes)
    .where(and(...conditions))
    .limit(limit);

  const items = results.map((row) => ({
    code: row.code,
    description: row.description,
    category: row.category,
    chapterDescription: row.chapterDescription,
  }));

  return c.json({ items });
});

// GET /icd10-codes/:code — Single code lookup
app.get('/:code', async (c) => {
  const db = getDb(c.env.DB);
  const { code } = c.req.param();

  const row = await db
    .select()
    .from(icd10Codes)
    .where(eq(icd10Codes.code, code.toUpperCase()))
    .limit(1);

  if (!row.length) throw new NotFoundError('ICD-10 code not found');

  return c.json(row[0]);
});

// POST /icd10-codes/bulk — Admin bulk import
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
    if (!item.code || !item.description) continue;

    await db
      .insert(icd10Codes)
      .values({
        code: item.code.toUpperCase(),
        description: item.description,
        category: item.category || null,
        chapterDescription: item.chapterDescription || null,
        status: item.status || 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: icd10Codes.code,
        set: {
          description: item.description,
          category: item.category || null,
          chapterDescription: item.chapterDescription || null,
          status: item.status || 'ACTIVE',
          updatedAt: now,
        },
      });

    imported++;
  }

  return c.json({ success: true, imported });
});

export default app;
