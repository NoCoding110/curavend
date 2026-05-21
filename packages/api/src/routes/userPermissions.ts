import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  userPermissions,
  users,
  PERMISSION_RESOURCES,
  PERMISSION_LEVELS,
  type PermissionResource,
  type PermissionLevel,
} from '@curavend/db';
import { ValidationError, ForbiddenError, NotFoundError } from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { computeEffectivePermissions, roleDefaultFor } from '../middleware/requirePermission';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

/**
 * GET /api/user-permissions/me
 * Returns the caller's effective permissions map. Used by the
 * frontend usePermissions() hook for UI gating.
 */
app.get('/me', async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get('user');
  const perms = await computeEffectivePermissions(db, user);
  return c.json(perms);
});

/**
 * GET /api/user-permissions?userId=U
 * Hospital Manager reads a target user's permission rows.
 */
app.get('/', rbac('FACILITY_ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { userId } = c.req.query();
  if (!userId) throw new ValidationError('userId query param is required');

  await assertSameHospital(db, caller, userId);

  // Fetch target user to know their role (for defaults)
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new NotFoundError('User not found');

  const rows = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));

  const overrides = new Map<string, PermissionLevel>(
    rows.map((r) => [r.resource, r.level as PermissionLevel]),
  );

  const effective = Object.fromEntries(
    PERMISSION_RESOURCES.map((r) => [r, overrides.get(r) ?? roleDefaultFor(target.role, r)]),
  ) as Record<PermissionResource, PermissionLevel>;

  return c.json({
    userId,
    role: target.role,
    overrides: Object.fromEntries(overrides) as Partial<Record<PermissionResource, PermissionLevel>>,
    effective,
  });
});

/**
 * PUT /api/user-permissions/:userId
 * Bulk upsert. Body: { facilities?: 'READ', orders?: 'FULL', ... }
 * Setting a resource to NONE removes any override (reverting to role default).
 */
app.put('/:userId', rbac('FACILITY_ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { userId } = c.req.param();
  const body = (await c.req.json()) as Partial<Record<PermissionResource, PermissionLevel>>;

  await assertSameHospital(db, caller, userId);

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new NotFoundError('User not found');

  // Validate body
  const toDelete: PermissionResource[] = [];
  const toUpsert: { resource: PermissionResource; level: PermissionLevel }[] = [];
  for (const [resource, level] of Object.entries(body)) {
    if (!PERMISSION_RESOURCES.includes(resource as PermissionResource)) {
      throw new ValidationError(`Invalid resource: ${resource}`);
    }
    if (!PERMISSION_LEVELS.includes(level as PermissionLevel)) {
      throw new ValidationError(`Invalid level for ${resource}: ${level}`);
    }
    if (level === 'NONE') {
      toDelete.push(resource as PermissionResource);
    } else {
      toUpsert.push({ resource: resource as PermissionResource, level: level as PermissionLevel });
    }
  }

  const now = new Date().toISOString();
  const hospitalId = target.hospitalId ?? caller.hospitalId ?? '';

  // Delete rows for NONE requests
  if (toDelete.length) {
    await db
      .delete(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, userId),
          inArray(userPermissions.resource, toDelete),
        ),
      );
  }

  // Upsert each new level
  for (const { resource, level } of toUpsert) {
    const existing = await db
      .select()
      .from(userPermissions)
      .where(
        and(eq(userPermissions.userId, userId), eq(userPermissions.resource, resource)),
      )
      .limit(1);

    if (existing.length) {
      await db
        .update(userPermissions)
        .set({ level, updatedAt: now, grantedBy: caller.id, hospitalId })
        .where(eq(userPermissions.id, existing[0].id));
    } else {
      await db.insert(userPermissions).values({
        id: crypto.randomUUID(),
        userId,
        hospitalId,
        resource,
        level,
        grantedBy: caller.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Return the fresh effective map
  const rows = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  const overrides = new Map<string, PermissionLevel>(
    rows.map((r) => [r.resource, r.level as PermissionLevel]),
  );
  const effective = Object.fromEntries(
    PERMISSION_RESOURCES.map((r) => [r, overrides.get(r) ?? roleDefaultFor(target.role, r)]),
  ) as Record<PermissionResource, PermissionLevel>;

  return c.json({ userId, effective });
});

/**
 * DELETE /api/user-permissions/:userId/:resource
 * Remove a single override (revert to role default).
 */
app.delete(
  '/:userId/:resource',
  rbac('FACILITY_ACCOUNT_MANAGER', 'ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'),
  async (c) => {
    const db = getDb(c.env.DB);
    const caller = c.get('user');
    const { userId, resource } = c.req.param();

    if (!PERMISSION_RESOURCES.includes(resource as PermissionResource)) {
      throw new ValidationError(`Invalid resource: ${resource}`);
    }

    await assertSameHospital(db, caller, userId);

    await db
      .delete(userPermissions)
      .where(
        and(
          eq(userPermissions.userId, userId),
          eq(userPermissions.resource, resource),
        ),
      );

    return c.json({ success: true });
  },
);

/**
 * Ensure the target user shares a hospital with the caller. Platform
 * ADMINs and ACCOUNT_MANAGERs bypass this check.
 */
async function assertSameHospital(
  db: ReturnType<typeof getDb>,
  caller: AuthUser,
  targetUserId: string,
) {
  if (caller.userType === 'ADMIN') return;
  if (caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER') return;

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw new NotFoundError('User not found');
  if (!caller.hospitalId || target.hospitalId !== caller.hospitalId) {
    throw new ForbiddenError('Cannot manage permissions for users outside your hospital');
  }
}

export default app;
