import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { vendorLocations, vendors, hospitalVendors } from '@curavend/db';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '../lib/errors';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

const VALID_TYPES = new Set([
  'WAREHOUSE',
  'FITTING_CENTER',
  'HEADQUARTERS',
  'DISTRIBUTION_HUB',
]);

// Normalize a string/array input into a JSON string (or NULL when empty).
function normalizeJsonArray(input: unknown): string | null {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const clean = input.map((x) => String(x).trim()).filter(Boolean);
    return clean.length > 0 ? JSON.stringify(clean) : null;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Accept JSON or comma-separated string
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeJsonArray(parsed);
    } catch {
      /* fall through */
    }
    return normalizeJsonArray(trimmed.split(',').map((s) => s.trim()));
  }
  return null;
}

// Authorization helper: admin can do anything; vendor users can only touch
// locations belonging to their own vendor.
function assertVendorScope(user: any, vendorId: string): void {
  if (user.userType === 'ADMIN') return;
  if (user.userType === 'VENDOR' && user.vendorId === vendorId) return;
  throw new ForbiddenError('Access denied');
}

// GET /vendor-locations — list locations (filter by vendorId).
// - Vendor users are auto-scoped to their own vendor.
// - Hospital users MUST pass ?vendorId=X and must have a hospital_vendors
//   relationship with that vendor; otherwise 403. Only active locations are
//   returned for hospital users.
// - Platform admins are unscoped.
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { vendorId: queryVendorId, isActive } = c.req.query();

  const conditions: any[] = [];

  if (user.userType === 'VENDOR' && user.vendorId) {
    conditions.push(eq(vendorLocations.vendorId, user.vendorId));
  } else if (user.userType === 'HOSPITAL') {
    if (!user.hospitalId) {
      throw new ForbiddenError('Access denied');
    }
    if (!queryVendorId) {
      throw new ValidationError('vendorId query parameter is required');
    }
    // Confirm a hospital_vendors row exists for (hospital, vendor)
    const link = await db
      .select({ id: hospitalVendors.id })
      .from(hospitalVendors)
      .where(
        and(
          eq(hospitalVendors.hospitalId, user.hospitalId),
          eq(hospitalVendors.vendorId, queryVendorId),
        ),
      )
      .limit(1);
    if (!link.length) {
      throw new ForbiddenError(
        'Vendor is not linked to your hospital',
      );
    }
    conditions.push(eq(vendorLocations.vendorId, queryVendorId));
    // Hospital users only see active locations (isActive param is ignored for them)
    conditions.push(eq(vendorLocations.isActive, 1));
  } else {
    if (queryVendorId) {
      conditions.push(eq(vendorLocations.vendorId, queryVendorId));
    }
    // isActive param only applies to non-hospital users
    if (isActive === '1' || isActive === 'true') {
      conditions.push(eq(vendorLocations.isActive, 1));
    } else if (isActive === '0' || isActive === 'false') {
      conditions.push(eq(vendorLocations.isActive, 0));
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(vendorLocations)
    .where(whereClause)
    .orderBy(desc(vendorLocations.isPrimary), desc(vendorLocations.createdAt));

  return c.json({ items: rows });
});

// GET /vendor-locations/:id
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows = await db
    .select()
    .from(vendorLocations)
    .where(eq(vendorLocations.id, id))
    .limit(1);

  if (!rows.length) throw new NotFoundError('Vendor location not found');
  const loc = rows[0];

  // Vendor users can only see their own
  if (user.userType === 'VENDOR' && loc.vendorId !== user.vendorId) {
    throw new ForbiddenError('Access denied');
  }

  // Hospital users may only see locations of vendors they have linked
  if (user.userType === 'HOSPITAL') {
    if (!user.hospitalId) throw new ForbiddenError('Access denied');
    const link = await db
      .select({ id: hospitalVendors.id })
      .from(hospitalVendors)
      .where(
        and(
          eq(hospitalVendors.hospitalId, user.hospitalId),
          eq(hospitalVendors.vendorId, loc.vendorId),
        ),
      )
      .limit(1);
    if (!link.length) {
      throw new ForbiddenError('Access denied');
    }
  }

  return c.json(loc);
});

// POST /vendor-locations
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const body = await c.req.json();

  // Vendor users implicitly create under their own vendorId.
  const vendorId: string =
    user.userType === 'VENDOR' && user.vendorId
      ? user.vendorId
      : body.vendorId;

  if (!vendorId) throw new ValidationError('vendorId is required');
  assertVendorScope(user, vendorId);

  if (!body.name || !String(body.name).trim()) {
    throw new ValidationError('name is required');
  }

  const locationType = body.locationType || 'WAREHOUSE';
  if (!VALID_TYPES.has(locationType)) {
    throw new ValidationError(
      `locationType must be one of: ${[...VALID_TYPES].join(', ')}`,
    );
  }

  // Confirm the vendor exists (defensive; FK is CASCADE but we want a clean
  // 400 rather than a constraint error surfaced as a generic 500).
  const vendorRow = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);
  if (!vendorRow.length) throw new ValidationError('Vendor not found');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const isPrimary = body.isPrimary ? 1 : 0;

  // If this location is marked primary, clear other primaries for the vendor
  if (isPrimary) {
    await db
      .update(vendorLocations)
      .set({ isPrimary: 0, updatedAt: now })
      .where(eq(vendorLocations.vendorId, vendorId));
  }

  await db.insert(vendorLocations).values({
    id,
    vendorId,
    name: String(body.name).trim(),
    locationType,
    streetAddress: body.streetAddress ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
    phone: body.phone ?? null,
    email: body.email ?? null,
    isPrimary,
    isActive: body.isActive === 0 || body.isActive === false ? 0 : 1,
    capabilities: normalizeJsonArray(body.capabilities),
    serviceStates: normalizeJsonArray(body.serviceStates),
    serviceZipPrefixes: normalizeJsonArray(body.serviceZipPrefixes),
    maxDeliveryHours:
      typeof body.maxDeliveryHours === 'number'
        ? body.maxDeliveryHours
        : body.maxDeliveryHours
          ? parseInt(body.maxDeliveryHours, 10)
          : null,
    notes: body.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db
    .select()
    .from(vendorLocations)
    .where(eq(vendorLocations.id, id))
    .limit(1);

  return c.json(created, 201);
});

// PUT /vendor-locations/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const rows = await db
    .select()
    .from(vendorLocations)
    .where(eq(vendorLocations.id, id))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Vendor location not found');
  const existing = rows[0];

  assertVendorScope(user, existing.vendorId);

  const now = new Date().toISOString();
  const update: Record<string, any> = { updatedAt: now };

  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.locationType !== undefined) {
    if (!VALID_TYPES.has(body.locationType)) {
      throw new ValidationError(
        `locationType must be one of: ${[...VALID_TYPES].join(', ')}`,
      );
    }
    update.locationType = body.locationType;
  }
  if (body.streetAddress !== undefined) update.streetAddress = body.streetAddress;
  if (body.city !== undefined) update.city = body.city;
  if (body.state !== undefined) update.state = body.state;
  if (body.zip !== undefined) update.zip = body.zip;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.email !== undefined) update.email = body.email;
  if (body.isActive !== undefined) {
    update.isActive = body.isActive ? 1 : 0;
  }
  if (body.capabilities !== undefined) {
    update.capabilities = normalizeJsonArray(body.capabilities);
  }
  if (body.serviceStates !== undefined) {
    update.serviceStates = normalizeJsonArray(body.serviceStates);
  }
  if (body.serviceZipPrefixes !== undefined) {
    update.serviceZipPrefixes = normalizeJsonArray(body.serviceZipPrefixes);
  }
  if (body.maxDeliveryHours !== undefined) {
    update.maxDeliveryHours =
      body.maxDeliveryHours === null || body.maxDeliveryHours === ''
        ? null
        : Number(body.maxDeliveryHours);
  }
  if (body.notes !== undefined) update.notes = body.notes;

  if (body.isPrimary === true || body.isPrimary === 1) {
    // Clear other primaries for this vendor
    await db
      .update(vendorLocations)
      .set({ isPrimary: 0, updatedAt: now })
      .where(eq(vendorLocations.vendorId, existing.vendorId));
    update.isPrimary = 1;
  } else if (body.isPrimary === false || body.isPrimary === 0) {
    update.isPrimary = 0;
  }

  await db
    .update(vendorLocations)
    .set(update)
    .where(eq(vendorLocations.id, id));

  const [updated] = await db
    .select()
    .from(vendorLocations)
    .where(eq(vendorLocations.id, id))
    .limit(1);

  return c.json(updated);
});

// DELETE /vendor-locations/:id
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const rows = await db
    .select()
    .from(vendorLocations)
    .where(eq(vendorLocations.id, id))
    .limit(1);
  if (!rows.length) throw new NotFoundError('Vendor location not found');

  assertVendorScope(user, rows[0].vendorId);

  await db.delete(vendorLocations).where(eq(vendorLocations.id, id));
  return c.json({ success: true });
});

export default app;
