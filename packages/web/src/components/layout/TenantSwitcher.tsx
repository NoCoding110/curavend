/**
 * TenantSwitcher — Phase F: in-session tenant switcher.
 *
 * Renders nothing if the current user has only one membership.
 * Otherwise shows a dropdown with the active tenant; clicking switches
 * the JWT to a different membership and reloads the app so cached
 * tenant-scoped state is fully cleared.
 */

import React, { useEffect, useState } from 'react';
import { Dropdown, Button, Space, Tag, Spin, message } from 'antd';
import type { MenuProps } from 'antd';
import { SwapOutlined, CheckOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { authApi, MembershipSummary } from '../../api/auth';
import { setCredentials } from '../../store/slices/authSlice';
import type { RootState } from '../../store/store';

const TENANT_TYPE_TAG: Record<string, { color: string; label: string }> = {
  HOSPITAL: { color: 'blue', label: 'Hospital' },
  VENDOR: { color: 'cyan', label: 'Vendor' },
  PROVIDER: { color: 'purple', label: 'Provider' },
  SUPER_VENDOR: { color: 'gold', label: 'Super-Vendor' },
};

export const TenantSwitcher: React.FC = () => {
  const dispatch = useDispatch();
  const userData = useSelector((state: RootState) => state.auth.userData);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await authApi.myMemberships();
        if (cancelled) return;
        setMemberships(data.items ?? []);
      } catch {
        // Non-critical — endpoint may not be deployed yet, silently hide.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Render nothing if the user has 0–1 memberships
  if (loading) return <Spin size="small" />;
  if (memberships.length <= 1) return null;

  // Determine the active membership by matching JWT-derived tenant fields
  // against each membership.
  const activeId =
    (userData as any)?.activeMembershipId ||
    memberships.find((m) =>
      (m.tenantType === 'HOSPITAL'     && m.tenantId === userData?.hospitalId) ||
      (m.tenantType === 'VENDOR'        && m.tenantId === userData?.vendorId) ||
      (m.tenantType === 'PROVIDER'      && m.tenantId === userData?.providerId) ||
      (m.tenantType === 'SUPER_VENDOR' && m.tenantId === userData?.superVendorId),
    )?.id;

  const active = memberships.find((m) => m.id === activeId) ?? memberships[0];
  const others = memberships.filter((m) => m.id !== active.id);

  const handleSwitch = async (membershipId: string) => {
    if (switching) return;
    setSwitching(true);
    try {
      const response = await authApi.switchMembership({ membershipId });
      if (response.accessToken && response.refreshToken && response.user) {
        dispatch(
          setCredentials({
            token: response.accessToken,
            refreshToken: response.refreshToken,
            userData: response.user,
          }),
        );
        message.success(`Switched to ${memberships.find((m) => m.id === membershipId)?.label ?? 'organization'}`);
        // Hard reload — clears every Redux Persist slice that was keyed by
        // the previous tenant. Lower-tech than per-slice invalidation but safe.
        setTimeout(() => { window.location.href = '/'; }, 250);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to switch organization');
    } finally {
      setSwitching(false);
    }
  };

  const items: MenuProps['items'] = [
    {
      key: 'header',
      type: 'group' as const,
      label: 'Switch organization',
      children: others.map((m) => ({
        key: m.id,
        onClick: () => handleSwitch(m.id),
        label: (
          <Space direction="vertical" size={0}>
            <span style={{ fontWeight: 500 }}>{m.label || m.tenantId}</span>
            <span style={{ fontSize: 11, color: '#888' }}>
              {TENANT_TYPE_TAG[m.tenantType]?.label ?? m.tenantType} · {m.role}
            </span>
          </Space>
        ),
      })),
    },
  ];

  const tag = TENANT_TYPE_TAG[active.tenantType] ?? { color: 'default', label: active.tenantType };

  return (
    <Dropdown menu={{ items }} placement="bottomRight" disabled={switching}>
      <Button type="text" icon={<SwapOutlined />} loading={switching}>
        <Space size={4}>
          <Tag color={tag.color} style={{ margin: 0 }}>{tag.label}</Tag>
          <span style={{ fontWeight: 500 }}>{active.label || active.tenantId}</span>
          <CheckOutlined style={{ color: '#52c41a', fontSize: 12 }} />
        </Space>
      </Button>
    </Dropdown>
  );
};

export default TenantSwitcher;
