import { get, put, del } from './client';

export const PERMISSION_RESOURCES = [
  'facilities',
  'departments',
  'physicians',
  'orders',
  'vendors',
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_LEVELS = ['NONE', 'READ', 'WRITE', 'FULL'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const PERMISSION_LEVEL_RANK: Record<PermissionLevel, number> = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  FULL: 3,
};

export type PermissionsMap = Record<PermissionResource, PermissionLevel>;

export interface UserPermissionsDetail {
  userId: string;
  role: string;
  overrides: Partial<Record<PermissionResource, PermissionLevel>>;
  effective: PermissionsMap;
}

export const userPermissionsApi = {
  /** Effective permissions for the current caller. */
  me: (): Promise<PermissionsMap> => get<PermissionsMap>('/user-permissions/me'),

  /** Hospital Manager reads permissions for a given user. */
  forUser: (userId: string): Promise<UserPermissionsDetail> =>
    get<UserPermissionsDetail>('/user-permissions', { userId }),

  /** Bulk upsert permissions for a user. Setting a resource to 'NONE' removes any override. */
  update: (
    userId: string,
    body: Partial<Record<PermissionResource, PermissionLevel>>,
  ): Promise<{ userId: string; effective: PermissionsMap }> =>
    put<{ userId: string; effective: PermissionsMap }>(`/user-permissions/${userId}`, body),

  /** Remove a single override, reverting to the role default. */
  remove: (userId: string, resource: PermissionResource): Promise<{ success: boolean }> =>
    del<{ success: boolean }>(`/user-permissions/${userId}/${resource}`),
};
