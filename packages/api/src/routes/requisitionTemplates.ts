/**
 * /api/requisition-templates — reusable cart templates.
 */
import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  requisitionTemplates,
  requisitionTemplateItems,
  requisitions,
  requisitionItems,
  formularyItems,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { getNextValue, ensureSequenceTable } from '../services/sequenceService';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function isAdminRole(u: AuthUser): boolean {
  return u.role === 'ACCOUNT_MANAGER' || u.role === 'ACCOUNT_MANAGER_USER';
}

// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', requirePermission('requisitions', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { facilityId, departmentId } = c.req.query();
  const hospitalId =
    isAdminRole(user) && c.req.query('hospitalId')
      ? c.req.query('hospitalId')!
      : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  const conds: any[] = [
    eq(requisitionTemplates.hospitalId, hospitalId),
    eq(requisitionTemplates.isActive, 1),
  ];
  if (facilityId) conds.push(eq(requisitionTemplates.facilityId, facilityId));
  if (departmentId) conds.push(eq(requisitionTemplates.departmentId, departmentId));
  const rows = await db
    .select()
    .from(requisitionTemplates)
    .where(and(...conds))
    .orderBy(desc(requisitionTemplates.timesUsed), requisitionTemplates.name);
  return c.json({ items: rows });
});

// ─── POST / ────────────────────────────────────────────────────────────────
app.post('/', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = (await c.req.json()) as any;
  const hospitalId =
    isAdminRole(user) && body.hospitalId ? body.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId required');
  if (!body.name?.trim()) throw new ValidationError('name required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(requisitionTemplates).values({
    id,
    hospitalId,
    facilityId: body.facilityId ?? null,
    departmentId: body.departmentId ?? null,
    name: body.name.trim(),
    description: body.description ?? null,
    category: body.category ?? null,
    defaultPriority: body.defaultPriority ?? 'NORMAL',
    isActive: 1,
    timesUsed: 0,
    createdByUserId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  if (Array.isArray(body.items)) {
    for (const [idx, it] of body.items.entries()) {
      if (!it.hcpcCode?.trim() || !it.description?.trim()) continue;
      await db.insert(requisitionTemplateItems).values({
        id: crypto.randomUUID(),
        templateId: id,
        hcpcCode: String(it.hcpcCode).trim().toUpperCase(),
        description: it.description,
        defaultQuantity: it.defaultQuantity ?? 1,
        preferredVendorId: it.preferredVendorId ?? null,
        formularyItemId: it.formularyItemId ?? null,
        notes: it.notes ?? null,
        sortOrder: idx,
        createdAt: now,
      });
    }
  }

  return c.json({ id }, 201);
});

// ─── GET /:id ──────────────────────────────────────────────────────────────
app.get('/:id', requirePermission('requisitions', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [tpl] = await db
    .select()
    .from(requisitionTemplates)
    .where(eq(requisitionTemplates.id, id))
    .limit(1);
  if (!tpl) throw new NotFoundError('Template not found');
  if (!isAdminRole(user) && user.hospitalId && tpl.hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized');
  }
  const items = await db
    .select()
    .from(requisitionTemplateItems)
    .where(eq(requisitionTemplateItems.templateId, id))
    .orderBy(requisitionTemplateItems.sortOrder);
  return c.json({ ...tpl, items });
});

// ─── PUT /:id ──────────────────────────────────────────────────────────────
app.put('/:id', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json()) as any;
  const [tpl] = await db
    .select()
    .from(requisitionTemplates)
    .where(eq(requisitionTemplates.id, id))
    .limit(1);
  if (!tpl) throw new NotFoundError('Template not found');
  if (!isAdminRole(user) && user.hospitalId && tpl.hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized');
  }
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ['name', 'description', 'category', 'defaultPriority', 'facilityId', 'departmentId']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.isActive !== undefined) patch.isActive = body.isActive ? 1 : 0;
  await db.update(requisitionTemplates).set(patch).where(eq(requisitionTemplates.id, id));
  return c.json({ id, updated: true });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────
app.delete('/:id', requirePermission('requisitions', 'FULL'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const [tpl] = await db
    .select()
    .from(requisitionTemplates)
    .where(eq(requisitionTemplates.id, id))
    .limit(1);
  if (!tpl) throw new NotFoundError('Template not found');
  if (!isAdminRole(user) && user.hospitalId && tpl.hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized');
  }
  await db
    .update(requisitionTemplates)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(requisitionTemplates.id, id));
  return c.json({ id, deactivated: true });
});

// ─── POST /:id/instantiate ────────────────────────────────────────────────
// Spawn a fresh DRAFT requisition from this template. Body may override the
// per-line quantities, the title, the priority, etc.
app.post('/:id/instantiate', requirePermission('requisitions', 'WRITE'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    priority?: string;
    neededByDate?: string;
    facilityId?: string;
    departmentId?: string;
    quantityOverrides?: Record<string, number>; // templateItemId -> qty
  };

  const [tpl] = await db
    .select()
    .from(requisitionTemplates)
    .where(eq(requisitionTemplates.id, id))
    .limit(1);
  if (!tpl) throw new NotFoundError('Template not found');
  if (!isAdminRole(user) && user.hospitalId && tpl.hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized');
  }
  const tplItems = await db
    .select()
    .from(requisitionTemplateItems)
    .where(eq(requisitionTemplateItems.templateId, id))
    .orderBy(requisitionTemplateItems.sortOrder);
  if (tplItems.length === 0) throw new ValidationError('Template has no items');

  await ensureSequenceTable(db);
  const seq = await getNextValue(db, `requisition_${tpl.hospitalId}`);
  const year = new Date().getFullYear();
  const reqNumber = `REQ-${year}-${String(seq).padStart(5, '0')}`;

  const reqId = crypto.randomUUID();
  const now = new Date().toISOString();
  let total = 0;

  await db.insert(requisitions).values({
    id: reqId,
    requisitionNumber: reqNumber,
    hospitalId: tpl.hospitalId,
    facilityId: body.facilityId ?? tpl.facilityId,
    departmentId: body.departmentId ?? tpl.departmentId,
    requestedByUserId: user.id,
    title: body.title ?? `From template: ${tpl.name}`,
    status: 'DRAFT',
    priority: body.priority ?? tpl.defaultPriority,
    neededByDate: body.neededByDate ?? null,
    estimatedTotalUsd: 0,
    templateId: id,
    createdAt: now,
    updatedAt: now,
  });

  for (const ti of tplItems) {
    const qty = body.quantityOverrides?.[ti.id] ?? ti.defaultQuantity;
    // Re-evaluate formulary at instantiation time (in case formulary changed)
    const [fm] = await db
      .select()
      .from(formularyItems)
      .where(
        and(
          eq(formularyItems.hospitalId, tpl.hospitalId),
          eq(formularyItems.hcpcCode, ti.hcpcCode),
          eq(formularyItems.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    await db.insert(requisitionItems).values({
      id: crypto.randomUUID(),
      requisitionId: reqId,
      formularyItemId: fm?.id ?? ti.formularyItemId ?? null,
      hcpcCode: ti.hcpcCode,
      description: ti.description,
      quantity: qty,
      estimatedUnitPriceUsd: fm?.maxUnitPriceUsd ?? null,
      preferredVendorId: ti.preferredVendorId ?? fm?.preferredVendorId ?? null,
      substitutesAllowed: 1,
      approvalStatus: 'PENDING',
      isOffFormulary: fm ? 0 : 1,
      requiresPriorAuth: fm?.requiresPriorAuth ?? 0,
      notes: ti.notes ?? null,
      createdAt: now,
    });
    if (fm?.maxUnitPriceUsd) total += fm.maxUnitPriceUsd * qty;
  }

  await db
    .update(requisitions)
    .set({ estimatedTotalUsd: total, updatedAt: now })
    .where(eq(requisitions.id, reqId));

  // Bump template usage counter
  await db
    .update(requisitionTemplates)
    .set({ timesUsed: (tpl.timesUsed ?? 0) + 1, updatedAt: now })
    .where(eq(requisitionTemplates.id, id));

  return c.json({ requisitionId: reqId, requisitionNumber: reqNumber }, 201);
});

export default app;
