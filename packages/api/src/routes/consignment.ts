/**
 * Consignment closet management.
 * Uses existing schema columns: par, on_hand, variance_reason, location
 */
import { Hono } from 'hono';
import { sql, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { vendors } from '@curavend/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// List closets — scoped by user type
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  let where = '';
  if (user.vendorId) {
    where = `WHERE vendor_id = '${user.vendorId}'`;
  } else if (user.hospitalId) {
    where = `WHERE hospital_id = '${user.hospitalId}'`;
  } else if (user.superVendorId) {
    // Super-vendor: scope to their affiliated sub-vendors
    const subVendors = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.superVendorId, user.superVendorId));
    const subIds = subVendors.map((v: any) => v.id);
    if (subIds.length === 0) return c.json({ items: [], total: 0 });
    const idList = subIds.map((id: string) => `'${id}'`).join(', ');
    where = `WHERE vendor_id IN (${idList})`;
  }
  // ADMIN: no filter

  const raw: any = await db.run(
    sql.raw(`SELECT * FROM consignment_closets ${where} ORDER BY created_at DESC LIMIT 100`),
  );
  // Backfill display_name for closets whose department_name is NULL
  const items = (raw.results ?? []).map((r: any) => ({
    ...r,
    department_name: r.department_name || `Closet ${String(r.id).slice(0, 8)}`,
  }));
  return c.json({ items, total: items.length });
});

app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();
  if (!body.hospitalId) throw new ValidationError('hospitalId required');
  if (!body.vendorId) throw new ValidationError('vendorId required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run(sql`
    INSERT INTO consignment_closets (id, vendor_id, super_vendor_id, hospital_id, provider_id, department_name, s3key, created_at, updated_at)
    VALUES (${id}, ${body.vendorId}, ${body.superVendorId ?? null}, ${body.hospitalId}, ${body.providerId ?? user.providerId ?? null}, ${body.departmentName ?? null}, ${body.s3key ?? null}, ${now}, ${now})
  `);
  return c.json({ id }, 201);
});

app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const raw: any = await db.run(sql`SELECT * FROM consignment_closets WHERE id = ${id} LIMIT 1`);
  const closet = raw.results?.[0];
  if (!closet) throw new NotFoundError('Closet not found');
  const items: any = await db.run(
    sql`SELECT * FROM consignment_closet_items WHERE consignment_closet_id = ${id}`,
  );
  return c.json({ ...closet, items: items.results ?? [] });
});

app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  await db.run(sql`DELETE FROM consignment_closet_items WHERE consignment_closet_id = ${id}`);
  await db.run(sql`DELETE FROM consignment_closets WHERE id = ${id}`);
  return c.json({ success: true });
});

app.post('/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();
  const items: any[] = Array.isArray(body.items) ? body.items : [body];
  const now = new Date().toISOString();
  const addedIds: string[] = [];
  for (const item of items) {
    const itemId = crypto.randomUUID();
    await db.run(sql`
      INSERT INTO consignment_closet_items (id, consignment_closet_id, hcpc_code, description, par, on_hand, created_at, updated_at)
      VALUES (${itemId}, ${id}, ${item.hcpcCode ?? null}, ${item.description ?? null}, ${item.par ?? item.parLevel ?? 0}, ${item.onHand ?? 0}, ${now}, ${now})
    `);
    addedIds.push(itemId);
  }
  return c.json({ ids: addedIds }, 201);
});

// Cycle count — records a count entry per item
app.post('/:id/cycle-count', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();
  const now = new Date().toISOString();

  const reports: string[] = [];
  if (Array.isArray(body.counts)) {
    for (const ct of body.counts) {
      const reportId = crypto.randomUUID();
      await db.run(sql`
        INSERT INTO cycle_count_reports (id, consignment_closet_item_id, expected_quantity, counted_quantity, variance_reason, counter_id, count_date, is_archived, hospital_vendor_id, created_at)
        VALUES (${reportId}, ${ct.itemId}, ${ct.expected ?? 0}, ${ct.counted ?? 0}, ${ct.reason ?? null}, ${user.id}, ${now}, 0, ${body.hospitalVendorId ?? null}, ${now})
      `);
      reports.push(reportId);

      // update on_hand to counted amount
      await db.run(
        sql`UPDATE consignment_closet_items SET on_hand = ${ct.counted ?? 0}, updated_at = ${now} WHERE id = ${ct.itemId}`,
      );

      // activity log
      await db.run(sql`
        INSERT INTO consignment_activity_logs (id, consignment_closet_item_id, change_type, field, previous_value, new_value, "change", timestamp, performed_by, hospital_vendor_id, description, created_at)
        VALUES (${crypto.randomUUID()}, ${ct.itemId}, 'CYCLE_COUNT', 'on_hand', ${String(ct.expected ?? 0)}, ${String(ct.counted ?? 0)}, ${(ct.counted ?? 0) - (ct.expected ?? 0)}, ${now}, ${user.id}, ${body.hospitalVendorId ?? null}, 'Cycle count', ${now})
      `);
    }
  }
  return c.json({ reports });
});

app.get('/:id/activity-log', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const raw: any = await db.run(sql`
    SELECT al.*, ci.hcpc_code
    FROM consignment_activity_logs al
    LEFT JOIN consignment_closet_items ci ON ci.id = al.consignment_closet_item_id
    WHERE ci.consignment_closet_id = ${id}
    ORDER BY al.created_at DESC
    LIMIT 200
  `);
  return c.json({ items: raw.results ?? [] });
});

app.get('/:id/usage-metrics', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const raw: any = await db.run(sql`
    SELECT al.change_type, COUNT(*) as count
    FROM consignment_activity_logs al
    LEFT JOIN consignment_closet_items ci ON ci.id = al.consignment_closet_item_id
    WHERE ci.consignment_closet_id = ${id}
    GROUP BY al.change_type
  `);
  return c.json({ metrics: raw.results ?? [] });
});

export default app;
