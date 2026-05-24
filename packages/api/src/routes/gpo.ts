/**
 * /api/gpo — Admin endpoints for Group Purchasing Organizations.
 *
 * - List GPOs (anyone authed; needed for the hospital settings dropdown).
 * - Manage GPO contract items (admin only).
 * - Import rates from CSV (admin only).
 * - Resolve a single rate (used by the Price Lookup UI as a sanity check).
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  gpoOrganizations,
  gpoContractItems,
  hospitals,
  GPO_KINDS,
  type GpoKind,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { getGpoRate } from '../lib/contractPricing';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── GET /gpo/organizations ────────────────────────────────────────────────
// List GPOs. Available to any authed user so the hospital settings page can
// populate its dropdown.
app.get('/organizations', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(gpoOrganizations).orderBy(gpoOrganizations.name);
  return c.json({ items: rows });
});

// ─── POST /gpo/organizations ───────────────────────────────────────────────
app.post('/organizations', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as { name?: string; kind?: string; description?: string; website?: string };
  if (!body.name?.trim()) throw new ValidationError('name is required');
  if (!body.kind || !GPO_KINDS.includes(body.kind as GpoKind)) {
    throw new ValidationError(`kind must be one of ${GPO_KINDS.join(', ')}`);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(gpoOrganizations).values({
    id,
    name: body.name.trim(),
    kind: body.kind,
    description: body.description ?? null,
    website: body.website ?? null,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ id, name: body.name.trim(), kind: body.kind }, 201);
});

// ─── GET /gpo/organizations/:id ────────────────────────────────────────────
// Details + counts of attached hospitals and contract items.
app.get('/organizations/:id', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const [gpo] = await db.select().from(gpoOrganizations).where(eq(gpoOrganizations.id, id)).limit(1);
  if (!gpo) throw new NotFoundError('GPO not found');

  const memberCount = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(hospitals)
    .where(eq(hospitals.gpoOrganizationId, id));
  const itemCount = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(gpoContractItems)
    .where(eq(gpoContractItems.gpoOrganizationId, id));

  return c.json({
    ...gpo,
    memberHospitalCount: Number(memberCount[0]?.c ?? 0),
    contractItemCount: Number(itemCount[0]?.c ?? 0),
  });
});

// ─── GET /gpo/organizations/:id/items ──────────────────────────────────────
app.get('/organizations/:id/items', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const { hcpcCode, activeOnly } = c.req.query();
  const conds = [eq(gpoContractItems.gpoOrganizationId, id)];
  if (hcpcCode) conds.push(eq(gpoContractItems.hcpcCode, hcpcCode));
  if (activeOnly === 'true') conds.push(eq(gpoContractItems.isActive, 1));
  const rows = await db
    .select()
    .from(gpoContractItems)
    .where(and(...conds))
    .orderBy(gpoContractItems.hcpcCode);
  return c.json({ items: rows });
});

// ─── POST /gpo/organizations/:id/items ─────────────────────────────────────
// Bulk add/upsert contract items.
app.post('/organizations/:id/items', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = (await c.req.json()) as {
    items?: Array<{
      hcpcCode: string;
      rateUsd: number;
      effectiveStartDate: string;
      effectiveEndDate?: string;
      vendorId?: string;
      description?: string;
      sourceContractId?: string;
    }>;
  };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError('items (non-empty array) is required');
  }

  // Verify the GPO exists.
  const [gpo] = await db.select().from(gpoOrganizations).where(eq(gpoOrganizations.id, id)).limit(1);
  if (!gpo) throw new NotFoundError('GPO not found');

  const now = new Date().toISOString();
  const inserted: string[] = [];
  for (const item of body.items) {
    if (!item.hcpcCode || typeof item.rateUsd !== 'number' || !item.effectiveStartDate) {
      throw new ValidationError('Each item needs hcpcCode, rateUsd (number), and effectiveStartDate');
    }
    // Conflict check on the unique index — if a row exists for (gpo, vendor, hcpc, startDate), update it.
    const existing = await db
      .select({ id: gpoContractItems.id })
      .from(gpoContractItems)
      .where(
        and(
          eq(gpoContractItems.gpoOrganizationId, id),
          eq(gpoContractItems.hcpcCode, item.hcpcCode),
          eq(gpoContractItems.effectiveStartDate, item.effectiveStartDate),
          item.vendorId
            ? eq(gpoContractItems.vendorId, item.vendorId)
            : sql`${gpoContractItems.vendorId} IS NULL`,
        ),
      )
      .limit(1);

    if (existing.length) {
      await db
        .update(gpoContractItems)
        .set({
          rateUsd: item.rateUsd,
          effectiveEndDate: item.effectiveEndDate ?? null,
          description: item.description ?? null,
          sourceContractId: item.sourceContractId ?? null,
          isActive: 1,
          importedAt: now,
          updatedAt: now,
        })
        .where(eq(gpoContractItems.id, existing[0].id));
      inserted.push(existing[0].id);
    } else {
      const newId = crypto.randomUUID();
      await db.insert(gpoContractItems).values({
        id: newId,
        gpoOrganizationId: id,
        vendorId: item.vendorId ?? null,
        hcpcCode: item.hcpcCode,
        description: item.description ?? null,
        rateUsd: item.rateUsd,
        effectiveStartDate: item.effectiveStartDate,
        effectiveEndDate: item.effectiveEndDate ?? null,
        isActive: 1,
        sourceContractId: item.sourceContractId ?? null,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      inserted.push(newId);
    }
  }
  return c.json({ gpoOrganizationId: id, processed: inserted.length, itemIds: inserted });
});

// ─── DELETE /gpo/organizations/:id/items/:itemId ───────────────────────────
app.delete(
  '/organizations/:id/items/:itemId',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id, itemId } = c.req.param();
    await db
      .delete(gpoContractItems)
      .where(and(eq(gpoContractItems.gpoOrganizationId, id), eq(gpoContractItems.id, itemId)));
    return c.json({ id: itemId, deleted: true });
  },
);

// ─── PUT /gpo/hospital-membership ──────────────────────────────────────────
// Attach/detach a hospital to a GPO. Anyone with FACILITY_ACCOUNT_MANAGER can
// edit their own hospital's membership; admins can edit any.
app.put(
  '/hospital-membership',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const caller = c.get('user');
    const body = (await c.req.json()) as {
      hospitalId: string;
      gpoOrganizationId: string | null;
      gpoMemberId?: string | null;
    };
    if (!body.hospitalId) throw new ValidationError('hospitalId is required');

    // Tenant guard.
    if (
      caller.role === 'FACILITY_ACCOUNT_MANAGER' &&
      caller.hospitalId &&
      body.hospitalId !== caller.hospitalId
    ) {
      throw new ConflictError('Cannot change membership for a different hospital');
    }

    await db
      .update(hospitals)
      .set({
        gpoOrganizationId: body.gpoOrganizationId ?? null,
        gpoMemberId: body.gpoMemberId ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(hospitals.id, body.hospitalId));
    return c.json({ hospitalId: body.hospitalId, gpoOrganizationId: body.gpoOrganizationId ?? null });
  },
);

// ─── GET /gpo/resolve-rate ─────────────────────────────────────────────────
// Quick lookup used by the price-lookup UI to show "would this come from a GPO?"
app.get('/resolve-rate', async (c) => {
  const { hospitalId, vendorId, hcpcCode } = c.req.query();
  if (!hospitalId || !hcpcCode) {
    throw new ValidationError('hospitalId and hcpcCode are required');
  }
  const match = await getGpoRate(c.env.DB, hospitalId, vendorId ?? null, hcpcCode);
  return c.json({ match });
});

export default app;
