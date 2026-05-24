/**
 * /api/formulary — Hospital Item Master / Formulary.
 *
 * The formulary is the authoritative whitelist of HCPC items approved at a
 * hospital (and optionally per facility). It drives:
 *   - requisition validation (off-formulary -> requires approval)
 *   - preferred-vendor steering
 *   - max-unit-price guardrails
 *   - prior-auth flags
 *   - restricted-item gates
 *   - par-level reorder triggers
 *
 * Routes:
 *   GET    /                       — list items for current hospital (filterable)
 *   POST   /                       — create item
 *   GET    /:id                    — item detail with substitutes
 *   PUT    /:id                    — update item
 *   DELETE /:id                    — soft-delete (status=RETIRED) or hard delete if no usage
 *   POST   /:id/substitutes        — add a substitute
 *   DELETE /:id/substitutes/:subId — remove a substitute
 *   POST   /bulk-import            — bulk upsert items by HCPC code
 *   GET    /resolve?hcpcCode=...   — resolve a single HCPC for a hospital/facility,
 *                                    returns formulary row + substitutes + decision
 *                                    (ON_FORMULARY / OFF_FORMULARY / RESTRICTED)
 */
import { Hono } from 'hono';
import { and, eq, like, or, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  formularyItems,
  formularySubstitutes,
  FORMULARY_STATUSES,
  hospitalFacilities,
  vendors,
} from '@curavend/db';
import { ValidationError, NotFoundError, ConflictError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function getHospitalScope(user: AuthUser): string | null {
  return user.hospitalId ?? null;
}

// Per-route enforcement layers atop `rbac()`: rbac filters which roles can
// even attempt the call; requirePermission then checks the per-user level.
// Admins / hospital managers get FULL via fast-path in requirePermission.

// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { hospitalId: qHospitalId, facilityId, status, hcpcCode, q } = c.req.query();

  // Hospital scoping: admins may pass any hospitalId; others get their own
  const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
  const hospitalId = isAdmin && qHospitalId ? qHospitalId : getHospitalScope(user);
  if (!hospitalId) throw new ValidationError('hospitalId required (admin) or hospital context missing');

  const conds = [eq(formularyItems.hospitalId, hospitalId)];
  if (facilityId === 'null' || facilityId === 'org-wide') {
    conds.push(sql`${formularyItems.facilityId} IS NULL`);
  } else if (facilityId) {
    conds.push(eq(formularyItems.facilityId, facilityId));
  }
  if (status && (FORMULARY_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(formularyItems.status, status));
  }
  if (hcpcCode) conds.push(eq(formularyItems.hcpcCode, hcpcCode));
  if (q) {
    conds.push(
      or(
        like(formularyItems.hcpcCode, `%${q}%`),
        like(formularyItems.description, `%${q}%`),
        like(formularyItems.category, `%${q}%`),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(formularyItems)
    .where(and(...conds))
    .orderBy(formularyItems.hcpcCode)
    .limit(500);

  return c.json({ items: rows });
});

// ─── POST / ────────────────────────────────────────────────────────────────
app.post(
  '/',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  requirePermission('formulary', 'WRITE'),
  async (c) => {
    const db = getDb(c.env.DB);
    const user = c.get('user');
    const body = (await c.req.json()) as {
      hospitalId?: string;
      facilityId?: string | null;
      hcpcCode?: string;
      description?: string;
      category?: string;
      preferredVendorId?: string;
      secondaryVendorId?: string;
      maxUnitPriceUsd?: number;
      requiresPriorAuth?: boolean;
      isRestricted?: boolean;
      restrictionReason?: string;
      parLevel?: number;
      reorderQuantity?: number;
      unitOfMeasure?: string;
      status?: string;
      notes?: string;
    };

    const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
    const hospitalId = isAdmin && body.hospitalId ? body.hospitalId : user.hospitalId;
    if (!hospitalId) throw new ValidationError('hospitalId required');
    if (!body.hcpcCode?.trim()) throw new ValidationError('hcpcCode is required');
    if (!body.description?.trim()) throw new ValidationError('description is required');
    if (body.status && !(FORMULARY_STATUSES as readonly string[]).includes(body.status)) {
      throw new ValidationError(`status must be one of ${FORMULARY_STATUSES.join(', ')}`);
    }

    // Tenant safety: non-admins can only modify their own hospital
    if (!isAdmin && user.hospitalId && hospitalId !== user.hospitalId) {
      throw new ConflictError('Cannot modify formulary for a different hospital');
    }

    // Validate facility belongs to hospital (if provided)
    if (body.facilityId) {
      const [fac] = await db
        .select({ id: hospitalFacilities.id, hospitalId: hospitalFacilities.hospitalId })
        .from(hospitalFacilities)
        .where(eq(hospitalFacilities.id, body.facilityId))
        .limit(1);
      if (!fac) throw new NotFoundError('Facility not found');
      if (fac.hospitalId !== hospitalId) throw new ConflictError('Facility does not belong to this hospital');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.insert(formularyItems).values({
        id,
        hospitalId,
        facilityId: body.facilityId ?? null,
        hcpcCode: body.hcpcCode.trim().toUpperCase(),
        description: body.description.trim(),
        category: body.category ?? null,
        preferredVendorId: body.preferredVendorId ?? null,
        secondaryVendorId: body.secondaryVendorId ?? null,
        maxUnitPriceUsd: body.maxUnitPriceUsd ?? null,
        requiresPriorAuth: body.requiresPriorAuth ? 1 : 0,
        isRestricted: body.isRestricted ? 1 : 0,
        restrictionReason: body.restrictionReason ?? null,
        parLevel: body.parLevel ?? null,
        reorderQuantity: body.reorderQuantity ?? null,
        unitOfMeasure: body.unitOfMeasure ?? null,
        status: body.status ?? 'ACTIVE',
        notes: body.notes ?? null,
        createdByUserId: user.id,
        updatedByUserId: user.id,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err: any) {
      if (String(err?.message ?? '').includes('UNIQUE')) {
        throw new ConflictError('Formulary item already exists for this hospital/facility/HCPC');
      }
      throw err;
    }
    return c.json({ id }, 201);
  },
);

// ─── GET /:id ──────────────────────────────────────────────────────────────
app.get('/:id', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const user = c.get('user');
  const [item] = await db.select().from(formularyItems).where(eq(formularyItems.id, id)).limit(1);
  if (!item) throw new NotFoundError('Formulary item not found');

  const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
  if (!isAdmin && user.hospitalId && item.hospitalId !== user.hospitalId) {
    throw new ConflictError('Not authorized to view this formulary item');
  }

  const subs = await db
    .select()
    .from(formularySubstitutes)
    .where(eq(formularySubstitutes.formularyItemId, id))
    .orderBy(formularySubstitutes.priority);

  // Resolve vendor names if set
  const vendorIds = [item.preferredVendorId, item.secondaryVendorId].filter(Boolean) as string[];
  const vendorRows = vendorIds.length
    ? await db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(sql`${vendors.id} IN (${sql.join(vendorIds.map(v => sql`${v}`), sql`, `)})`)
    : [];
  const vendorMap: Record<string, string> = {};
  for (const v of vendorRows) vendorMap[v.id] = v.name ?? '';

  return c.json({
    ...item,
    preferredVendorName: item.preferredVendorId ? vendorMap[item.preferredVendorId] ?? null : null,
    secondaryVendorName: item.secondaryVendorId ? vendorMap[item.secondaryVendorId] ?? null : null,
    substitutes: subs,
  });
});

// ─── PUT /:id ──────────────────────────────────────────────────────────────
app.put(
  '/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  requirePermission('formulary', 'WRITE'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    const user = c.get('user');
    const body = (await c.req.json()) as Partial<{
      description: string;
      category: string | null;
      preferredVendorId: string | null;
      secondaryVendorId: string | null;
      maxUnitPriceUsd: number | null;
      requiresPriorAuth: boolean;
      isRestricted: boolean;
      restrictionReason: string | null;
      parLevel: number | null;
      reorderQuantity: number | null;
      unitOfMeasure: string | null;
      status: string;
      notes: string | null;
    }>;

    const [existing] = await db.select().from(formularyItems).where(eq(formularyItems.id, id)).limit(1);
    if (!existing) throw new NotFoundError('Formulary item not found');

    const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
    if (!isAdmin && user.hospitalId && existing.hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized to edit this formulary item');
    }
    if (body.status && !(FORMULARY_STATUSES as readonly string[]).includes(body.status)) {
      throw new ValidationError(`status must be one of ${FORMULARY_STATUSES.join(', ')}`);
    }

    const patch: Record<string, unknown> = {
      updatedByUserId: user.id,
      updatedAt: new Date().toISOString(),
    };
    if (body.description !== undefined) patch.description = body.description;
    if (body.category !== undefined) patch.category = body.category;
    if (body.preferredVendorId !== undefined) patch.preferredVendorId = body.preferredVendorId;
    if (body.secondaryVendorId !== undefined) patch.secondaryVendorId = body.secondaryVendorId;
    if (body.maxUnitPriceUsd !== undefined) patch.maxUnitPriceUsd = body.maxUnitPriceUsd;
    if (body.requiresPriorAuth !== undefined) patch.requiresPriorAuth = body.requiresPriorAuth ? 1 : 0;
    if (body.isRestricted !== undefined) patch.isRestricted = body.isRestricted ? 1 : 0;
    if (body.restrictionReason !== undefined) patch.restrictionReason = body.restrictionReason;
    if (body.parLevel !== undefined) patch.parLevel = body.parLevel;
    if (body.reorderQuantity !== undefined) patch.reorderQuantity = body.reorderQuantity;
    if (body.unitOfMeasure !== undefined) patch.unitOfMeasure = body.unitOfMeasure;
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes;

    await db.update(formularyItems).set(patch).where(eq(formularyItems.id, id));
    return c.json({ id, updated: true });
  },
);

// ─── DELETE /:id ───────────────────────────────────────────────────────────
app.delete(
  '/:id',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  requirePermission('formulary', 'FULL'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    const user = c.get('user');
    const [item] = await db.select().from(formularyItems).where(eq(formularyItems.id, id)).limit(1);
    if (!item) throw new NotFoundError('Formulary item not found');
    const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
    if (!isAdmin && user.hospitalId && item.hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized to delete this formulary item');
    }

    // Soft-retire: cleaner audit trail than hard delete
    await db
      .update(formularyItems)
      .set({ status: 'RETIRED', updatedAt: new Date().toISOString(), updatedByUserId: user.id })
      .where(eq(formularyItems.id, id));
    return c.json({ id, retired: true });
  },
);

// ─── POST /:id/substitutes ─────────────────────────────────────────────────
app.post(
  '/:id/substitutes',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  requirePermission('formulary', 'WRITE'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    const user = c.get('user');
    const body = (await c.req.json()) as {
      substituteHcpcCode?: string;
      substituteDescription?: string;
      priority?: number;
      notes?: string;
    };
    if (!body.substituteHcpcCode?.trim()) throw new ValidationError('substituteHcpcCode required');

    const [item] = await db.select().from(formularyItems).where(eq(formularyItems.id, id)).limit(1);
    if (!item) throw new NotFoundError('Formulary item not found');
    const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
    if (!isAdmin && user.hospitalId && item.hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized');
    }

    const subId = crypto.randomUUID();
    try {
      await db.insert(formularySubstitutes).values({
        id: subId,
        formularyItemId: id,
        substituteHcpcCode: body.substituteHcpcCode.trim().toUpperCase(),
        substituteDescription: body.substituteDescription ?? null,
        priority: body.priority ?? 10,
        notes: body.notes ?? null,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      if (String(err?.message ?? '').includes('UNIQUE')) {
        throw new ConflictError('This substitute already exists for this item');
      }
      throw err;
    }
    return c.json({ id: subId }, 201);
  },
);

// ─── DELETE /:id/substitutes/:subId ────────────────────────────────────────
app.delete(
  '/:id/substitutes/:subId',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  requirePermission('formulary', 'WRITE'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id, subId } = c.req.param();
    const user = c.get('user');
    const [item] = await db.select().from(formularyItems).where(eq(formularyItems.id, id)).limit(1);
    if (!item) throw new NotFoundError('Formulary item not found');
    const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
    if (!isAdmin && user.hospitalId && item.hospitalId !== user.hospitalId) {
      throw new ConflictError('Not authorized');
    }
    await db
      .delete(formularySubstitutes)
      .where(
        and(eq(formularySubstitutes.id, subId), eq(formularySubstitutes.formularyItemId, id)),
      );
    return c.json({ id: subId, deleted: true });
  },
);

// ─── POST /bulk-import ─────────────────────────────────────────────────────
// Upsert by (hospitalId, facilityId, hcpcCode). Useful for spreadsheet imports.
app.post(
  '/bulk-import',
  rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER', 'FACILITY_ACCOUNT_MANAGER'),
  requirePermission('formulary', 'WRITE'),
  async (c) => {
    const db = getDb(c.env.DB);
    const user = c.get('user');
    const body = (await c.req.json()) as {
      hospitalId?: string;
      facilityId?: string | null;
      items?: Array<{
        hcpcCode: string;
        description: string;
        category?: string;
        maxUnitPriceUsd?: number;
        requiresPriorAuth?: boolean;
        isRestricted?: boolean;
        restrictionReason?: string;
        parLevel?: number;
        reorderQuantity?: number;
        unitOfMeasure?: string;
        notes?: string;
      }>;
    };

    const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
    const hospitalId = isAdmin && body.hospitalId ? body.hospitalId : user.hospitalId;
    if (!hospitalId) throw new ValidationError('hospitalId required');
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new ValidationError('items (non-empty array) required');
    }

    const now = new Date().toISOString();
    let inserted = 0;
    let updated = 0;
    for (const it of body.items) {
      if (!it.hcpcCode?.trim() || !it.description?.trim()) continue;
      const hcpc = it.hcpcCode.trim().toUpperCase();
      const existing = await db
        .select({ id: formularyItems.id })
        .from(formularyItems)
        .where(
          and(
            eq(formularyItems.hospitalId, hospitalId),
            body.facilityId
              ? eq(formularyItems.facilityId, body.facilityId)
              : sql`${formularyItems.facilityId} IS NULL`,
            eq(formularyItems.hcpcCode, hcpc),
          ),
        )
        .limit(1);

      const values = {
        hcpcCode: hcpc,
        description: it.description.trim(),
        category: it.category ?? null,
        maxUnitPriceUsd: it.maxUnitPriceUsd ?? null,
        requiresPriorAuth: it.requiresPriorAuth ? 1 : 0,
        isRestricted: it.isRestricted ? 1 : 0,
        restrictionReason: it.restrictionReason ?? null,
        parLevel: it.parLevel ?? null,
        reorderQuantity: it.reorderQuantity ?? null,
        unitOfMeasure: it.unitOfMeasure ?? null,
        notes: it.notes ?? null,
        updatedByUserId: user.id,
        updatedAt: now,
      };

      if (existing.length) {
        await db.update(formularyItems).set(values).where(eq(formularyItems.id, existing[0].id));
        updated++;
      } else {
        await db.insert(formularyItems).values({
          id: crypto.randomUUID(),
          hospitalId,
          facilityId: body.facilityId ?? null,
          status: 'ACTIVE',
          createdByUserId: user.id,
          createdAt: now,
          ...values,
        });
        inserted++;
      }
    }

    return c.json({ inserted, updated, totalProcessed: inserted + updated });
  },
);

// ─── GET /resolve ──────────────────────────────────────────────────────────
// Look up a single HCPC code's formulary status for a hospital+facility.
// Used by requisition flow + price-lookup UI.
app.get('/resolve', requirePermission('formulary', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { hcpcCode, facilityId } = c.req.query();
  if (!hcpcCode) throw new ValidationError('hcpcCode required');
  const isAdmin = user.role === 'ACCOUNT_MANAGER' || user.role === 'ACCOUNT_MANAGER_USER';
  const hospitalId = isAdmin ? c.req.query('hospitalId') ?? user.hospitalId : user.hospitalId;
  if (!hospitalId) throw new ValidationError('hospitalId context required');

  const code = hcpcCode.trim().toUpperCase();

  // Facility-specific row beats org-wide row.
  let rows: any[] = [];
  if (facilityId) {
    rows = await db
      .select()
      .from(formularyItems)
      .where(
        and(
          eq(formularyItems.hospitalId, hospitalId),
          eq(formularyItems.facilityId, facilityId),
          eq(formularyItems.hcpcCode, code),
          eq(formularyItems.status, 'ACTIVE'),
        ),
      )
      .limit(1);
  }
  if (!rows.length) {
    rows = await db
      .select()
      .from(formularyItems)
      .where(
        and(
          eq(formularyItems.hospitalId, hospitalId),
          sql`${formularyItems.facilityId} IS NULL`,
          eq(formularyItems.hcpcCode, code),
          eq(formularyItems.status, 'ACTIVE'),
        ),
      )
      .limit(1);
  }

  if (!rows.length) {
    return c.json({
      decision: 'OFF_FORMULARY',
      hcpcCode: code,
      item: null,
      substitutes: [],
    });
  }

  const item = rows[0];
  const subs = await db
    .select()
    .from(formularySubstitutes)
    .where(eq(formularySubstitutes.formularyItemId, item.id))
    .orderBy(formularySubstitutes.priority);

  return c.json({
    decision: item.isRestricted ? 'RESTRICTED' : 'ON_FORMULARY',
    hcpcCode: code,
    item,
    substitutes: subs,
  });
});

export default app;
