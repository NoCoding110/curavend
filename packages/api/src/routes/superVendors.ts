/**
 * Super Vendor routes — parent org that owns multiple Vendor companies.
 * A SuperVendor is the corporate entity; individual Vendors are its subsidiaries.
 */
import { Hono } from 'hono';
import { eq, like, desc, sql, and } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { superVendors, vendors, users } from '@curavend/db';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { EmailService } from '../services/emailService';
import type { Env } from '../lib/env';

const app = new Hono<{ Bindings: Env; Variables: { user: any } }>();

// GET /super-vendors
app.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { search, limit = '50', offset = '0' } = c.req.query();

  const conditions: any[] = [];
  // SUPER_VENDOR users can only see their own org
  if (user.superVendorId) {
    conditions.push(eq(superVendors.id, user.superVendorId));
  }
  if (search) {
    conditions.push(like(superVendors.name, `%${search}%`));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  const [rows, countRows] = await Promise.all([
    db.select().from(superVendors)
      .where(whereClause)
      .orderBy(desc(superVendors.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` }).from(superVendors).where(whereClause),
  ]);

  return c.json({ items: rows, total: countRows[0]?.count ?? 0 });
});

// GET /super-vendors/:id
app.get('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  // Non-admin SUPER_VENDOR users can only view their own record
  if (user.superVendorId && user.superVendorId !== id) {
    throw new ForbiddenError('Access denied');
  }

  const rows = await db.select().from(superVendors).where(eq(superVendors.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Super vendor not found');

  // Include subsidiary vendors
  const subsidiaries = await db
    .select({ id: vendors.id, name: vendors.name, state: vendors.state, city: vendors.city })
    .from(vendors)
    .where(eq(vendors.superVendorId, id));

  return c.json({ ...rows[0], vendors: subsidiaries });
});

// POST /super-vendors — create new super vendor org (admin only)
app.post('/', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();
  if (!body.name) throw new ValidationError('name required');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(superVendors).values({
    id,
    name: body.name,
    ein: body.ein ?? null,
    physicalStreetAddress: body.physicalStreetAddress ?? null,
    physicalCity: body.physicalCity ?? null,
    physicalState: body.physicalState ?? null,
    physicalZip: body.physicalZip ?? null,
    mailingStreetAddress: body.mailingStreetAddress ?? null,
    mailingCity: body.mailingCity ?? null,
    mailingState: body.mailingState ?? null,
    mailingZip: body.mailingZip ?? null,
    billingStreetAddress: body.billingStreetAddress ?? null,
    billingCity: body.billingCity ?? null,
    billingState: body.billingState ?? null,
    billingZip: body.billingZip ?? null,
    primaryAccountName: body.primaryAccountName ?? null,
    primaryAccountEmail: body.primaryAccountEmail ?? null,
    primaryAccountContact: body.primaryAccountContact ?? null,
    primaryAccountTitle: body.primaryAccountTitle ?? null,
    accountsPayable: body.accountsPayable ?? null,
    supplyChain: body.supplyChain ?? null,
    otherContact: body.otherContact ?? null,
    otherContacts: body.otherContacts ? JSON.stringify(body.otherContacts) : null,
    subscriptionPlanId: body.subscriptionPlanId ?? null,
    billingCycle: body.billingCycle ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ id }, 201);
});

// PUT /super-vendors/:id
app.put('/:id', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  if (user.userType !== 'ADMIN' && user.superVendorId !== id) {
    throw new ForbiddenError('Access denied');
  }

  const rows = await db.select().from(superVendors).where(eq(superVendors.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Super vendor not found');

  const body = await c.req.json();
  const now = new Date().toISOString();
  const updateFields: any = { updatedAt: now };

  const allowed = [
    'name', 'ein', 'physicalStreetAddress', 'physicalCity', 'physicalState', 'physicalZip',
    'mailingStreetAddress', 'mailingCity', 'mailingState', 'mailingZip',
    'billingStreetAddress', 'billingCity', 'billingState', 'billingZip',
    'primaryAccountName', 'primaryAccountEmail', 'primaryAccountContact', 'primaryAccountTitle',
    'accountsPayable', 'supplyChain', 'otherContact', 'subscriptionPlanId', 'billingCycle',
  ];
  for (const field of allowed) {
    if (body[field] !== undefined) updateFields[field] = body[field];
  }
  if (body.otherContacts !== undefined) {
    updateFields.otherContacts = Array.isArray(body.otherContacts)
      ? JSON.stringify(body.otherContacts)
      : body.otherContacts;
  }
  if (body.notificationSettings !== undefined) {
    updateFields.notificationSettings = typeof body.notificationSettings === 'object'
      ? JSON.stringify(body.notificationSettings)
      : body.notificationSettings;
  }

  await db.update(superVendors).set(updateFields).where(eq(superVendors.id, id));
  return c.json({ success: true });
});

// DELETE /super-vendors/:id — admin only
app.delete('/:id', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const rows = await db.select({ id: superVendors.id }).from(superVendors).where(eq(superVendors.id, id)).limit(1);
  if (!rows.length) throw new NotFoundError('Super vendor not found');

  // Disassociate subsidiary vendors (do not delete them)
  await db.run(sql`UPDATE vendors SET super_vendor_id = NULL WHERE super_vendor_id = ${id}`);
  await db.delete(superVendors).where(eq(superVendors.id, id));
  return c.json({ success: true });
});

// GET /super-vendors/:id/vendors — list subsidiary vendors
app.get('/:id/vendors', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const { id } = c.req.param();

  if (user.superVendorId && user.superVendorId !== id) throw new ForbiddenError('Access denied');

  const rows = await db.select().from(vendors).where(eq(vendors.superVendorId, id));
  return c.json({ items: rows, total: rows.length });
});

// POST /super-vendors/:id/vendors/:vendorId — assign a vendor to a super vendor
app.post('/:id/vendors/:vendorId', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id, vendorId } = c.req.param();

  const [sv, v] = await Promise.all([
    db.select({ id: superVendors.id }).from(superVendors).where(eq(superVendors.id, id)).limit(1),
    db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId)).limit(1),
  ]);
  if (!sv.length) throw new NotFoundError('Super vendor not found');
  if (!v.length) throw new NotFoundError('Vendor not found');

  await db.run(sql`UPDATE vendors SET super_vendor_id = ${id}, updated_at = ${new Date().toISOString()} WHERE id = ${vendorId}`);
  return c.json({ success: true });
});

// DELETE /super-vendors/:id/vendors/:vendorId — remove vendor from super vendor
app.delete('/:id/vendors/:vendorId', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { vendorId } = c.req.param();
  await db.run(sql`UPDATE vendors SET super_vendor_id = NULL, updated_at = ${new Date().toISOString()} WHERE id = ${vendorId}`);
  return c.json({ success: true });
});

// POST /super-vendors/:id/onboard — create a super vendor with an admin user in one step
app.post('/:id/invite-admin', rbac('ACCOUNT_MANAGER'), async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json();
  if (!body.email) throw new ValidationError('email required');

  const sv = await db.select().from(superVendors).where(eq(superVendors.id, id)).limit(1);
  if (!sv.length) throw new NotFoundError('Super vendor not found');

  // Check for existing user
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
  if (existing.length) throw new ValidationError('A user with this email already exists');

  const tempPassword = Math.random().toString(36).slice(2, 10) + 'A1!';
  const { hashPassword } = await import('../services/authService');
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(sql`
    INSERT INTO users (id, email, password_hash, name, user_type, role, super_vendor_id, approval_status, user_status, must_change_password, created_at, updated_at)
    VALUES (${userId}, ${body.email}, ${await hashPassword(tempPassword)}, ${body.name ?? null}, 'VENDOR', 'SUPER_VENDOR', ${id}, 'APPROVED', 'ACTIVE', 1, ${now}, ${now})
  `);

  if (c.env.RESEND_API_KEY) {
    const es = new EmailService(c.env.RESEND_API_KEY);
    await es.sendEmail({
      to: body.email,
      subject: `Welcome to Curavend — ${sv[0].name}`,
      html: `<p>You have been added as an admin for <strong>${sv[0].name}</strong> on Curavend.<br>
      Temporary password: <strong>${tempPassword}</strong><br>
      Sign in at <a href="https://curavend-web.pages.dev">Curavend</a> and change your password on first login.</p>`,
    });
  }

  return c.json({ userId, superVendorId: id }, 201);
});

export default app;
