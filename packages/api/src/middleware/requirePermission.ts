import { MiddlewareHandler } from 'hono';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../lib/env';
import type { AuthUser } from './auth';
import { getDb } from '../lib/db';
import {
  userPermissions,
  PERMISSION_LEVEL_RANK,
  type PermissionResource,
  type PermissionLevel,
} from '@curavend/db';

/**
 * Returns the default access level for a role/resource combination
 * when the user has no explicit user_permissions row.
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

/**
 * Fine-grained permission guard. Must run AFTER authMiddleware.
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
    const row = await db
      .select()
      .from(userPermissions)
      .where(and(eq(userPermissions.userId, user.id), eq(userPermissions.resource, resource)))
      .limit(1);

    const effective: PermissionLevel =
      (row[0]?.level as PermissionLevel | undefined) ?? roleDefaultFor(user.role, resource);

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
 * Compute effective permissions for a user (all resources).
 * Used by GET /api/user-permissions/me to populate frontend hook.
 */
export async function computeEffectivePermissions(
  db: ReturnType<typeof getDb>,
  user: AuthUser,
): Promise<Record<PermissionResource, PermissionLevel>> {
  const resources: PermissionResource[] = [
    'facilities',
    'departments',
    'physicians',
    'orders',
    'vendors',
  ];

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

  const rows = await db
    .select()
    .from(userPermissions)
    .where(eq(userPermissions.userId, user.id));

  const overrides = new Map<string, PermissionLevel>(
    rows.map((r) => [r.resource, r.level as PermissionLevel]),
  );

  return Object.fromEntries(
    resources.map((r) => [r, overrides.get(r) ?? roleDefaultFor(user.role, r)]),
  ) as Record<PermissionResource, PermissionLevel>;
}
