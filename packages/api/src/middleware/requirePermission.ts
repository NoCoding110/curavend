import { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../lib/env';
import type { AuthUser } from './auth';
import { getDb } from '../lib/db';
import {
  userPermissions,
  PERMISSION_RESOURCES,
  PERMISSION_LEVEL_RANK,
  type PermissionResource,
  type PermissionLevel,
} from '@curavend/db';
import { resolveGroupPermissions } from '../services/groupResolver';

/**
 * Returns the default access level for a role/resource combination
 * when the user has no explicit user_permissions row and is not in any
 * group that grants this resource.
 *
 * Hospital managers and account managers never hit this helper — the
 * middleware short-circuits them to FULL before lookup.
 */
export function roleDefaultFor(role: string, resource: PermissionResource): PermissionLevel {
  switch (role) {
    case 'FACILITY_ACCOUNT_MANAGER':
    case 'ACCOUNT_MANAGER':
    case 'ACCOUNT_MANAGER_USER':
      return 'FULL';
    case 'FACILITY_USER':
      // Facility users get READ everywhere by default
      return 'READ';
    case 'PHYSICIAN':
      // Physicians: READ on their own orders & on the physician directory
      if (resource === 'orders' || resource === 'physicians') return 'READ';
      return 'NONE';
    case 'VENDOR_ACCOUNT_MANAGER':
    case 'VENDOR_USER':
    case 'SUPER_VENDOR':
      // Vendors can read and update orders assigned to them (confirm receipt, decline, dispatch, etc.)
      if (resource === 'orders') return 'WRITE';
      return 'NONE';
    case 'PROVIDER_EXECUTIVE_ADMIN':
    case 'PROVIDER_USER':
      return 'READ';
    default:
      return 'NONE';
  }
}

/** Pick the higher of two permission levels. */
function maxLevel(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  return PERMISSION_LEVEL_RANK[a] >= PERMISSION_LEVEL_RANK[b] ? a : b;
}

/**
 * Fine-grained permission guard. Must run AFTER authMiddleware.
 *
 * Effective level per resource = max(
 *   user_permissions[resource]  (explicit user override),
 *   user_group_permissions[*]   (any group the user is in, max wins),
 *   roleDefaultFor(role, resource)
 * )
 *
 * Usage:
 *   app.get('/', requirePermission('orders', 'READ'), handler)
 *   app.post('/', requirePermission('orders', 'WRITE'), handler)
 *   app.delete('/:id', requirePermission('orders', 'FULL'), handler)
 */
export const requirePermission = (
  resource: PermissionResource,
  min: PermissionLevel,
): MiddlewareHandler<{ Bindings: Env; Variables: { user: AuthUser } }> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated', code: 'UNAUTHORIZED' }, 401);
    }

    // Fast-path: platform admins and account managers always FULL
    if (user.userType === 'ADMIN') return next();
    if (
      user.role === 'FACILITY_ACCOUNT_MANAGER' ||
      user.role === 'ACCOUNT_MANAGER' ||
      user.role === 'ACCOUNT_MANAGER_USER'
    ) {
      return next();
    }

    const db = getDb(c.env.DB);

    // Three sources merge to the effective level for THIS resource.
    const [override, groupGrants] = await Promise.all([
      db
        .select()
        .from(userPermissions)
        .where(and(eq(userPermissions.userId, user.id), eq(userPermissions.resource, resource)))
        .limit(1),
      resolveGroupPermissions(db, user.id),
    ]);

    const explicit = (override[0]?.level as PermissionLevel | undefined) ?? null;
    const fromGroup = groupGrants[resource] ?? null;
    const fromRole = roleDefaultFor(user.role, resource);

    let effective: PermissionLevel = fromRole;
    if (explicit) effective = maxLevel(effective, explicit);
    if (fromGroup) effective = maxLevel(effective, fromGroup);

    if (PERMISSION_LEVEL_RANK[effective] < PERMISSION_LEVEL_RANK[min]) {
      return c.json(
        {
          error: `Requires ${min} permission on ${resource}`,
          code: 'FORBIDDEN',
        },
        403,
      );
    }

    await next();
  };
};

/**
 * Compute effective permissions for a user across ALL 8 resources.
 *
 * Used by GET /api/user-permissions/me to populate the frontend hook.
 * Returns a complete map (no missing keys) so the UI can render directly.
 */
export async function computeEffectivePermissions(
  db: ReturnType<typeof getDb>,
  user: AuthUser,
): Promise<Record<PermissionResource, PermissionLevel>> {
  const resources = PERMISSION_RESOURCES; // all 8

  // Fast-path full access
  if (
    user.userType === 'ADMIN' ||
    user.role === 'FACILITY_ACCOUNT_MANAGER' ||
    user.role === 'ACCOUNT_MANAGER' ||
    user.role === 'ACCOUNT_MANAGER_USER'
  ) {
    return Object.fromEntries(resources.map((r) => [r, 'FULL'])) as Record<
      PermissionResource,
      PermissionLevel
    >;
  }

  const [overrideRows, groupGrants] = await Promise.all([
    db.select().from(userPermissions).where(eq(userPermissions.userId, user.id)),
    resolveGroupPermissions(db, user.id),
  ]);

  const overrides = new Map<string, PermissionLevel>(
    overrideRows.map((r) => [r.resource, r.level as PermissionLevel]),
  );

  return Object.fromEntries(
    resources.map((r) => {
      const fromRole = roleDefaultFor(user.role, r);
      const fromOverride = overrides.get(r);
      const fromGroup = groupGrants[r];
      let level: PermissionLevel = fromRole;
      if (fromOverride) level = maxLevel(level, fromOverride);
      if (fromGroup) level = maxLevel(level, fromGroup);
      return [r, level];
    }),
  ) as Record<PermissionResource, PermissionLevel>;
}
