import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, like, sql, desc, asc } from 'drizzle-orm';
import { users } from '@curavend/db';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { getDb } from '../lib/db';
import { rbac, requireUserType } from '../middleware/rbac';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors';
import { hashPassword } from '../services/authService';
import { EmailService } from '../services/emailService';
import { getNextValue } from '../services/sequenceService';
import { nanoid } from 'nanoid';

const userRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional(),
  contact: z.string().optional(),
  streetAddress: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  userType: z.enum(['ADMIN', 'HOSPITAL', 'VENDOR']),
  role: z.enum([
    'ACCOUNT_MANAGER',
    'FACILITY_ACCOUNT_MANAGER',
    'FACILITY_USER',
    'VENDOR_ACCOUNT_MANAGER',
    'VENDOR_USER',
    'PROVIDER_EXECUTIVE_ADMIN',
    'PROVIDER_USER',
    'ACCOUNT_MANAGER_USER',
    'SUPER_VENDOR',
    'PHYSICIAN',
  ]),
  providerId: z.string().optional(),
  hospitalId: z.string().optional(),
  vendorId: z.string().optional(),
  superVendorId: z.string().optional(),
  subscriptionPlanId: z.string().optional(),
  npiNumber: z.string().optional(),
  specialty: z.string().optional(),
  licenseNumber: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().optional(),
  contact: z.string().optional(),
  streetAddress: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  role: z
    .enum([
      'ACCOUNT_MANAGER',
      'FACILITY_ACCOUNT_MANAGER',
      'FACILITY_USER',
      'VENDOR_ACCOUNT_MANAGER',
      'VENDOR_USER',
      'PROVIDER_EXECUTIVE_ADMIN',
      'PROVIDER_USER',
      'ACCOUNT_MANAGER_USER',
      'SUPER_VENDOR',
      'PHYSICIAN',
    ])
    .optional(),
  subscriptionPlanId: z.string().nullable().optional(),
  npiNumber: z.string().optional(),
  specialty: z.string().optional(),
  licenseNumber: z.string().optional(),
});

const updateStatusSchema = z.object({
  userStatus: z.enum(['ACTIVE', 'INACTIVE']),
});

const notificationSettingsSchema = z.object({
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  orderUpdates: z.boolean(),
  invoiceUpdates: z.boolean(),
  chatMessages: z.boolean(),
  supportTickets: z.boolean(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  userType: z.enum(['ADMIN', 'HOSPITAL', 'VENDOR']).optional(),
  userStatus: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  role: z.string().optional(),
  sortBy: z.enum(['name', 'email', 'specialty', 'userStatus', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const USER_SORT_COLUMNS: Record<string, any> = {
  name: users.name,
  email: users.email,
  specialty: users.specialty,
  userStatus: users.userStatus,
  createdAt: users.createdAt,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build where conditions based on the requesting user's scope.
 * Admins see all. Facility admins see their hospital/provider users.
 * Vendor admins see their vendor users.
 */
function buildScopeFilter(authUser: AuthUser) {
  switch (authUser.role) {
    case 'ACCOUNT_MANAGER':
    case 'ACCOUNT_MANAGER_USER':
      // Admin: no additional filter (sees all)
      return undefined;

    case 'PROVIDER_EXECUTIVE_ADMIN':
    case 'PROVIDER_USER':
      // Provider-scoped: see users in same provider
      return authUser.providerId
        ? eq(users.providerId, authUser.providerId)
        : eq(users.id, authUser.id);

    case 'FACILITY_ACCOUNT_MANAGER':
    case 'FACILITY_USER':
    case 'PHYSICIAN':
      // Hospital-scoped: see users in same hospital
      return authUser.hospitalId
        ? eq(users.hospitalId, authUser.hospitalId)
        : eq(users.id, authUser.id);

    case 'VENDOR_ACCOUNT_MANAGER':
    case 'VENDOR_USER':
      // Vendor-scoped: see users in same vendor
      return authUser.vendorId
        ? eq(users.vendorId, authUser.vendorId)
        : eq(users.id, authUser.id);

    case 'SUPER_VENDOR':
      return authUser.superVendorId
        ? eq(users.superVendorId, authUser.superVendorId)
        : eq(users.id, authUser.id);

    default:
      // Fallback: only see self
      return eq(users.id, authUser.id);
  }
}

function canManageUser(authUser: AuthUser, targetUser: typeof users.$inferSelect): boolean {
  // Admins can manage anyone
  if (['ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'].includes(authUser.role)) {
    return true;
  }
  // Provider executive admins can manage users in their provider
  if (
    authUser.role === 'PROVIDER_EXECUTIVE_ADMIN' &&
    authUser.providerId &&
    targetUser.providerId === authUser.providerId
  ) {
    return true;
  }
  // Facility account managers can manage users in their hospital
  if (
    authUser.role === 'FACILITY_ACCOUNT_MANAGER' &&
    authUser.hospitalId &&
    targetUser.hospitalId === authUser.hospitalId
  ) {
    return true;
  }
  // Vendor account managers can manage users in their vendor
  if (
    authUser.role === 'VENDOR_ACCOUNT_MANAGER' &&
    authUser.vendorId &&
    targetUser.vendorId === authUser.vendorId
  ) {
    return true;
  }
  // Super vendors can manage users in their super vendor org
  if (
    authUser.role === 'SUPER_VENDOR' &&
    authUser.superVendorId &&
    targetUser.superVendorId === authUser.superVendorId
  ) {
    return true;
  }
  // Users can manage themselves
  return authUser.id === targetUser.id;
}

/**
 * Generate a random temporary password.
 */
function generateTempPassword(): string {
  // 12-char alphanumeric + symbols
  return nanoid(12);
}

// ─── GET /users/me ──────────────────────────────────────────────────────────

userRoutes.get('/me', async (c) => {
  const authUser = c.get('user');
  const db = getDb(c.env.DB);

  const userRow = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1).then(r => r[0] ?? null);

  if (!userRow) {
    throw new NotFoundError('User not found');
  }

  const { passwordHash: _ph, mfaSecret: _ms, ...user } = userRow;
  return c.json({ user });
});

// ─── GET /users ─────────────────────────────────────────────────────────────

userRoutes.get('/', async (c) => {
  const authUser = c.get('user');
  const db = getDb(c.env.DB);

  const query = listQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new ValidationError(query.error.issues[0].message);
  }

  const { page, limit, search, userType, userStatus, role, sortBy, sortOrder } = query.data;
  const offset = (page - 1) * limit;
  const sortCol = (sortBy && USER_SORT_COLUMNS[sortBy]) || users.createdAt;
  const orderFn = sortOrder === 'asc' ? asc : desc;

  // Build conditions
  const conditions = [];
  const scopeFilter = buildScopeFilter(authUser);
  if (scopeFilter) conditions.push(scopeFilter);
  if (userType) conditions.push(eq(users.userType, userType));
  if (userStatus) conditions.push(eq(users.userStatus, userStatus));
  if (role) conditions.push(eq(users.role, role));
  if (search) {
    conditions.push(
      sql`(${users.name} LIKE ${`%${search}%`} OR ${users.email} LIKE ${`%${search}%`})`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rawUserList, countResult] = await Promise.all([
    db.select().from(users).where(where).orderBy(orderFn(sortCol)).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(where),
  ]);

  const userList = rawUserList.map(({ passwordHash: _ph, mfaSecret: _ms, ...u }) => u);
  const total = countResult[0]?.count ?? 0;

  return c.json({
    users: userList,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ─── GET /users/:id ─────────────────────────────────────────────────────────

userRoutes.get('/:id', async (c) => {
  const authUser = c.get('user');
  const db = getDb(c.env.DB);
  const id = c.req.param('id');

  const fullUser = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0] ?? null);

  if (!fullUser) {
    throw new NotFoundError('User not found');
  }

  if (!canManageUser(authUser, fullUser)) {
    throw new ForbiddenError('You do not have access to this user');
  }

  const { passwordHash: _ph, mfaSecret: _ms, ...user } = fullUser;
  return c.json({ user });
});

// ─── POST /users ────────────────────────────────────────────────────────────

userRoutes.post(
  '/',
  rbac(
    'ACCOUNT_MANAGER',
    'ACCOUNT_MANAGER_USER',
    'FACILITY_ACCOUNT_MANAGER',
    'VENDOR_ACCOUNT_MANAGER',
    'PROVIDER_EXECUTIVE_ADMIN',
    'SUPER_VENDOR',
  ),
  async (c) => {
    const authUser = c.get('user');
    const db = getDb(c.env.DB);

    const body = await c.req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const data = parsed.data;

    // Check for existing email
    const existing = await db.select().from(users).where(eq(users.email, data.email.toLowerCase())).limit(1).then(r => r[0] ?? null);
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Scope enforcement: non-admins can only create users within their org
    if (!['ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'].includes(authUser.role)) {
      if (data.userType === 'HOSPITAL' && data.hospitalId !== authUser.hospitalId) {
        throw new ForbiddenError('Cannot create users outside your facility');
      }
      if (data.userType === 'VENDOR' && data.vendorId !== authUser.vendorId) {
        throw new ForbiddenError('Cannot create users outside your vendor organization');
      }
    }

    // Generate temporary password
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();

    // Set the account manager to the creating user (if applicable)
    const accountManagerId =
      ['ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'].includes(authUser.role)
        ? authUser.id
        : authUser.id;

    await db.insert(users).values({
      id: userId,
      email: data.email.toLowerCase(),
      passwordHash,
      name: data.name,
      title: data.title ?? null,
      contact: data.contact ?? null,
      streetAddress: data.streetAddress ?? null,
      state: data.state ?? null,
      city: data.city ?? null,
      zip: data.zip ?? null,
      userType: data.userType,
      role: data.role,
      userStatus: 'ACTIVE',
      accountManagerId,
      step: 'WELCOME_EMAIL',
      mustChangePassword: 1,
      mfaEnabled: 0,
      providerId: data.providerId ?? null,
      hospitalId: data.hospitalId ?? null,
      vendorId: data.vendorId ?? null,
      superVendorId: data.superVendorId ?? null,
      subscriptionPlanId: data.subscriptionPlanId ?? null,
      npiNumber: (data as any).npiNumber ?? null,
      specialty: (data as any).specialty ?? null,
      licenseNumber: (data as any).licenseNumber ?? null,
      createdAt: now,
      updatedAt: now,
    });

    // Send welcome email with temp password
    const emailService = new EmailService(c.env.RESEND_API_KEY);
    await emailService.sendWelcomeEmail({
      email: data.email.toLowerCase(),
      name: data.name,
      tempPassword,
    });

    // Fetch the created user (without sensitive fields)
    const createdRow = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
    const { passwordHash: _ph2, mfaSecret: _ms2, ...createdUser } = createdRow ?? {} as any;

    return c.json({ user: createdUser }, 201);
  },
);

// ─── PUT /users/:id ─────────────────────────────────────────────────────────

userRoutes.put('/:id', async (c) => {
  const authUser = c.get('user');
  const db = getDb(c.env.DB);
  const id = c.req.param('id');

  const body = await c.req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const targetUser = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0] ?? null);

  if (!targetUser) {
    throw new NotFoundError('User not found');
  }

  if (!canManageUser(authUser, targetUser)) {
    throw new ForbiddenError('You do not have permission to update this user');
  }

  const data = parsed.data;
  await db
    .update(users)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.contact !== undefined && { contact: data.contact }),
      ...(data.streetAddress !== undefined && { streetAddress: data.streetAddress }),
      ...(data.state !== undefined && { state: data.state }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.zip !== undefined && { zip: data.zip }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.subscriptionPlanId !== undefined && {
        subscriptionPlanId: data.subscriptionPlanId,
      }),
      ...((data as any).npiNumber !== undefined && { npiNumber: (data as any).npiNumber }),
      ...((data as any).specialty !== undefined && { specialty: (data as any).specialty }),
      ...((data as any).licenseNumber !== undefined && { licenseNumber: (data as any).licenseNumber }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, id));

  const updatedRow = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0] ?? null);
  const { passwordHash: _ph3, mfaSecret: _ms3, ...updatedUser } = updatedRow ?? {} as any;

  return c.json({ user: updatedUser });
});

// ─── PUT /users/:id/status ──────────────────────────────────────────────────

userRoutes.put(
  '/:id/status',
  rbac(
    'ACCOUNT_MANAGER',
    'ACCOUNT_MANAGER_USER',
    'FACILITY_ACCOUNT_MANAGER',
    'VENDOR_ACCOUNT_MANAGER',
    'PROVIDER_EXECUTIVE_ADMIN',
    'SUPER_VENDOR',
  ),
  async (c) => {
    const authUser = c.get('user');
    const db = getDb(c.env.DB);
    const id = c.req.param('id');

    const body = await c.req.json();
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0].message);
    }

    const targetUser = await db.select().from(users).where(eq(users.id, id)).limit(1).then(r => r[0] ?? null);

    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    if (!canManageUser(authUser, targetUser)) {
      throw new ForbiddenError('You do not have permission to change this user status');
    }

    // Prevent self-deactivation
    if (id === authUser.id && parsed.data.userStatus === 'INACTIVE') {
      throw new ValidationError('You cannot deactivate your own account');
    }

    await db
      .update(users)
      .set({
        userStatus: parsed.data.userStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    return c.json({
      message: `User ${parsed.data.userStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`,
    });
  },
);

// ─── PUT /users/:id/notification-settings ───────────────────────────────────

userRoutes.put('/:id/notification-settings', async (c) => {
  const authUser = c.get('user');
  const db = getDb(c.env.DB);
  const id = c.req.param('id');

  const body = await c.req.json();
  const parsed = notificationSettingsSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  // Users can only update their own notification settings
  if (id !== authUser.id) {
    throw new ForbiddenError('You can only update your own notification settings');
  }

  // Store notification settings in KV keyed by user ID
  await c.env.KV.put(
    `notification_settings:${id}`,
    JSON.stringify(parsed.data),
  );

  return c.json({ message: 'Notification settings updated', settings: parsed.data });
});

// POST /users/:id/phi-consent — log PHI consent acknowledgment
userRoutes.post('/:id/phi-consent', async (c) => {
  const db = getDb(c.env.DB);
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const ua = c.req.header('user-agent') ?? null;
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;

  await db.run(sql`
    INSERT INTO phi_consent_log (id, user_id, ip_address, user_agent, acknowledged_at)
    VALUES (${crypto.randomUUID()}, ${id}, ${ip}, ${ua}, ${now})
  `);

  await db.update(users).set({ hasAgreedToPHIAccess: 1, updatedAt: now }).where(eq(users.id, id));
  return c.json({ success: true, acknowledgedAt: now });
});

// DELETE /users/:id — soft-delete (set userStatus=INACTIVE)
userRoutes.delete(
  '/:id',
  rbac('ACCOUNT_MANAGER', 'FACILITY_ACCOUNT_MANAGER', 'VENDOR_ACCOUNT_MANAGER', 'PROVIDER_EXECUTIVE_ADMIN', 'SUPER_VENDOR'),
  async (c) => {
    const db = getDb(c.env.DB);
    const { id } = c.req.param();
    const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing.length) throw new NotFoundError('User not found');
    await db
      .update(users)
      .set({ userStatus: 'INACTIVE', updatedAt: new Date().toISOString() })
      .where(eq(users.id, id));
    return c.json({ success: true });
  },
);

export default userRoutes;
