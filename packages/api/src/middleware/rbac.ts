import { MiddlewareHandler } from 'hono';
import type { Env } from '../lib/env';
import type { AuthUser } from './auth';

/**
 * Role-based access control middleware.
 * Restricts route access to the specified roles.
 *
 * Usage: app.get('/admin-only', rbac('ACCOUNT_MANAGER', 'ACCOUNT_MANAGER_USER'), handler)
 */
export const rbac = (
  ...allowedRoles: string[]
): MiddlewareHandler<{ Bindings: Env; Variables: { user: AuthUser } }> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated', code: 'UNAUTHORIZED' }, 401);
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return c.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, 403);
    }
    await next();
  };
};

/**
 * User-type access control middleware.
 * Restricts route access to the specified user types.
 *
 * Usage: app.get('/hospital-only', requireUserType('HOSPITAL'), handler)
 */
export const requireUserType = (
  ...types: string[]
): MiddlewareHandler<{ Bindings: Env; Variables: { user: AuthUser } }> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Not authenticated', code: 'UNAUTHORIZED' }, 401);
    }
    if (types.length > 0 && !types.includes(user.userType)) {
      return c.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, 403);
    }
    await next();
  };
};
