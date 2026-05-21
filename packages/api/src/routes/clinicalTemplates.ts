/**
 * Clinical note templates (Scoli, AFO, etc.) — Phase 6.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const { type } = c.req.query();
  const raw: any = await db.run(
    type
      ? sql`SELECT * FROM clinical_templates WHERE type = ${type} ORDER BY name`
      : sql`SELECT * FROM clinical_templates ORDER BY name`,
  );
  return c.json({ items: raw.results ?? [] });
});

app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const raw: any = await db.run(sql`SELECT * FROM clinical_templates WHERE id = ${id} LIMIT 1`);
  if (!raw.results?.length) throw new NotFoundError('Template not found');
  return c.json(raw.results[0]);
});

app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();
  if (!body.name || !body.type) throw new ValidationError('name and type are required');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // defaultHcpcCodes may arrive as a JSON string or as an array
  const hcpcCodes = typeof body.defaultHcpcCodes === 'string'
    ? body.defaultHcpcCodes
    : JSON.stringify(body.defaultHcpcCodes ?? []);
  await db.run(sql`
    INSERT INTO clinical_templates (id, name, type, body, default_hcpc_codes, created_at, updated_at)
    VALUES (${id}, ${body.name}, ${body.type}, ${body.body ?? ''}, ${hcpcCodes}, ${now}, ${now})
  `);
  return c.json({ id }, 201);
});

app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();
  await db.run(sql`
    UPDATE clinical_templates SET
      name = COALESCE(${body.name ?? null}, name),
      body = COALESCE(${body.body ?? null}, body),
      default_hcpc_codes = COALESCE(${body.defaultHcpcCodes ? JSON.stringify(body.defaultHcpcCodes) : null}, default_hcpc_codes),
      updated_at = ${now}
    WHERE id = ${id}
  `);
  return c.json({ success: true });
});

app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  await db.run(sql`DELETE FROM clinical_templates WHERE id = ${id}`);
  return c.json({ success: true });
});

export default app;
