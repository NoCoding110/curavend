import { Hono } from 'hono';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import * as jose from 'jose';
import { users, hospitals, vendors, providers, superVendors } from '@curavend/db';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';
import { getDb } from '../lib/db';
import { AppError, ValidationError, UnauthorizedError, NotFoundError, ForbiddenError } from '../lib/errors';
import { rateLimit } from '../middleware/rateLimit';
import { turnstile } from '../middleware/turnstile';
import { EmailService } from '../services/emailService';
import {
  listMemberships,
  resolveMembership,
  resolveDefaultMembership,
  countMemberships,
  type MembershipSummary,
} from '../lib/membershipResolver';
import {
  verifyPassword,
  hashPassword,
  generateTokens,
  generateTemporaryToken,
  verifyTemporaryToken,
  verifyRefreshToken,
  generateMfaSecret,
  verifyMfaCode,
  generateResetCode,
} from '../services/authService';
import { logAuthEvent } from '../services/authAuditService';
import { sendOtpCode, verifyOtpCode, lookupUserMfaPref } from '../services/emailOtpService';
import type { EmailOtpPurpose } from '@curavend/db';

const authRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

function getClientIp(c: any): string | null {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? null;
}

// Sub-router error handler so AppErrors surface as structured JSON.
// Uses duck-typing to avoid bundler class-identity issues with instanceof.
authRoutes.onError((err, c) => {
  const e = err as any;
  // AppError subclasses carry statusCode + code; native errors (SyntaxError etc.) don't.
  if (e && typeof e.statusCode === 'number' && e.code) {
    return c.json({ error: e.message ?? 'Error', code: e.code }, e.statusCode as any);
  }
  // Surface native errors (bad JSON body etc.) as 400 rather than 500
  if (err instanceof SyntaxError) {
    return c.json({ error: 'Invalid JSON in request body', code: 'BAD_REQUEST' }, 400);
  }
  console.error('[auth-routes] Unhandled error:', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

/**
 * requireAuth — inline JWT verification for authRoutes handlers that need
 * authentication. The authRoutes router is mounted BEFORE the global
 * authMiddleware so `c.get('user')` is not set by the middleware chain;
 * handlers that need the caller's identity must call this directly.
 */
async function requireAuth(c: any): Promise<AuthUser> {
  const authHeader: string | undefined = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError();
  const token = authHeader.slice(7);
  try {
    const secret = new TextEncoder().encode(c.env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: ['HS256'] });
    if (!payload.sub || !payload.email || !payload.role || !payload.userType) {
      throw new UnauthorizedError();
    }
    return {
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
      userType: payload.userType as string,
      hospitalId: payload.hospitalId as string | undefined,
      vendorId: payload.vendorId as string | undefined,
      providerId: payload.providerId as string | undefined,
      superVendorId: payload.superVendorId as string | undefined,
      hasAgreedToPHIAccess: payload.hasAgreedToPHIAccess as number | undefined,
    };
  } catch {
    throw new UnauthorizedError();
  }
}

// ─── Validation Schemas ─────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1, 'MFA token is required'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// Password must be ≥12 chars, with uppercase, lowercase, digit, and special char
const strongPassword = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be 6 digits'),
  newPassword: strongPassword,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: strongPassword,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── POST /auth/login ───────────────────────────────────────────────────────

authRoutes.post('/login', turnstile(), async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { email, password } = parsed.data;
  const db = getDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1).then(r => r[0] ?? null);

  if (!user) {
    // Don't reveal whether the email exists
    void logAuthEvent(c.env, { event: 'LOGIN_FAILURE', userEmail: email.toLowerCase(), ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.userStatus !== 'ACTIVE') {
    void logAuthEvent(c.env, { event: 'LOGIN_FAILURE', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent'), metadata: { reason: 'ACCOUNT_INACTIVE' } });
    throw new UnauthorizedError('Account is deactivated. Contact your administrator.');
  }

  // Check account lockout (5 failures → locked for 15 minutes)
  const MAX_FAILURES = 5;
  const LOCKOUT_MINUTES = 15;
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const remaining = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
    void logAuthEvent(c.env, { event: 'LOGIN_BLOCKED_LOCKED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent'), metadata: { remainingMinutes: remaining } });
    throw new UnauthorizedError(`Account temporarily locked. Try again in ${remaining} minute${remaining === 1 ? '' : 's'}.`);
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockUntil = attempts >= MAX_FAILURES
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;
    await db.run(sql`
      UPDATE users SET
        failed_login_attempts = ${attempts},
        locked_until = ${lockUntil},
        updated_at = ${new Date().toISOString()}
      WHERE id = ${user.id}
    `);
    void logAuthEvent(c.env, { event: 'LOGIN_FAILURE', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent'), metadata: { failedAttempts: attempts } });
    if (lockUntil) {
      void logAuthEvent(c.env, { event: 'ACCOUNT_LOCKED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent'), metadata: { lockedUntil: lockUntil } });
    }
    throw new UnauthorizedError('Invalid email or password');
  }

  // Successful login — reset lockout counters
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      lastLoggedInAt: user.currentLoggedInAt,
      currentLoggedInAt: now,
      timedOut: 0,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));
  // Reset lockout separately via raw SQL to avoid Drizzle null-coercion issues
  await db.run(sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ${user.id}`);

  void logAuthEvent(c.env, { event: 'LOGIN_SUCCESS', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });

  // Check if user must change password
  if (user.mustChangePassword) {
    return c.json({
      requiresPasswordChange: true,
      userId: user.id,
      message: 'Password change required',
    });
  }

  // Check if MFA is enabled (all users who have enrolled)
  if (user.mfaEnabled && user.mfaSecret) {
    const mfaToken = await generateTemporaryToken(user.id, c.env.JWT_SECRET);
    void logAuthEvent(c.env, { event: 'MFA_CHALLENGE', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });
    return c.json({
      requiresMfa: true,
      mfaToken,
      message: 'MFA verification required',
    });
  }

  // Phase F — membership-aware login.
  // If the user belongs to multiple tenants, return a partial token + the
  // memberships list so the frontend can show a picker. Otherwise auto-pick
  // their single (or default) membership and issue full tokens normally.
  const membershipCount = await countMemberships(db, user.id);

  if (membershipCount > 1) {
    const memberships = await listMemberships(db, user.id);
    const enriched = await enrichMembershipLabels(db, memberships);
    const partialToken = await generateTemporaryToken(user.id, c.env.JWT_SECRET);
    return c.json({
      requiresMembershipSelection: true,
      memberships: enriched,
      partialToken,
    });
  }

  // Single (or zero) membership → auto-select. Falls back to legacy user
  // columns if the membership table happens to be empty (e.g. backfill skipped).
  const active = (await resolveDefaultMembership(db, user.id)) ?? {
    membershipId: '',
    tenantType: 'HOSPITAL' as const,
    tenantId: user.hospitalId ?? '',
    role: user.role,
    hospitalId: user.hospitalId,
    vendorId: user.vendorId,
    providerId: user.providerId,
    superVendorId: user.superVendorId,
  };

  const tokens = await generateTokens(
    {
      id: user.id,
      email: user.email,
      role: active.role,
      userType: user.userType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      hasAgreedToPHIAccess: user.hasAgreedToPHIAccess,
    },
    c.env.JWT_SECRET,
    c.env.JWT_REFRESH_SECRET,
  );

  return c.json({
    ...tokens,
    mfaSetupRequired: user.userType === 'ADMIN' && !user.mfaEnabled,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: active.role,
      userType: user.userType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      activeMembershipId: active.membershipId || null,
    },
  });
});

// ─── POST /auth/select-membership ───────────────────────────────────────────
// Called after login when the user had >1 memberships and the frontend
// showed a picker. Verifies the partial token, the chosen membership belongs
// to this user, then issues full tokens scoped to that membership.

authRoutes.post('/select-membership', async (c) => {
  const body = await c.req.json();
  if (!body?.partialToken) throw new ValidationError('partialToken is required');
  if (!body?.membershipId) throw new ValidationError('membershipId is required');

  const db = getDb(c.env.DB);
  let userId: string;
  try {
    userId = await verifyTemporaryToken(body.partialToken, c.env.JWT_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired partial token');
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then((r) => r[0]);
  if (!user) throw new NotFoundError('User not found');

  const active = await resolveMembership(db, userId, body.membershipId);
  if (!active) throw new ForbiddenError('Membership not found or not yours');

  const tokens = await generateTokens(
    {
      id: user.id,
      email: user.email,
      role: active.role,
      // Use the membership's tenantType as userType so every downstream
      // API scope-check (orders, approvals, etc.) reflects the active org,
      // not the stale value from users.userType.
      userType: active.tenantType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      hasAgreedToPHIAccess: user.hasAgreedToPHIAccess,
    },
    c.env.JWT_SECRET,
    c.env.JWT_REFRESH_SECRET,
  );

  return c.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: active.role,
      userType: active.tenantType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      activeMembershipId: active.membershipId,
    },
  });
});

// ─── POST /auth/switch-membership ───────────────────────────────────────────
// Authenticated endpoint — re-issues a JWT scoped to a different membership
// the user already has. Causes the frontend to re-render under the new
// tenant context.

authRoutes.post('/switch-membership', async (c) => {
  const authUser = await requireAuth(c);

  const body = await c.req.json();
  if (!body?.membershipId) throw new ValidationError('membershipId is required');

  const db = getDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1).then((r) => r[0]);
  if (!user) throw new NotFoundError('User not found');

  const active = await resolveMembership(db, user.id, body.membershipId);
  if (!active) throw new ForbiddenError('Membership not found or not yours');

  const tokens = await generateTokens(
    {
      id: user.id,
      email: user.email,
      role: active.role,
      // Use the membership's tenantType so every downstream scope-check
      // reflects the active org, not the static users.userType column.
      userType: active.tenantType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      hasAgreedToPHIAccess: user.hasAgreedToPHIAccess,
    },
    c.env.JWT_SECRET,
    c.env.JWT_REFRESH_SECRET,
  );

  return c.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: active.role,
      userType: active.tenantType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      activeMembershipId: active.membershipId,
    },
  });
});

// ─── GET /auth/memberships ──────────────────────────────────────────────────
// List the current user's memberships (for the in-app TenantSwitcher).

authRoutes.get('/memberships', async (c) => {
  const authUser = await requireAuth(c);

  const db = getDb(c.env.DB);
  const memberships = await listMemberships(db, authUser.id);
  const enriched = await enrichMembershipLabels(db, memberships);
  return c.json({ items: enriched });
});

// Helper: enrich membership rows with a human-readable display label
// (hospital / vendor / provider name). Single batched query per tenant type.
async function enrichMembershipLabels(
  db: ReturnType<typeof getDb>,
  rows: MembershipSummary[],
): Promise<MembershipSummary[]> {
  if (rows.length === 0) return rows;

  const idsByType: Record<string, Set<string>> = {};
  for (const r of rows) {
    if (!idsByType[r.tenantType]) idsByType[r.tenantType] = new Set();
    idsByType[r.tenantType].add(r.tenantId);
  }

  const labelsByType: Record<string, Record<string, string>> = {};

  if (idsByType.HOSPITAL?.size) {
    const hr = await db.select({ id: hospitals.id, name: hospitals.name }).from(hospitals);
    labelsByType.HOSPITAL = Object.fromEntries(hr.map((r) => [r.id, r.name ?? r.id]));
  }
  if (idsByType.VENDOR?.size) {
    const vr = await db.select({ id: vendors.id, name: vendors.name }).from(vendors);
    labelsByType.VENDOR = Object.fromEntries(vr.map((r) => [r.id, r.name ?? r.id]));
  }
  if (idsByType.PROVIDER?.size) {
    const pr = await db.select({ id: providers.id, name: providers.name }).from(providers);
    labelsByType.PROVIDER = Object.fromEntries(pr.map((r) => [r.id, r.name ?? r.id]));
  }
  if (idsByType.SUPER_VENDOR?.size) {
    const sr = await db.select({ id: superVendors.id, name: superVendors.name }).from(superVendors);
    labelsByType.SUPER_VENDOR = Object.fromEntries(sr.map((r) => [r.id, r.name ?? r.id]));
  }

  return rows.map((r) => ({
    ...r,
    label: labelsByType[r.tenantType]?.[r.tenantId] ?? r.tenantId.slice(0, 8) + '…',
  }));
}

// ─── POST /auth/mfa/init-setup ─────────────────────────────────────────────
// Called after login returns requiresMfaSetup. Accepts the mfaSetupToken
// (a temporary token) and returns the QR code — no full access token needed.

authRoutes.post('/mfa/init-setup', async (c) => {
  const body = await c.req.json();
  if (!body.mfaSetupToken) {
    throw new ValidationError('mfaSetupToken is required');
  }

  const db = getDb(c.env.DB);

  let userId: string;
  try {
    userId = await verifyTemporaryToken(body.mfaSetupToken, c.env.JWT_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired setup token');
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
  if (!user) throw new NotFoundError('User not found');
  if (user.mfaEnabled) throw new ValidationError('MFA is already enabled');

  const mfaResult = generateMfaSecret(user.email);

  await db.update(users).set({
    mfaSecret: mfaResult.secret,
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, user.id));

  return c.json({
    secret: mfaResult.secret,
    uri: mfaResult.uri,
    qrCodeUrl: mfaResult.qrCodeUrl,
    // Frontend should then call POST /auth/mfa/verify with the same mfaSetupToken
    mfaSetupToken: body.mfaSetupToken,
  });
});

// ─── POST /auth/mfa/setup ───────────────────────────────────────────────────

authRoutes.post('/mfa/setup', async (c) => {
  const authUser = c.get('user');
  if (!authUser) {
    throw new UnauthorizedError();
  }

  const db = getDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1).then(r => r[0] ?? null);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.mfaEnabled) {
    throw new ValidationError('MFA is already enabled');
  }

  const mfaResult = generateMfaSecret(user.email);

  // Store the secret (not yet enabled until verified)
  await db
    .update(users)
    .set({
      mfaSecret: mfaResult.secret,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  return c.json({
    secret: mfaResult.secret,
    uri: mfaResult.uri,
    qrCodeUrl: mfaResult.qrCodeUrl,
  });
});

// ─── POST /auth/mfa/verify ─────────────────────────────────────────────────

// 5 MFA attempts per IP per 60 seconds
authRoutes.post('/mfa/verify', rateLimit({ limit: 5, windowSeconds: 60, prefix: 'rl:mfa' }), async (c) => {
  const body = await c.req.json();
  const parsed = mfaVerifySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { mfaToken, code } = parsed.data;
  const db = getDb(c.env.DB);

  // Verify the temporary MFA token
  let userId: string;
  try {
    userId = await verifyTemporaryToken(mfaToken, c.env.JWT_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired MFA token');
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);

  if (!user || !user.mfaSecret) {
    throw new UnauthorizedError('MFA not configured');
  }

  const valid = verifyMfaCode(user.mfaSecret, code);
  if (!valid) {
    void logAuthEvent(c.env, { event: 'MFA_FAILURE', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });
    throw new UnauthorizedError('Invalid MFA code');
  }

  void logAuthEvent(c.env, { event: 'MFA_SUCCESS', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });

  // If MFA was not yet enabled (first-time setup), enable it now
  if (!user.mfaEnabled) {
    await db
      .update(users)
      .set({
        mfaEnabled: 1,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, user.id));
  }

  // Phase F — same membership-aware branch as /login. If multiple
  // memberships, hand off to the picker; otherwise auto-select.
  const membershipCount = await countMemberships(db, user.id);
  if (membershipCount > 1) {
    const memberships = await listMemberships(db, user.id);
    const enriched = await enrichMembershipLabels(db, memberships);
    const partialToken = await generateTemporaryToken(user.id, c.env.JWT_SECRET);
    return c.json({
      requiresMembershipSelection: true,
      memberships: enriched,
      partialToken,
    });
  }

  const active = (await resolveDefaultMembership(db, user.id)) ?? {
    membershipId: '',
    role: user.role,
    hospitalId: user.hospitalId,
    vendorId: user.vendorId,
    providerId: user.providerId,
    superVendorId: user.superVendorId,
  };

  const tokens = await generateTokens(
    {
      id: user.id,
      email: user.email,
      role: active.role,
      userType: user.userType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      hasAgreedToPHIAccess: user.hasAgreedToPHIAccess,
    },
    c.env.JWT_SECRET,
    c.env.JWT_REFRESH_SECRET,
  );

  return c.json({
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: active.role,
      userType: user.userType,
      providerId: active.providerId,
      hospitalId: active.hospitalId,
      vendorId: active.vendorId,
      superVendorId: active.superVendorId,
      activeMembershipId: active.membershipId || null,
    },
  });
});

// ─── POST /auth/forgot-password ─────────────────────────────────────────────

// 5 password reset requests per IP per 15 minutes
authRoutes.post('/forgot-password', turnstile(), rateLimit({ limit: 5, windowSeconds: 900, prefix: 'rl:forgot' }), async (c) => {
  const body = await c.req.json();
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { email } = parsed.data;
  const db = getDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1).then(r => r[0] ?? null);

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ message: 'If an account exists, a reset code has been sent.' });
  }

  const code = generateResetCode();

  // Store the reset code in KV with 15-minute TTL
  await c.env.KV.put(`reset:${user.id}`, code, { expirationTtl: 900 });

  // Send the email
  const emailService = new EmailService(c.env.RESEND_API_KEY);
  await emailService.sendPasswordResetEmail(user.email, code);

  void logAuthEvent(c.env, { event: 'PASSWORD_RESET_REQUESTED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });

  return c.json({ message: 'If an account exists, a reset code has been sent.' });
});

// ─── POST /auth/reset-password ──────────────────────────────────────────────

authRoutes.post('/reset-password', turnstile(), async (c) => {
  const body = await c.req.json();
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { email, code, newPassword } = parsed.data;
  const db = getDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1).then(r => r[0] ?? null);

  if (!user) {
    throw new UnauthorizedError('Invalid reset request');
  }

  // Verify the code from KV
  const storedCode = await c.env.KV.get(`reset:${user.id}`);
  if (!storedCode || storedCode !== code) {
    void logAuthEvent(c.env, { event: 'PASSWORD_RESET_FAILED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });
    throw new UnauthorizedError('Invalid or expired reset code');
  }

  // Hash new password and update — also clear any lockout
  const newHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({
      passwordHash: newHash,
      mustChangePassword: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));
  // Clear lockout counters via raw SQL to avoid Drizzle null-coercion issues
  await db.run(sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ${user.id}`);

  // Delete the used code
  await c.env.KV.delete(`reset:${user.id}`);

  void logAuthEvent(c.env, { event: 'PASSWORD_RESET_COMPLETED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });

  return c.json({ message: 'Password reset successfully' });
});

// ─── POST /auth/unlock-account ──────────────────────────────────────────────
// Emergency unlock: clears failed_login_attempts and locked_until for a user.
// Protected by the raw JWT_SECRET in the Authorization header so only someone
// with server-side access can call it.
// Usage:  POST /api/auth/unlock-account  { "email": "user@example.com" }
//         Authorization: Bearer <JWT_SECRET value>

authRoutes.post('/unlock-account', async (c) => {
  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== c.env.JWT_SECRET) {
    return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!body?.email) {
    return c.json({ error: 'email is required', code: 'VALIDATION_ERROR' }, 400);
  }

  const db = getDb(c.env.DB);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, (body.email as string).toLowerCase()))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!user) {
    return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404);
  }

  await db.run(
    sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, user_status = 'ACTIVE', updated_at = ${new Date().toISOString()} WHERE id = ${user.id}`,
  );

  void logAuthEvent(c.env, { event: 'ACCOUNT_UNLOCKED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c) });

  return c.json({ success: true, message: `Account unlocked for ${user.email}` });
});

// ─── POST /auth/change-password (authenticated) ────────────────────────────

authRoutes.post('/change-password', async (c) => {
  const authUser = c.get('user');
  if (!authUser) {
    throw new UnauthorizedError();
  }

  const body = await c.req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { currentPassword, newPassword } = parsed.data;
  const db = getDb(c.env.DB);

  const user = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1).then(r => r[0] ?? null);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const passwordValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!passwordValid) {
    void logAuthEvent(c.env, { event: 'PASSWORD_CHANGE_FAILED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });
    throw new UnauthorizedError('Current password is incorrect');
  }

  if (currentPassword === newPassword) {
    throw new ValidationError('New password must be different from current password');
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({
      passwordHash: newHash,
      mustChangePassword: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  void logAuthEvent(c.env, { event: 'PASSWORD_CHANGED', userId: user.id, userEmail: user.email, ipAddress: getClientIp(c), userAgent: c.req.header('User-Agent') });

  return c.json({ message: 'Password changed successfully' });
});

// ─── POST /auth/refresh ─────────────────────────────────────────────────────

authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json();
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message);
  }

  const { refreshToken } = parsed.data;
  const db = getDb(c.env.DB);

  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken, c.env.JWT_REFRESH_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const userId = payload.sub;
  if (!userId) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);

  if (!user || user.userStatus !== 'ACTIVE') {
    throw new UnauthorizedError('Account not found or deactivated');
  }

  const tokens = await generateTokens(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      userType: user.userType,
      providerId: user.providerId,
      hospitalId: user.hospitalId,
      vendorId: user.vendorId,
      superVendorId: user.superVendorId,
      hasAgreedToPHIAccess: user.hasAgreedToPHIAccess,
    },
    c.env.JWT_SECRET,
    c.env.JWT_REFRESH_SECRET,
  );

  return c.json(tokens);
});

// ─── Email OTP MFA ─────────────────────────────────────────────────────────

const emailOtpSendSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['MFA_LOGIN', 'EMAIL_VERIFY', 'STEP_UP', 'PASSWORD_RESET']),
});

const emailOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  purpose: z.enum(['MFA_LOGIN', 'EMAIL_VERIFY', 'STEP_UP', 'PASSWORD_RESET']),
});

authRoutes.post('/email-otp/send', rateLimit({ limit: 5, windowSeconds: 600, prefix: 'rl:email-otp-send' }), async (c) => {
  const body = await c.req.json();
  const parsed = emailOtpSendSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const ip = c.req.header('CF-Connecting-IP') ?? null;
  const userInfo = await lookupUserMfaPref(c.env, parsed.data.email);
  const result = await sendOtpCode(c.env, {
    userId: userInfo?.userId ?? null,
    email: parsed.data.email,
    purpose: parsed.data.purpose as EmailOtpPurpose,
    ipAddress: ip,
  });
  c.executionCtx.waitUntil(logAuthEvent(c.env, {
    event: 'MFA_CHALLENGE',
    userId: userInfo?.userId ?? null,
    userEmail: parsed.data.email,
    ipAddress: ip,
    userAgent: c.req.header('User-Agent') ?? null,
    metadata: { method: 'email_otp', purpose: parsed.data.purpose, codeId: result.codeId },
  }));
  return c.json({ success: true, codeId: result.codeId, expiresAt: result.expiresAt });
});

authRoutes.post('/email-otp/verify', rateLimit({ limit: 10, windowSeconds: 300, prefix: 'rl:email-otp-verify' }), async (c) => {
  const body = await c.req.json();
  const parsed = emailOtpVerifySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const ip = c.req.header('CF-Connecting-IP') ?? null;
  const ua = c.req.header('User-Agent') ?? null;
  const result = await verifyOtpCode(c.env, {
    email: parsed.data.email,
    code: parsed.data.code,
    purpose: parsed.data.purpose as EmailOtpPurpose,
  });
  if (!result.ok) {
    c.executionCtx.waitUntil(logAuthEvent(c.env, {
      event: 'MFA_FAILURE',
      userEmail: parsed.data.email,
      ipAddress: ip,
      userAgent: ua,
      metadata: { method: 'email_otp', reason: result.reason },
    }));
    throw new UnauthorizedError(`Email OTP verification failed: ${result.reason}`);
  }
  c.executionCtx.waitUntil(logAuthEvent(c.env, {
    event: 'MFA_SUCCESS',
    userId: result.userId,
    userEmail: parsed.data.email,
    ipAddress: ip,
    userAgent: ua,
    metadata: { method: 'email_otp', purpose: parsed.data.purpose },
  }));
  // For MFA_LOGIN purpose, issue a short-lived step token; the client then
  // calls /select-membership (or whatever the next step requires) to get
  // the full access+refresh JWT pair.
  const stepToken = await generateTemporaryToken(result.userId ?? parsed.data.email, c.env.JWT_SECRET);
  return c.json({ success: true, stepToken, userId: result.userId });
});

export default authRoutes;
