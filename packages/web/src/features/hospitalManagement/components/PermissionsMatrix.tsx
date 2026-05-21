import React, { useEffect, useState } from 'react';
import { Radio, Space, Spin, Typography, message, Alert } from 'antd';
import {
  userPermissionsApi,
  PERMISSION_RESOURCES,
  PERMISSION_LEVELS,
  type PermissionResource,
  type PermissionLevel,
  type UserPermissionsDetail,
} from '../../../api/userPermissions';

const { Text } = Typography;

const RESOURCE_LABEL: Record<PermissionResource, string> = {
  facilities: 'Facilities',
  departments: 'Departments',
  physicians: 'Physicians',
  orders: 'Orders',
  vendors: 'Vendors',
};

interface Props {
  /** Target user whose permissions are being edited. */
  userId: string;
  /** Fires once initial data is loaded — useful if the parent wants to sync state. */
  onLoaded?: (data: UserPermissionsDetail) => void;
  /** Fires after a successful save. */
  onSaved?: (effective: Record<PermissionResource, PermissionLevel>) => void;
}

/**
 * Per-user, per-resource permission matrix for Hospital Managers.
 *
 * Layout:
 *            NONE    READ    WRITE    FULL
 *   Facilities   ○       ◉       ○       ○
 *   ...
 *
 * Each row is a radio group; on change we debounce-save into the
 * user_permissions table via PUT /api/user-permissions/:userId.
 */
export const PermissionsMatrix: React.FC<Props> = ({ userId, onLoaded, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>('');
  const [effective, setEffective] = useState<Record<PermissionResource, PermissionLevel>>({
    facilities: 'NONE',
    departments: 'NONE',
    physicians: 'NONE',
    orders: 'NONE',
    vendors: 'NONE',
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    userPermissionsApi
      .forUser(userId)
      .then((data) => {
        if (cancelled) return;
        setRole(data.role);
        setEffective(data.effective);
        onLoaded?.(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.message || 'Failed to load permissions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, onLoaded]);

  const handleChange = async (resource: PermissionResource, level: PermissionLevel) => {
    const prev = effective;
    setEffective((e) => ({ ...e, [resource]: level }));
    setSaving(true);
    try {
      const resp = await userPermissionsApi.update(userId, { [resource]: level });
      setEffective(resp.effective);
      onSaved?.(resp.effective);
      message.success(`${RESOURCE_LABEL[resource]} set to ${level}`);
    } catch (err: any) {
      setEffective(prev);
      message.error(err?.response?.data?.message || 'Failed to update permission.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;
  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <div>
      <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: 8 }}>
        <Text type="secondary">
          Grant per-resource access for this user. Base role: <b>{role || '—'}</b>. Select
          "None" to remove an override and revert to role defaults.
        </Text>
      </Space>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px repeat(4, 1fr)',
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
