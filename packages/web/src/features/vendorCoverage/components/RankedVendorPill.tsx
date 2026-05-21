/**
 * RankedVendorPill — compact pill summarising one vendor's coverage of a
 * (facility, category) cell. Clicking opens the existing per-pair drill-down
 * Drawer in `VendorCoverage.tsx`.
 *
 * Props are kept narrow so the pill can be reused outside the matrix
 * (e.g. inside the Step 3 routing canvas in CreateSupplyOrder).
 */

import React from 'react';
import { Tag, Tooltip, Space, Typography } from 'antd';
import {
  StarFilled,
  CheckCircleFilled,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { RankedVendorCell } from '../hooks/useVendorCoverage';
import { CAPABILITY_COLORS } from '../../vendors/components/VendorLocationsList';

interface Props {
  cell: RankedVendorCell;
  rank: number; // 1-based
  /** Click handler — typically opens the per-pair drawer. */
  onClick?: () => void;
  compact?: boolean;
}

const RankedVendorPill: React.FC<Props> = ({
  cell,
  rank,
  onClick,
  compact = false,
}) => {
  const slaText = cell.bestSlaHours != null ? `${cell.bestSlaHours}h` : '—';
  const branchText = `${cell.branchesServing} branch${cell.branchesServing === 1 ? '' : 'es'}`;

  const tooltip = (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      <div>
        <strong>{cell.vendorName ?? cell.vendorId}</strong> · priority{' '}
        {cell.priority}
      </div>
      <div>
        {cell.branchesServing} of {cell.branchesTotal} branches serve this
        facility
      </div>
      {cell.bestSlaHours != null && <div>Best SLA: {cell.bestSlaHours}h</div>}
      {cell.capabilityUnion.length > 0 && (
        <div>Capabilities: {cell.capabilityUnion.join(', ')}</div>
      )}
      {cell.servingLocations.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {cell.servingLocations
            .map((l) => `${l.name}${l.state ? ` (${l.state})` : ''}`)
            .join(' · ')}
        </div>
      )}
      {cell.isFacilityScoped && (
        <div style={{ marginTop: 4, color: '#1677ff' }}>
          ★ Facility-scoped preference
        </div>
      )}
    </div>
  );

  return (
    <Tooltip title={tooltip} placement="top" mouseEnterDelay={0.2}>
      <Tag
        color={cell.isFacilityScoped ? 'blue' : 'success'}
        style={{
          cursor: onClick ? 'pointer' : 'default',
          padding: compact ? '2px 8px' : '4px 10px',
          borderRadius: 16,
          margin: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: compact ? 11 : 12,
          maxWidth: '100%',
        }}
        onClick={onClick}
      >
        <Space size={4}>
          <span
            style={{
              fontWeight: 600,
              fontSize: compact ? 10 : 11,
              opacity: 0.85,
            }}
          >
            #{rank}
          </span>
          {cell.isFacilityScoped && (
            <StarFilled style={{ fontSize: 10, color: '#1677ff' }} />
          )}
          <Typography.Text
            strong
            ellipsis
            style={{
              maxWidth: 140,
              fontSize: compact ? 11 : 12,
              color: 'inherit',
            }}
          >
            {cell.vendorName ?? cell.vendorId}
          </Typography.Text>
          <span style={{ opacity: 0.7 }}>·</span>
          <CheckCircleFilled style={{ fontSize: 10, color: '#52c41a' }} />
          <span style={{ opacity: 0.85 }}>{branchText}</span>
          <span style={{ opacity: 0.7 }}>·</span>
          <ClockCircleOutlined style={{ fontSize: 10 }} />
          <span style={{ opacity: 0.85 }}>{slaText}</span>
          {!compact &&
            cell.capabilityUnion.slice(0, 2).map((cap) => (
              <Tag
                key={cap}
                color={CAPABILITY_COLORS[cap] || 'default'}
                style={{ marginLeft: 2, marginRight: 0, fontSize: 10 }}
              >
                {cap.replace('_', ' ')}
              </Tag>
            ))}
        </Space>
      </Tag>
    </Tooltip>
  );
};

export default RankedVendorPill;
