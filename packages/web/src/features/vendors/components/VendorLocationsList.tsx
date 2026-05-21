/**
 * VendorLocationsList — read-only list of a vendor's branches.
 *
 * Used by:
 *   • HospitalVendors drawer (displaying branches of a linked vendor)
 *   • VendorCoverage drill-down panel (cell click)
 *
 * Renders one card per location with location type, address, capability
 * chips, service-state chips, SLA, and (optionally) a per-row indicator
 * showing whether the location serves a given facility state.
 */

import React from 'react';
import { Card, Empty, Space, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleTwoTone,
  EnvironmentOutlined,
  StopOutlined,
  ClockCircleOutlined,
  StarFilled,
} from '@ant-design/icons';

const { Text } = Typography;

export interface VendorLocationItem {
  id: string;
  name: string;
  locationType: string;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: number | boolean;
  isActive?: number | boolean;
  capabilities?: string[] | string | null;
  serviceStates?: string[] | string | null;
  maxDeliveryHours?: number | null;
}

interface Props {
  locations: VendorLocationItem[];
  /** Optional facility state (uppercase 2-letter) to compute "Serves <state>" badge. */
  facilityState?: string | null;
  /** Pass when caller has already evaluated coverage (avoids duplicate logic). */
  servesFacilityById?: Record<string, boolean>;
  emptyText?: string;
  loading?: boolean;
}

function parseList(input: string[] | string | null | undefined): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    /* ignore */
  }
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const CAPABILITY_COLORS: Record<string, string> = {
  CUSTOM_FIT: 'magenta',
  STAT: 'red',
  STERILE: 'blue',
  REFRIGERATED: 'cyan',
  STANDARD: 'default',
  IMPLANT: 'gold',
  BIOLOGICS: 'purple',
};

const TYPE_LABELS: Record<string, string> = {
  WAREHOUSE: 'Warehouse',
  FITTING_CENTER: 'Fitting Center',
  HEADQUARTERS: 'Headquarters',
  DISTRIBUTION_HUB: 'Distribution Hub',
};

const VendorLocationsList: React.FC<Props> = ({
  locations,
  facilityState,
  servesFacilityById,
  emptyText = 'No active locations',
  loading,
}) => {
  if (!loading && (!locations || locations.length === 0)) {
    return <Empty description={emptyText} />;
  }

  const upperState = facilityState ? facilityState.toUpperCase() : null;

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      {locations.map((loc) => {
        const capabilities = parseList(loc.capabilities);
        const serviceStates = parseList(loc.serviceStates).map((s) =>
          s.toUpperCase(),
        );

        let serves: boolean | null = null;
        if (servesFacilityById && loc.id in servesFacilityById) {
          serves = !!servesFacilityById[loc.id];
        } else if (upperState) {
          serves = serviceStates.includes(upperState);
        }

        const isPrimary = !!loc.isPrimary;

        const addressLine = [loc.streetAddress, loc.city, loc.state, loc.zip]
          .filter(Boolean)
          .join(', ');

        return (
          <Card
            key={loc.id}
            size="small"
            style={{ borderColor: serves === false ? '#fadb14' : undefined }}
            bodyStyle={{ padding: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Space size={6} wrap>
                  <Text strong>{loc.name}</Text>
                  <Tag>{TYPE_LABELS[loc.locationType] || loc.locationType}</Tag>
                  {isPrimary && (
                    <Tooltip title="Primary branch">
                      <StarFilled style={{ color: '#faad14' }} />
                    </Tooltip>
                  )}
                </Space>
                {addressLine && (
                  <div style={{ marginTop: 4, color: '#666', fontSize: 12 }}>
                    <EnvironmentOutlined style={{ marginRight: 4 }} />
                    {addressLine}
                  </div>
                )}
              </div>
              {serves !== null && upperState && (
                serves ? (
                  <Tooltip title={`This branch serves ${upperState}`}>
                    <Tag icon={<CheckCircleTwoTone twoToneColor="#52c41a" />} color="success">
                      Serves {upperState}
                    </Tag>
                  </Tooltip>
                ) : (
                  <Tooltip title={`This branch does not list ${upperState} in its service area`}>
                    <Tag icon={<StopOutlined />} color="warning">
                      Out of region
                    </Tag>
                  </Tooltip>
                )
              )}
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {capabilities.length > 0 ? (
                capabilities.map((cap) => (
                  <Tag key={cap} color={CAPABILITY_COLORS[cap] ?? 'geekblue'}>
                    {cap.replace('_', ' ')}
                  </Tag>
                ))
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>No capabilities listed</Text>
              )}
            </div>

            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 12, color: '#555' }}>
              {serviceStates.length > 0 && (
                <span>
                  <strong>Serves:</strong>{' '}
                  {serviceStates.map((s) => (
                    <Tag key={s} style={{ marginRight: 2 }}>{s}</Tag>
                  ))}
                </span>
              )}
              {typeof loc.maxDeliveryHours === 'number' && (
                <span>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  Max delivery: {loc.maxDeliveryHours}h
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </Space>
  );
};

export default VendorLocationsList;
