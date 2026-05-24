/**
 * groupResolver — single source of truth for "what groups is this user in,
 * what does each grant?".
 *
 * Used by:
 *   - middleware/requirePermission.ts → merges group grants into the
 *     effective permissions map (max-of grants per resource)
 *   - services/notificationRouter.ts  → fans `GROUP` recipient type out to
 *     the group's members
 *   - routes/userGroups.ts            → reads for management UI
 *
 * Tenant scoping: each group belongs to exactly ONE tenant (HOSPITAL /
 * VENDOR / PROVIDER / SUPER_VENDOR / ADMIN). Cross-tenant groups are out
 * of scope per the plan.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  userGroups,
  userGroupMembers,
  userGroupPermissions,
  PERMISSION_LEVEL_RANK,
  type PermissionResource,
  type PermissionLevel,
  type UserGroupTenantType,
} from '@curavend/db';

export interface ResolvedGroup {
  id: string;
  name: string;
  groupKind: string;
  tenantType: UserGroupTenantType;
  tenantId: string | null;
  facilityId: string | null;
  departmentId: string | null;
  vendorLocationId: string | null;
  isSystemDefault: boolean;
  permissions: Partial<Record<PermissionResource, PermissionLevel>>;
}

/**
 * Return every group `userId` belongs to, with its permission grants
 * already projected onto a per-resource map.
 */
export async function listGroupsForUser(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<ResolvedGroup[]> {
  // 1. memberships → group ids
  const memberships = await db
    .select({ groupId: userGroupMembers.userGroupId })
    .from(userGroupMembers)
    .where(eq(userGroupMembers.userId, userId));

  if (memberships.length === 0) return [];
  const groupIds = memberships.map((m) => m.groupId);

  // 2. group rows
  const groups = await db
    .select()
    .from(userGroups)
    .where(inArray(userGroups.id, groupIds));

  // 3. permission rows for those groups
  const perms = await db
    .select()
    .from(userGroupPermissions)
    .where(inArray(userGroupPermissions.userGroupId, groupIds));

  const permsByGroup = new Map<string, Partial<Record<PermissionResource, PermissionLevel>>>();
  for (const p of perms) {
    const map = permsByGroup.get(p.userGroupId) ?? {};
    map[p.resource as PermissionResource] = p.level as PermissionLevel;
    permsByGroup.set(p.userGroupId, map);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    groupKind: g.groupKind,
    tenantType: g.tenantType as UserGroupTenantType,
    tenantId: g.tenantId,
    facilityId: g.facilityId,
    departmentId: g.departmentId,
    vendorLocationId: g.vendorLocationId,
    isSystemDefault: g.isSystemDefault === 1,
    permissions: permsByGroup.get(g.id) ?? {},
  }));
}

/**
 * List every group in a tenant (for the management UI). Caller is
 * responsible for RBAC + tenant-scoping checks before invoking.
 */
export async function listGroupsInTenant(
  db: ReturnType<typeof getDb>,
  tenantType: UserGroupTenantType,
  tenantId: string | null,
): Promise<ResolvedGroup[]> {
  // Drizzle eq() on a NULL value compares to NULL — fine for ADMIN groups.
  const where =
    tenantId == null
      ? and(eq(userGroups.tenantType, tenantType))
      : and(eq(userGroups.tenantType, tenantType), eq(userGroups.tenantId, tenantId));
  const groups = await db.select().from(userGroups).where(where);
  if (groups.length === 0) return [];
  const groupIds = groups.map((g) => g.id);

  const perms = await db
    .select()
    .from(userGroupPermissions)
    .where(inArray(userGroupPermissions.userGroupId, groupIds));
  const permsByGroup = new Map<string, Partial<Record<PermissionResource, PermissionLevel>>>();
  for (const p of perms) {
    const map = permsByGroup.get(p.userGroupId) ?? {};
    map[p.resource as PermissionResource] = p.level as PermissionLevel;
    permsByGroup.set(p.userGroupId, map);
  }

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    groupKind: g.groupKind,
    tenantType: g.tenantType as UserGroupTenantType,
    tenantId: g.tenantId,
    facilityId: g.facilityId,
    departmentId: g.departmentId,
    vendorLocationId: g.vendorLocationId,
    isSystemDefault: g.isSystemDefault === 1,
    permissions: permsByGroup.get(g.id) ?? {},
  }));
}

/**
 * Collapse all of a user's group grants into one per-resource map by
 * taking the MAX level per resource. Resources that no group grants are
 * absent from the result (caller falls back to user_permissions / role
 * defaults).
 */
export async function resolveGroupPermissions(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<Partial<Record<PermissionResource, PermissionLevel>>> {
  const groups = await listGroupsForUser(db, userId);
  if (groups.length === 0) return {};

  const merged: Partial<Record<PermissionResource, PermissionLevel>> = {};
  for (const g of groups) {
    for (const [resource, level] of Object.entries(g.permissions) as Array<
      [PermissionResource, PermissionLevel]
    >) {
      const current = merged[resource];
      if (!current || PERMISSION_LEVEL_RANK[level] > PERMISSION_LEVEL_RANK[current]) {
        merged[resource] = level;
      }
    }
  }
  return merged;
}

/**
 * Return user IDs that should receive a notification targeted at
 * `groupId`. The caller is responsible for tenant-scoping the group ID
 * (we don't validate it here).
 */
export async function resolveGroupRecipients(
  db: ReturnType<typeof getDb>,
  groupId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: userGroupMembers.userId })
    .from(userGroupMembers)
    .where(eq(userGroupMembers.userGroupId, groupId));
  return rows.map((r) => r.userId);
}

/**
 * For the explainability UI: per resource, list which groups contributed
 * what level. Used by `GET /user-permissions/me` to show "this came from
 * group X" labels.
 */
export async function explainGroupContributions(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<Record<string, Array<{ groupId: string; groupName: string; level: PermissionLevel }>>> {
  const groups = await listGroupsForUser(db, userId);
  const out: Record<string, Array<{ groupId: string; groupName: string; level: PermissionLevel }>> = {};
  for (const g of groups) {
    for (const [resource, level] of Object.entries(g.permissions) as Array<
      [PermissionResource, PermissionLevel]
    >) {
      (out[resource] ??= []).push({ groupId: g.id, groupName: g.name, level });
    }
  }
  return out;
}
