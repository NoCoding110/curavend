/**
 * StockBadge — Phase D: shows live stock signal for a routing candidate.
 * Used inside RoutingPickerCell.
 */

import React from 'react';
import { Tag, Tooltip } from 'antd';
import {
  CheckCircleFilled,
  WarningFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
} from '@ant-design/icons';

interface Props {
  stock: {
    onHand: number;
    available: number | null;
    observedAt: string;
    ingestedAt: string;
    ageMinutes: number;
    stale: boolean;
    sufficient: boolean;
  };
}

const StockBadge: React.FC<Props> = ({ stock }) => {
  let color: string;
  let icon: React.ReactNode;
  let label: string;
  if (!stock.sufficient) {
    color = 'error';
    icon = <CloseCircleFilled />;
    label = `Low: ${stock.onHand} on hand`;
  } else if (stock.stale) {
    color = 'warning';
    icon = <WarningFilled />;
    label = `In stock: ${stock.onHand} · stale ${stock.ageMinutes}m`;
  } else {
    color = 'success';
    icon = <CheckCircleFilled />;
    label = `In stock: ${stock.onHand}`;
  }

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          <div>On-hand: {stock.onHand}</div>
          {stock.available != null && stock.available !== stock.onHand && (
            <div>Available: {stock.available}</div>
          )}
          <div>
            <ClockCircleOutlined /> Snapshot {stock.ageMinutes} min old
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            Observed: {stock.observedAt}
          </div>
        </div>
      }
    >
      <Tag color={color} style={{ fontSize: 10, margin: 0 }}>
        {icon} {label}
      </Tag>
    </Tooltip>
  );
};

export default StockBadge;
