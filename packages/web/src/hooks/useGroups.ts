import { useCallback, useEffect, useState } from 'react';
import { userGroupsApi, type UserGroup, type UserGroupDetail } from '../api/userGroups';

/**
 * Lists groups in the caller's tenant. Re-fetches on `refreshToken` change.
 */
export function useGroupsInMyTenant(refreshToken: number = 0): {
  groups: UserGroup[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    userGroupsApi
      .list()
      .then((res) => {
        if (!cancelled) setGroups(res.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || err?.message || 'Failed to load groups.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken, reload]);

  return { groups, loading, error, refetch: useCallback(() => setReload((n) => n + 1), []) };
}

/**
 * Loads one group's full detail (members, permissions). Caller chooses
 * when to refresh by changing `refreshToken`.
 */
export function useGroupDetail(
  groupId: string | null,
  refreshToken: number = 0,
): { detail: UserGroupDetail | null; loading: boolean; error: string | null; refetch: () => void } {
  const [detail, setDetail] = useState<UserGroupDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!groupId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    userGroupsApi
      .get(groupId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || err?.message || 'Failed to load group.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, refreshToken, reload]);

  return { detail, loading, error, refetch: useCallback(() => setReload((n) => n + 1), []) };
}
