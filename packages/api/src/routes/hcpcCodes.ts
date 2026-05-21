import { Hono } from 'hono';
import { eq, and, like, or, sql, notInArray } from 'drizzle-orm';
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
