/**
 * /api/user-groups — generic user-group management for hospitals,
 * vendors, providers, super-vendors, and platform admins.
 *
 * Tenant scoping rules:
 *   - ADMIN userType / ACCOUNT_MANAGER role can manage any tenant's groups.
 *   - Hospital managers can only see/manage HOSPITAL groups for their hospital.
 *   - Vendor managers can only see/manage VENDOR groups for their vendor.
 *   - Provider managers — same for PROVIDER.
 *
 * Groups can grant permissions; members inherit (max-of) via
 * requirePermission middleware. They can also be notification targets
 * (`notification_preferences.recipient_group_id`).
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../lib/db';
import {
  userGroups,
  userGroupMembers,
  userGroupPermissions,
  users,
  notificationPreferences,
  PERMISSION_RESOURCES,
  PERMISSION_LEVELS,
  USER_GROUP_KINDS,
  USER_GROUP_TENANT_TYPES,
  type PermissionResource,
  type PermissionLevel,
  type UserGroupTenantType,
  type UserGroupKind,
} from '@curavend/db';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../lib/errors';
import { rbac } from '../middleware/rbac';
import { listGroupsInTenant, resolveGroupRecipients } from '../services/groupResolver';
import type { Env } from '../lib/env';
import type { AuthUser } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

const MANAGER_ROLES = [
  'ACCOUNT_MANAGER',
  'ACCOUNT_MANAGER_USER',
  'FACILITY_ACCOUNT_MANAGER',
  'VENDOR_ACCOUNT_MANAGER',
  'PROVIDER_EXECUTIVE_ADMIN',
  'SUPER_VENDOR',
] as const;

/**
 * Resolve the tenant context the caller is allowed to operate on.
 * Returns null for "platform-wide" (admin only).
 */
function callerTenant(caller: AuthUser): { tenantType: UserGroupTenantType; tenantId: string | null } {
  if (caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER') {
    // Platform admins default to ADMIN scope but can be redirected via query string in the list endpoint.
    return { tenantType: 'ADMIN', tenantId: null };
  }
  if (caller.hospitalId) return { tenantType: 'HOSPITAL', tenantId: caller.hospitalId };
  if (caller.vendorId) return { tenantType: 'VENDOR', tenantId: caller.vendorId };
  if (caller.providerId) return { tenantType: 'PROVIDER', tenantId: caller.providerId };
  if (caller.superVendorId) return { tenantType: 'SUPER_VENDOR', tenantId: caller.superVendorId };
  throw new ForbiddenError('Caller has no tenant context');
}

/**
 * Assert that `groupId` belongs to a tenant the caller can manage.
 * Platform admins pass automatically.
 */
async function assertGroupAccess(
  db: ReturnType<typeof getDb>,
  caller: AuthUser,
  groupId: string,
): Promise<{ id: string; tenantType: string; tenantId: string | null; isSystemDefault: number; name: string }> {
  const [group] = await db.select().from(userGroups).where(eq(userGroups.id, groupId)).limit(1);
  if (!group) throw new NotFoundError('Group not found');

  if (caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER') {
    return group;
  }

  const { tenantType, tenantId } = callerTenant(caller);
  if (group.tenantType !== tenantType || group.tenantId !== tenantId) {
    throw new ForbiddenError('Group belongs to a different tenant');
  }
  return group;
}

/**
 * GET /api/user-groups
 * List groups in caller's tenant. Admin/ACCOUNT_MANAGER may pass
 * `?tenantType=&tenantId=` to inspect any tenant.
 */
app.get('/', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { tenantType: qType, tenantId: qId } = c.req.query();

  let tenantType: UserGroupTenantType;
  let tenantId: string | null;

  if (
    qType &&
    (caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER')
  ) {
    if (!USER_GROUP_TENANT_TYPES.includes(qType as UserGroupTenantType)) {
      throw new ValidationError(`Invalid tenantType: ${qType}`);
    }
    tenantType = qType as UserGroupTenantType;
    tenantId = qId ?? null;
  } else {
    const ctx = callerTenant(caller);
    tenantType = ctx.tenantType;
    tenantId = ctx.tenantId;
  }

  const groups = await listGroupsInTenant(db, tenantType, tenantId);

  // Annotate each with its member count
  if (groups.length === 0) return c.json({ items: [] });
  const groupIds = groups.map((g) => g.id);
  const counts = await db
    .select({
      groupId: userGroupMembers.userGroupId,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(userGroupMembers)
    .where(inArray(userGroupMembers.userGroupId, groupIds))
    .groupBy(userGroupMembers.userGroupId);
  const countMap = new Map(counts.map((r) => [r.groupId, Number(r.cnt)]));
  return c.json({
    items: groups.map((g) => ({ ...g, memberCount: countMap.get(g.id) ?? 0 })),
  });
});

/**
 * POST /api/user-groups
 * Create a new group in the caller's tenant.
 */
app.post('/', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    groupKind?: string;
    facilityId?: string;
    departmentId?: string;
    vendorLocationId?: string;
    tenantType?: string;
    tenantId?: string;
  };

  if (!body.name?.trim()) throw new ValidationError('name is required');
  const groupKind = (body.groupKind ?? 'COMPOSITE') as UserGroupKind;
  if (!USER_GROUP_KINDS.includes(groupKind)) {
    throw new ValidationError(`Invalid groupKind: ${body.groupKind}`);
  }

  let tenantType: UserGroupTenantType;
  let tenantId: string | null;
  if (
    body.tenantType &&
    (caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER')
  ) {
    if (!USER_GROUP_TENANT_TYPES.includes(body.tenantType as UserGroupTenantType)) {
      throw new ValidationError(`Invalid tenantType: ${body.tenantType}`);
    }
    tenantType = body.tenantType as UserGroupTenantType;
    tenantId = body.tenantId ?? null;
  } else {
    const ctx = callerTenant(caller);
    tenantType = ctx.tenantType;
    tenantId = ctx.tenantId;
  }

  // Uniqueness pre-check (the index also enforces this)
  const dupes = await db
    .select()
    .from(userGroups)
    .where(
      and(
        eq(userGroups.tenantType, tenantType),
        tenantId == null ? sql`${userGroups.tenantId} IS NULL` : eq(userGroups.tenantId, tenantId),
        eq(userGroups.name, body.name.trim()),
      ),
    )
    .limit(1);
  if (dupes.length) throw new ConflictError(`A group named "${body.name}" already exists`);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(userGroups).values({
    id,
    tenantType,
    tenantId,
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    groupKind,
    facilityId: body.facilityId ?? null,
    departmentId: body.departmentId ?? null,
    vendorLocationId: body.vendorLocationId ?? null,
    isSystemDefault: 0,
    createdBy: caller.id,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(userGroups).where(eq(userGroups.id, id)).limit(1);
  return c.json({ ...row, isSystemDefault: row.isSystemDefault === 1, memberCount: 0, permissions: {} }, 201);
});

/**
 * GET /api/user-groups/:id — full detail + members + permissions
 */
app.get('/:id', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  const group = await assertGroupAccess(db, caller, id);

  const [members, perms] = await Promise.all([
    db
      .select({
        userId: userGroupMembers.userId,
        addedAt: userGroupMembers.addedAt,
        addedBy: userGroupMembers.addedBy,
        name: users.name,
        email: users.email,
        role: users.role,
        userType: users.userType,
      })
      .from(userGroupMembers)
      .leftJoin(users, eq(users.id, userGroupMembers.userId))
      .where(eq(userGroupMembers.userGroupId, id)),
    db.select().from(userGroupPermissions).where(eq(userGroupPermissions.userGroupId, id)),
  ]);

  const permissions: Partial<Record<PermissionResource, PermissionLevel>> = {};
  for (const p of perms) permissions[p.resource as PermissionResource] = p.level as PermissionLevel;

  return c.json({
    ...group,
    isSystemDefault: group.isSystemDefault === 1,
    members,
    memberCount: members.length,
    permissions,
  });
});

/**
 * PUT /api/user-groups/:id — rename / edit scope
 */
app.put('/:id', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  const group = await assertGroupAccess(db, caller, id);
  const body = (await c.req.json()) as {
    name?: string;
    description?: string;
    groupKind?: string;
    facilityId?: string | null;
    departmentId?: string | null;
    vendorLocationId?: string | null;
  };

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.name != null) {
    if (!body.name.trim()) throw new ValidationError('name cannot be empty');
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) patch.description = body.description?.trim() ?? null;
  if (body.groupKind != null) {
    if (!USER_GROUP_KINDS.includes(body.groupKind as UserGroupKind)) {
      throw new ValidationError(`Invalid groupKind: ${body.groupKind}`);
    }
    patch.groupKind = body.groupKind;
  }
  if (body.facilityId !== undefined) patch.facilityId = body.facilityId;
  if (body.departmentId !== undefined) patch.departmentId = body.departmentId;
  if (body.vendorLocationId !== undefined) patch.vendorLocationId = body.vendorLocationId;

  await db.update(userGroups).set(patch).where(eq(userGroups.id, id));
  return c.json({ id, updated: true });
});

/**
 * DELETE /api/user-groups/:id — cascade-deletes members + permissions.
 * 409 if `is_system_default=1` to protect seeded "Procurement Team" rows.
 */
app.delete('/:id', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  const group = await assertGroupAccess(db, caller, id);
  if (group.isSystemDefault === 1) {
    throw new ConflictError('Cannot delete a system-default group');
  }

  // Unset any notification_preferences pointing at this group so we don't leave dangling FKs.
  await db
    .update(notificationPreferences)
    .set({ recipientGroupId: null, isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(notificationPreferences.recipientGroupId, id));

  await db.delete(userGroupPermissions).where(eq(userGroupPermissions.userGroupId, id));
  await db.delete(userGroupMembers).where(eq(userGroupMembers.userGroupId, id));
  await db.delete(userGroups).where(eq(userGroups.id, id));
  return c.json({ id, deleted: true });
});

/**
 * POST /api/user-groups/:id/members — body { userIds: string[] }
 * Idempotent: unique index drops duplicates.
 */
app.post('/:id/members', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  const group = await assertGroupAccess(db, caller, id);
  const body = (await c.req.json()) as { userIds?: string[] };
  if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
    throw new ValidationError('userIds (non-empty array) is required');
  }

  // Verify each user exists and (for non-admin callers) belongs to caller's tenant.
  const targets = await db.select().from(users).where(inArray(users.id, body.userIds));
  if (targets.length !== body.userIds.length) {
    throw new ValidationError('One or more userIds not found');
  }
  if (!(caller.userType === 'ADMIN' || caller.role === 'ACCOUNT_MANAGER' || caller.role === 'ACCOUNT_MANAGER_USER')) {
    for (const u of targets) {
      const sameHospital = caller.hospitalId && u.hospitalId === caller.hospitalId;
      const sameVendor = caller.vendorId && u.vendorId === caller.vendorId;
      const sameProvider = caller.providerId && u.providerId === caller.providerId;
      const sameSuperVendor = caller.superVendorId && u.superVendorId === caller.superVendorId;
      if (!sameHospital && !sameVendor && !sameProvider && !sameSuperVendor) {
        throw new ForbiddenError(`User ${u.email} is in a different tenant`);
      }
    }
  }

  const now = new Date().toISOString();
  const inserted: string[] = [];
  for (const userId of body.userIds) {
    // Skip if already a member
    const existing = await db
      .select({ id: userGroupMembers.id })
      .from(userGroupMembers)
      .where(and(eq(userGroupMembers.userGroupId, id), eq(userGroupMembers.userId, userId)))
      .limit(1);
    if (existing.length) continue;
    await db.insert(userGroupMembers).values({
      id: crypto.randomUUID(),
      userGroupId: id,
      userId,
      addedBy: caller.id,
      addedAt: now,
    });
    inserted.push(userId);
  }
  return c.json({ groupId: id, addedUserIds: inserted });
});

/**
 * DELETE /api/user-groups/:id/members/:userId
 */
app.delete('/:id/members/:userId', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id, userId } = c.req.param();
  await assertGroupAccess(db, caller, id);
  await db
    .delete(userGroupMembers)
    .where(and(eq(userGroupMembers.userGroupId, id), eq(userGroupMembers.userId, userId)));
  return c.json({ groupId: id, removedUserId: userId });
});

/**
 * GET /api/user-groups/:id/permissions
 */
app.get('/:id/permissions', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  await assertGroupAccess(db, caller, id);
  const rows = await db.select().from(userGroupPermissions).where(eq(userGroupPermissions.userGroupId, id));
  const permissions: Record<PermissionResource, PermissionLevel> = Object.fromEntries(
    PERMISSION_RESOURCES.map((r) => [r, 'NONE']),
  ) as Record<PermissionResource, PermissionLevel>;
  for (const r of rows) permissions[r.resource as PermissionResource] = r.level as PermissionLevel;
  return c.json({ groupId: id, permissions });
});

/**
 * PUT /api/user-groups/:id/permissions
 * Bulk upsert. Body: { facilities?: 'READ', orders?: 'FULL', ... }
 * Setting a resource to NONE deletes any row.
 */
app.put('/:id/permissions', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  await assertGroupAccess(db, caller, id);
  const body = (await c.req.json()) as Partial<Record<PermissionResource, PermissionLevel>>;

  const toDelete: PermissionResource[] = [];
  const toUpsert: { resource: PermissionResource; level: PermissionLevel }[] = [];
  for (const [resource, level] of Object.entries(body)) {
    if (!PERMISSION_RESOURCES.includes(resource as PermissionResource)) {
      throw new ValidationError(`Invalid resource: ${resource}`);
    }
    if (!PERMISSION_LEVELS.includes(level as PermissionLevel)) {
      throw new ValidationError(`Invalid level for ${resource}: ${level}`);
    }
    if (level === 'NONE') toDelete.push(resource as PermissionResource);
    else toUpsert.push({ resource: resource as PermissionResource, level: level as PermissionLevel });
  }

  const now = new Date().toISOString();
  if (toDelete.length) {
    await db
      .delete(userGroupPermissions)
      .where(and(eq(userGroupPermissions.userGroupId, id), inArray(userGroupPermissions.resource, toDelete)));
  }
  for (const { resource, level } of toUpsert) {
    const existing = await db
      .select()
      .from(userGroupPermissions)
      .where(and(eq(userGroupPermissions.userGroupId, id), eq(userGroupPermissions.resource, resource)))
      .limit(1);
    if (existing.length) {
      await db
        .update(userGroupPermissions)
        .set({ level, updatedAt: now, grantedBy: caller.id })
        .where(eq(userGroupPermissions.id, existing[0].id));
    } else {
      await db.insert(userGroupPermissions).values({
        id: crypto.randomUUID(),
        userGroupId: id,
        resource,
        level,
        grantedBy: caller.id,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Return fresh map
  const rows = await db.select().from(userGroupPermissions).where(eq(userGroupPermissions.userGroupId, id));
  const permissions: Record<PermissionResource, PermissionLevel> = Object.fromEntries(
    PERMISSION_RESOURCES.map((r) => [r, 'NONE']),
  ) as Record<PermissionResource, PermissionLevel>;
  for (const r of rows) permissions[r.resource as PermissionResource] = r.level as PermissionLevel;
  return c.json({ groupId: id, permissions });
});

/**
 * GET /api/user-groups/:id/effective-recipients
 * Preview the user list a notification targeting this group would reach.
 */
app.get('/:id/effective-recipients', rbac(...MANAGER_ROLES), async (c) => {
  const db = getDb(c.env.DB);
  const caller = c.get('user');
  const { id } = c.req.param();
  await assertGroupAccess(db, caller, id);
  const userIds = await resolveGroupRecipients(db, id);
  if (userIds.length === 0) return c.json({ groupId: id, recipients: [] });
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(inArray(users.id, userIds));
  return c.json({ groupId: id, recipients: rows });
});

export default app;
