/**
 * RoutingPickerCell — radio-list of [recommended, ...alternatives] for a
 * single line item in the Step 3 routing canvas. Lets the hospital override
 * the engine's pick per item before submitting the order.
 *
 * Props match the existing `RoutingSuggestion` shape from the routing API.
 */

import React from 'react';
import { Radio, Space, Tag, Tooltip, Typography, Empty } from 'antd';
import {
  StarFilled,
  CheckCircleFilled,
  EnvironmentOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { CAPABILITY_COLORS } from '../../vendors/components/VendorLocationsList';
import SkuPackPreview from './SkuPackPreview';
import StockBadge from './StockBadge';

const { Text } = Typography;

export interface RoutingCandidate {
  vendorId: string;
  vendorName: string | null;
  locationId: string;
  locationName: string;
  locationState: string | null;
  locationType: string;
  maxDeliveryHours: number | null;
  capabilities: string[];
  serviceStates: string[];
  score: number;
  priority: number;
  reasons: string[];
  /** Phase C — populated when the vendor has an active SKU mapping for the HCPC. */
  pickedSku?: {
    vendorSku: string;
    unitsPerPack: number;
    packsPerCase: number;
    packQuantity: number;
    unitsTotal: number;
    unitsRequested: number;
    description: string | null;
    unitOfMeasurement: string | null;
    listPriceCents: number | null;
  } | null;
  /** Phase D — live stock signal from external feed. */
  stock?: {
    onHand: number;
    available: number | null;
    observedAt: string;
    ingestedAt: string;
    ageMinutes: number;
    stale: boolean;
    sufficient: boolean;
  } | null;
}

export interface RoutingPickerCellProps {
  itemKey: string;
  category: string;
  recommended: RoutingCandidate | null;
  alternatives: RoutingCandidate[];
  errors: string[];
  /** Currently selected vendorId for this item (override). NULL → use recommended. */
  selectedVendorId: string | null;
  /** Facility state — used to highlight same-state branches. */
  facilityState: string | null;
  onSelect: (vendorId: string, locationId: string) => void;
  disabled?: boolean;
}

const RoutingPickerCell: React.FC<RoutingPickerCellProps> = ({
  category,
  recommended,
  alternatives,
  errors,
  selectedVendorId,
  facilityState,
  onSelect,
  disabled = false,
}) => {
  if (!recommended) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" size={2}>
            <Tag color="red">No eligible vendor</Tag>
            {errors.map((e, i) => (
              <Text key={i} type="secondary" style={{ fontSize: 12 }}>
                · {e}
              </Text>
            ))}
          </Space>
        }
        style={{ margin: 4 }}
      />
    );
  }

  const candidates = [recommended, ...alternatives];
  const effectiveVendorId = selectedVendorId ?? recommended.vendorId;

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Radio.Group
        value={effectiveVendorId}
        onChange={(e) => {
          const cand = candidates.find((c) => c.vendorId === e.target.value);
          if (cand) onSelect(cand.vendorId, cand.locationId);
        }}
        disabled={disabled}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          {candidates.map((cand, idx) => {
            const isRec = idx === 0;
            const sameState =
              !!facilityState &&
              cand.locationState?.toUpperCase() === facilityState.toUpperCase();
            const isSelected = cand.vendorId === effectiveVendorId;
            return (
              <Radio
                key={`${cand.vendorId}-${cand.locationId}`}
                value={cand.vendorId}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: isSelected ? '#e6f4ff' : 'transparent',
                  border: isSelected
                    ? '1px solid #91caff'
                    : '1px solid transparent',
                }}
              >
                <Space direction="vertical" size={1} style={{ marginLeft: 4 }}>
                  <Space size={6} wrap>
                    {isRec && (
                      <Tooltip title="Routing engine's top choice">
                        <Tag color="success" style={{ marginRight: 0 }}>
                          <StarFilled /> Recommended
                        </Tag>
                      </Tooltip>
                    )}
                    {!isRec && (
                      <Tag color="default" style={{ marginRight: 0 }}>
                        Alternative #{idx}
                      </Tag>
                    )}
                    <Text strong>
                      {cand.vendorName || cand.vendorId}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      · {cand.locationName}
                      {cand.locationState ? ` (${cand.locationState})` : ''}
                    </Text>
                    {sameState && (
                      <Tag color="green" style={{ marginRight: 0, fontSize: 11 }}>
                        Same state
                      </Tag>
                    )}
                  </Space>
                  <Space size={6} wrap>
                    <Tooltip title={`Lower score = better. priority ${cand.priority}`}>
                      <Tag style={{ fontSize: 10 }}>
                        score {cand.score}
                      </Tag>
                    </Tooltip>
                    {cand.maxDeliveryHours != null && (
                      <span style={{ fontSize: 11, color: '#666' }}>
                        <ClockCircleOutlined /> {cand.maxDeliveryHours}h SLA
                      </span>
                    )}
                    {cand.capabilities.slice(0, 4).map((cap) => (
                      <Tag
                        key={cap}
                        color={CAPABILITY_COLORS[cap] || 'default'}
                        style={{ fontSize: 10, marginRight: 0 }}
                      >
                        {cap.replace('_', ' ')}
                      </Tag>
                    ))}
                  </Space>
                  {cand.pickedSku && (
                    <SkuPackPreview sku={cand.pickedSku} compact />
                  )}
                  {cand.stock && <StockBadge stock={cand.stock} />}
                  {cand.reasons.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      <CheckCircleFilled style={{ color: '#52c41a' }} />{' '}
                      {cand.reasons.join(' · ')}
                    </Text>
                  )}
                </Space>
              </Radio>
            );
          })}
          {alternatives.length === 0 && (
            <Text type="secondary" style={{ fontSize: 11, paddingLeft: 8 }}>
              <EnvironmentOutlined /> No alternatives — this is the only
              eligible vendor for {category.replace('_', ' ')} at this facility.
            </Text>
          )}
        </Space>
      </Radio.Group>
    </Space>
  );
};

export default RoutingPickerCell;
