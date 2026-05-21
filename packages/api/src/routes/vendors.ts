import { Hono } from 'hono';
import { eq, like, desc, asc, sql, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { vendors } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { EmailService } from '../services/emailService';
import { requirePermission } from '../middleware/requirePermission';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function requireAdmin(user: any): void {
  if (user.userType !== 'ADMIN') throw new ForbiddenError('Admin access required');
}

// GET /vendors - List vendors
const VENDOR_SORT_COLUMNS: Record<string, any> = {
  name: vendors.name,
  email: vendors.email,
  city: vendors.city,
  state: vendors.state,
  createdAt: vendors.createdAt,
};

app.get('/', requirePermission('vendors', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');

  const { search, superVendorId, state, limit = '50', offset = '0', sortBy, sortOrder } = c.req.query();

  let conditions: any[] = [];

  if (user.superVendorId) {
    conditions.push(eq(vendors.superVendorId, user.superVendorId));
  }
  if (superVendorId) {
    conditions.push(eq(vendors.superVendorId, superVendorId));
  }
  if (search) {
    conditions.push(like(vendors.name, `%${search}%`));
  }
  if (state) {
    conditions.push(eq(vendors.state, state));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const sortCol = (sortBy && VENDOR_SORT_COLUMNS[sortBy]) || vendors.createdAt;
  const orderFn = sortOrder === 'asc' ? asc : desc;

  const [results, countResult] = await Promise.all([
    db.select().from(vendors)
      .where(whereClause as any)
      .orderBy(orderFn(sortCol))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` }).from(vendors).where(whereClause as any),
  ]);

  return c.json({ items: results, total: countResult[0]?.count ?? 0 });
});

// GET /vendors/:id
app.get('/:id', requirePermission('vendors', 'READ'), async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);

  if (!result.length) {
    throw new NotFoundError('Vendor not found');
  }

  // Vendor users can only view their own record
  if (user.userType === 'VENDOR' && result[0].id !== user.vendorId) {
    throw new ForbiddenError('Access denied');
  }
  // Super-vendor users can only view vendors in their network
  if (user.superVendorId && result[0].superVendorId !== user.superVendorId) {
    throw new ForbiddenError('Access denied');
  }

  return c.json(result[0]);
});

// POST /vendors - Create vendor (ADMIN only)
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);
  const body = await c.req.json();

  if (!body.name) {
    throw new ValidationError('Vendor name is required');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(vendors).values({
    id,
    ...body,
    modifiedOrders: 0,
    inProcessOrders: 0,
    cancelledOrders: 0,
    completedOrders: 0,
    unreadOrderCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);

  return c.json(result[0], 201);
});

// PUT /vendors/:id (ADMIN or own vendor)
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);

  if (!existing.length) {
    throw new NotFoundError('Vendor not found');
  }

  if (user.userType !== 'ADMIN' && id !== user.vendorId) {
    throw new ForbiddenError('Access denied');
  }

  await db
    .update(vendors)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(vendors.id, id));

  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.id, id))
    .limit(1);

  return c.json(result[0]);
});

// POST /vendors/onboard — create vendor + default admin user in one transaction (ADMIN only)
app.post('/onboard', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);

  const body = await c.req.json();
  if (!body.name) throw new ValidationError('Vendor name is required');
  if (!body.adminUser?.email) throw new ValidationError('Admin user email is required');

  const vendorId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Create vendor
  await db.insert(vendors).values({
    id: vendorId,
    name: body.name,
    npi: body.npi ?? null,
    address: body.address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
    phone: body.phone ?? null,
    billingEmail: body.billingEmail ?? null,
    modifiedOrders: 0,
    inProcessOrders: 0,
    cancelledOrders: 0,
    completedOrders: 0,
    unreadOrderCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Hash a temp password
  const tempPassword = `Temp${Math.random().toString(36).slice(2, 10)}!`;
  const { hashPassword } = await import('../services/authService');
  const passwordHash = await hashPassword(tempPassword);

  const adminId = crypto.randomUUID();
  const adminEmail = body.adminUser.email.toLowerCase().trim();

  await db.run(sql`
    INSERT INTO users (id, name, email, password, role, user_type, approval_status, user_status, must_change_password, vendor_id, failed_login_attempts, created_at, updated_at)
    VALUES (
      ${adminId}, ${`${body.adminUser.firstName ?? ''} ${body.adminUser.lastName ?? ''}`.trim()},
      ${adminEmail}, ${passwordHash}, 'ADMIN', 'VENDOR', 'APPROVED', 'ACTIVE', 1, ${vendorId}, 0, ${now}, ${now}
    )
  `);

  // Send welcome email
  if (c.env.RESEND_API_KEY) {
    try {
      const es = new EmailService(c.env.RESEND_API_KEY);
      await es.sendEmail({
        to: adminEmail,
        subject: 'Welcome to Curavend — Your vendor account is ready',
        html: `<p>Hi ${body.adminUser.firstName ?? ''},</p>
<p>Your Curavend vendor account for <strong>${body.name}</strong> has been created.</p>
<p>Login: <a href="https://curavend-web.pages.dev/login">curavend-web.pages.dev/login</a><br>
Email: ${adminEmail}<br>
Temporary password: <code>${tempPassword}</code></p>
<p>You will be asked to change your password on first login.</p>`,
      });
    } catch (err) {
      console.warn('[vendors/onboard] email failed:', err);
    }
  }

  return c.json({ success: true, vendorId, adminUserId: adminId }, 201);
});

// DELETE /vendors/:id (ADMIN only)
app.delete('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  requireAdmin(user);
  const { id } = c.req.param();
  const existing = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!existing.length) throw new NotFoundError('Vendor not found');
  await db.delete(vendors).where(eq(vendors.id, id));
  return c.json({ success: true });
});

export default app;
