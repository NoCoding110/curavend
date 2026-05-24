import React, { useEffect, useState } from 'react';
import { Radio, Space, Spin, Typography, message, Alert } from 'antd';
import {
  userPermissionsApi,
  PERMISSION_RESOURCES,
  PERMISSION_LEVELS,
  type PermissionResource,
  type PermissionLevel,
  type UserPermissionsDetail,
  type PermissionsMap,
} from '../../../api/userPermissions';

const { Text } = Typography;

const RESOURCE_LABEL: Record<PermissionResource, string> = {
  facilities: 'Facilities',
  departments: 'Departments',
  physicians: 'Physicians',
  orders: 'Orders',
  vendors: 'Vendors',
  'vendor-locations': 'Vendor locations',
  'vendor-coverage': 'Vendor coverage',
  contracts: 'Contracts',
  requisitions: 'Requisitions',
  formulary: 'Formulary / Item Master',
  'goods-receipts': 'Goods receipts',
  budgets: 'Budgets',
  'purchase-orders': 'Purchase orders',
  'gl-ledger': 'GL ledger',
  'vendor-onboarding': 'Supplier onboarding',
  rmas: 'Returns (RMAs)',
  'compliance-alerts': 'Compliance alerts',
  'point-of-use': 'Point of use',
  logistics: 'Logistics',
  transfers: 'Inventory transfers',
  recalls: 'Recalls',
  'controlled-substance': 'Controlled substances',
  scorecards: 'Vendor scorecards',
};

/**
 * Adapter that lets this component edit either a USER's permissions or a
 * GROUP's permissions without duplicating the matrix UI. Both shapes return
 * an `effective` (or full) map; both accept partial-upsert PUT calls.
 */
export interface PermissionsAdapter {
  /** Display label for the subject ("Base role: X" or "Group: Y"). */
  subjectLabel: string;
  /** Fetch the current permission map. */
  load(): Promise<{ effective: PermissionsMap; subjectMeta?: string }>;
  /** Save a partial set. Returns the fresh effective map. */
  save(body: Partial<Record<PermissionResource, PermissionLevel>>): Promise<PermissionsMap>;
}

interface Props {
  /** Either pass an adapter (preferred) or `userId` (legacy convenience). */
  adapter?: PermissionsAdapter;
  userId?: string;
  /** Fires once initial data is loaded — useful if the parent wants to sync state. */
  onLoaded?: (data: { effective: PermissionsMap; subjectMeta?: string }) => void;
  /** Fires after a successful save. */
  onSaved?: (effective: PermissionsMap) => void;
}

/** Default adapter wrapping the legacy `userPermissionsApi` shape. */
function userAdapter(userId: string): PermissionsAdapter {
  return {
    subjectLabel: 'Base role',
    async load() {
      const data: UserPermissionsDetail = await userPermissionsApi.forUser(userId);
      return { effective: data.effective, subjectMeta: data.role };
    },
    async save(body) {
      const resp = await userPermissionsApi.update(userId, body);
      return resp.effective;
    },
  };
}

/**
 * Permission matrix: 8 resources x 4 levels (NONE/READ/WRITE/FULL).
 *
 *            NONE    READ    WRITE    FULL
 *   Facilities   ○       ◉       ○       ○
 *   ...
 *
 * Each row is a radio group; on change we save immediately via the adapter.
 * Reusable for both user and group permission editing.
 */
export const PermissionsMatrix: React.FC<Props> = ({ adapter, userId, onLoaded, onSaved }) => {
  // Build the effective adapter once. If `adapter` is passed, use it directly; otherwise wrap userId.
  const resolvedAdapter = adapter ?? (userId ? userAdapter(userId) : null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjectMeta, setSubjectMeta] = useState<string>('');
  const [effective, setEffective] = useState<PermissionsMap>(() =>
    Object.fromEntries(PERMISSION_RESOURCES.map((r) => [r, 'NONE'])) as PermissionsMap,
  );

  useEffect(() => {
    if (!resolvedAdapter) {
      setError('PermissionsMatrix: pass either `adapter` or `userId`');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    resolvedAdapter
      .load()
      .then((data) => {
        if (cancelled) return;
        setSubjectMeta(data.subjectMeta ?? '');
        // Fill in any missing keys (back-compat with smaller maps).
        const filled = Object.fromEntries(
          PERMISSION_RESOURCES.map((r) => [r, data.effective[r] ?? 'NONE']),
        ) as PermissionsMap;
        setEffective(filled);
        onLoaded?.({ effective: filled, subjectMeta: data.subjectMeta });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || err?.message || 'Failed to load permissions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Identify adapter by its source-of-truth string. For userId-based adapters
    // we want to re-load when userId changes; for adapter-based ones we trust
    // the caller to provide a stable adapter (or change subjectLabel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, adapter?.subjectLabel]);

  const handleChange = async (resource: PermissionResource, level: PermissionLevel) => {
    if (!resolvedAdapter) return;
    const prev = effective;
    setEffective((e) => ({ ...e, [resource]: level }));
    setSaving(true);
    try {
      const fresh = await resolvedAdapter.save({ [resource]: level });
      const filled = Object.fromEntries(
        PERMISSION_RESOURCES.map((r) => [r, fresh[r] ?? 'NONE']),
      ) as PermissionsMap;
      setEffective(filled);
      onSaved?.(filled);
      message.success(`${RESOURCE_LABEL[resource]} set to ${level}`);
    } catch (err: any) {
      setEffective(prev);
      message.error(err?.response?.data?.message || err?.message || 'Failed to update permission.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;
  if (error) return <Alert type="error" message={error} showIcon />;

  const subjectLabel = resolvedAdapter?.subjectLabel ?? 'Base';

  return (
    <div>
      <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 8 }}>
        <Text type="secondary">
          Grant per-resource access. {subjectLabel}: <b>{subjectMeta || '—'}</b>. Select
          "None" to remove an override and revert to the default.
        </Text>
      </Space>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px repeat(4, 1fr)',
          rowGap: 10,
          columnGap: 8,
          alignItems: 'center',
        }}
      >
        <div />
        {PERMISSION_LEVELS.map((lvl) => (
          <Text key={lvl} strong style={{ textAlign: 'center' }}>
            {lvl}
          </Text>
        ))}
        {PERMISSION_RESOURCES.map((r) => (
          <React.Fragment key={r}>
            <Text>{RESOURCE_LABEL[r]}</Text>
            <Radio.Group
              value={effective[r]}
              disabled={saving}
              onChange={(e) => handleChange(r, e.target.value as PermissionLevel)}
              style={{ gridColumn: 'span 4', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}
            >
              {PERMISSION_LEVELS.map((lvl) => (
                <Radio key={lvl} value={lvl} style={{ justifyContent: 'center', margin: 0 }}>
                  <span style={{ display: 'none' }}>{lvl}</span>
                </Radio>
              ))}
            </Radio.Group>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default PermissionsMatrix;
