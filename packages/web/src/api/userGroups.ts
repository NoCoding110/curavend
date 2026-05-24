/**
 * API client for /api/user-groups.
 *
 * Mirrors the backend route shapes in routes/userGroups.ts.
 */
import { get, post, put, del } from './client';
import type { PermissionLevel, PermissionResource, PermissionsMap } from './userPermissions';

export const USER_GROUP_TENANT_TYPES = [
  'HOSPITAL',
  'VENDOR',
  'PROVIDER',
  'SUPER_VENDOR',
  'ADMIN',
] as const;
export type UserGroupTenantType = (typeof USER_GROUP_TENANT_TYPES)[number];

export const USER_GROUP_KINDS = [
  'PERMISSION_BUNDLE',
  'SCOPED_TEAM',
  'NOTIFICATION_ROUTE',
  'COMPOSITE',
] as const;
export type UserGroupKind = (typeof USER_GROUP_KINDS)[number];

export interface UserGroup {
  id: string;
  tenantType: UserGroupTenantType;
  tenantId: string | null;
  name: string;
  description: string | null;
  groupKind: UserGroupKind;
  facilityId: string | null;
  departmentId: string | null;
  vendorLocationId: string | null;
  isSystemDefault: boolean;
  memberCount?: number;
  permissions?: Partial<Record<PermissionResource, PermissionLevel>>;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserGroupMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: string | null;
  userType: string | null;
  addedAt: string | null;
  addedBy: string | null;
}

export interface UserGroupDetail extends UserGroup {
  members: UserGroupMember[];
}

export interface CreateUserGroupInput {
  name: string;
  description?: string;
  groupKind?: UserGroupKind;
  facilityId?: string | null;
  departmentId?: string | null;
  vendorLocationId?: string | null;
  /** Admin-only: target another tenant. */
  tenantType?: UserGroupTenantType;
  tenantId?: string;
}

export interface UpdateUserGroupInput {
  name?: string;
  description?: string | null;
  groupKind?: UserGroupKind;
  facilityId?: string | null;
  departmentId?: string | null;
  vendorLocationId?: string | null;
}

export const userGroupsApi = {
  /** List groups in the caller's tenant. Admin may pass tenantType/tenantId. */
  list: (params?: { tenantType?: UserGroupTenantType; tenantId?: string }): Promise<{ items: UserGroup[] }> =>
    get<{ items: UserGroup[] }>('/user-groups', params as Record<string, string> | undefined),

  /** Full detail for one group, including members. */
  get: (id: string): Promise<UserGroupDetail> => get<UserGroupDetail>(`/user-groups/${id}`),

  /** Create a new group in the caller's tenant. */
  create: (body: CreateUserGroupInput): Promise<UserGroup> => post<UserGroup>('/user-groups', body),

  /** Rename / re-scope an existing group. */
  update: (id: string, body: UpdateUserGroupInput): Promise<{ id: string; updated: boolean }> =>
    put<{ id: string; updated: boolean }>(`/user-groups/${id}`, body),

  /** Delete a group (cascades members + permissions). 409 if system-default. */
  remove: (id: string): Promise<{ id: string; deleted: boolean }> =>
    del<{ id: string; deleted: boolean }>(`/user-groups/${id}`),

  /** Add one or more users to a group. */
  addMembers: (id: string, userIds: string[]): Promise<{ groupId: string; addedUserIds: string[] }> =>
    post<{ groupId: string; addedUserIds: string[] }>(`/user-groups/${id}/members`, { userIds }),

  /** Remove a single user from a group. */
  removeMember: (id: string, userId: string): Promise<{ groupId: string; removedUserId: string }> =>
    del<{ groupId: string; removedUserId: string }>(`/user-groups/${id}/members/${userId}`),

  /** Fetch the 8-resource permissions map for a group. */
  getPermissions: (id: string): Promise<{ groupId: string; permissions: PermissionsMap }> =>
    get<{ groupId: string; permissions: PermissionsMap }>(`/user-groups/${id}/permissions`),

  /** Bulk upsert permissions. NONE removes the row. */
  updatePermissions: (
    id: string,
    body: Partial<Record<PermissionResource, PermissionLevel>>,
  ): Promise<{ groupId: string; permissions: PermissionsMap }> =>
    put<{ groupId: string; permissions: PermissionsMap }>(`/user-groups/${id}/permissions`, body),

  /** Preview the user list a notification targeting this group would reach. */
  effectiveRecipients: (
    id: string,
  ): Promise<{ groupId: string; recipients: Array<{ id: string; name: string; email: string; role: string }> }> =>
    get<{ groupId: string; recipients: Array<{ id: string; name: string; email: string; role: string }> }>(
      `/user-groups/${id}/effective-recipients`,
    ),
};
