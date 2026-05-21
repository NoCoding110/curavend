import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import {
  userPermissionsApi,
  type PermissionResource,
  type PermissionLevel,
  type PermissionsMap,
  PERMISSION_LEVEL_RANK,
} from '../api/userPermissions';

const EMPTY_MAP: PermissionsMap = {
  facilities: 'NONE',
  departments: 'NONE',
  physicians: 'NONE',
  orders: 'NONE',
  vendors: 'NONE',
};

/**
 * Hook that loads the caller's effective permissions and exposes a `can()`
 * helper for gating UI buttons/menus. Re-fetches on user/login change.
 */
export function usePermissions() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [perms, setPerms] = useState<PermissionsMap>(EMPTY_MAP);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setPerms(EMPTY_MAP);
      return;
    }
    setLoading(true);
    try {
      const data = await userPermissionsApi.me();
      setPerms({ ...EMPTY_MAP, ...data });
    } catch {
      setPerms(EMPTY_MAP);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const can = (resource: PermissionResource, level: PermissionLevel): boolean =>
    PERMISSION_LEVEL_RANK[perms[resource] ?? 'NONE'] >= PERMISSION_LEVEL_RANK[level];

  return {
    perms,
    loading,
    refresh,
    can,
    canRead: (r: PermissionResource) => can(r, 'READ'),
    canWrite: (r: PermissionResource) => can(r, 'WRITE'),
    canDelete: (r: PermissionResource) => can(r, 'FULL'),
  };
}
