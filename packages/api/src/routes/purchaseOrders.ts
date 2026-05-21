/**
 * Purchase Orders — CRUD + CSV export.
 */
import { Hono } from 'hono';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { purchaseOrders, purchaseOrderItems } from '@curavend/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { limit = '50', offset = '0' } = c.req.query();

  const conditions: any[] = [];
  if (user.vendorId) conditions.push(eq(purchaseOrders.vendorId, user.vendorId));
  if (user.superVendorId) conditions.push(eq(purchaseOrders.superVendorId, user.superVendorId));

  let query: any = db.select().from(purchaseOrders);
  if (conditions.length) query = query.where(and(...conditions));
  const items = await query.orderBy(desc(purchaseOrders.createdAt)).limit(parseInt(limit)).offset(parseInt(offset));

  return c.json({ items, total: items.length });
});

app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po.length) throw new NotFoundError('Purchase order not found');
  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
  return c.json({ ...po[0], items });
});

app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();
  if (!body.vendorId) throw new ValidationError('vendorId required');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const number = `PO-${Date.now().toString(36).toUpperCase()}`;

  await db.insert(purchaseOrders).values({
    id,
    number,
    status: body.status ?? 'ORDER_COMPLETED',
    vendorId: body.vendorId,
    superVendorId: body.superVendorId ?? null,
    fileKey: body.fileKey ?? null,
    fileName: body.fileName ?? null,
    date: body.date ?? now,
    createdAt: now,
    updatedAt: now,
  });

  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      await db.insert(purchaseOrderItems).values({
        id: crypto.randomUUID(),
        purchaseOrderId: id,
        description: item.description ?? null,
        manufacturerNumber: item.manufacturerNumber ?? null,
        productDescription: item.productDescription ?? null,
        quantity: item.quantity ?? 1,
        createdAt: now,
      });
    }
  }

  return c.json({ id, number }, 201);
});

app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();
  const existing = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Purchase order not found');
  await db.update(purchaseOrders).set({ ...body, updatedAt: new Date().toISOString() }).where(eq(purchaseOrders.id, id));
  return c.json({ success: true });
});

app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  return c.json({ success: true });
});

// Export CSV
app.get('/:id/export.csv', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po.length) throw new NotFoundError('Purchase order not found');
  const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, id));

  const rows: string[] = ['PO Number,Description,Manufacturer #,Product Description,Quantity'];
  for (const item of items) {
    rows.push(
      [
        po[0].number,
        csvEscape(item.description),
        csvEscape(item.manufacturerNumber),
        csvEscape(item.productDescription),
        item.quantity ?? 1,
      ].join(','),
    );
  }
  const csv = rows.join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${po[0].number}.csv"`,
    },
  });
});

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default app;
