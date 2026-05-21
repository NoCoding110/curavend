/**
 * SkuPackPreview — small inline summary of how a vendor will fulfil an
 * HCPC line via their SKU + pack math. Sits inside RoutingPickerCell under
 * each candidate and on Step 1 next to the qty input.
 */

import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CodeOutlined } from '@ant-design/icons';

interface PickedSku {
  vendorSku: string;
  unitsPerPack: number;
  packsPerCase: number;
  packQuantity: number;
  unitsTotal: number;
  unitsRequested: number;
  description: string | null;
  unitOfMeasurement: string | null;
  listPriceCents: number | null;
}

interface Props {
  sku: PickedSku;
  compact?: boolean;
}

const SkuPackPreview: React.FC<Props> = ({ sku, compact }) => {
  const overage = sku.unitsTotal - sku.unitsRequested;
  const priceText =
    sku.listPriceCents != null
      ? ` · $${(sku.listPriceCents / 100).toFixed(2)}/${sku.unitOfMeasurement || 'pack'}`
      : '';

  return (
    <Tooltip
      title={
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          <div>
            <strong>SKU:</strong> {sku.vendorSku}
          </div>
          {sku.description && <div>{sku.description}</div>}
          <div>
            {sku.packQuantity} × {sku.unitsPerPack}{' '}
            {sku.unitOfMeasurement || 'units'} = {sku.unitsTotal} units
          </div>
          <div>Requested: {sku.unitsRequested} units</div>
          {overage > 0 && (
            <div style={{ color: '#faad14' }}>
              ⚠ {overage}-unit overage (vendor only sells in packs of{' '}
              {sku.unitsPerPack})
            </div>
          )}
          {sku.listPriceCents != null && (
            <div>
              List price: ${(sku.listPriceCents / 100).toFixed(2)} per{' '}
              {sku.unitOfMeasurement || 'pack'}
            </div>
          )}
        </div>
      }
    >
      <Tag
        color={overage > 0 ? 'warning' : 'blue'}
        style={{
          margin: 0,
          fontSize: compact ? 10 : 11,
          cursor: 'help',
          padding: compact ? '0 6px' : '2px 8px',
        }}
      >
        <CodeOutlined style={{ marginRight: 4, fontSize: 10 }} />
        {sku.packQuantity} × {sku.unitsPerPack}{' '}
        {sku.unitOfMeasurement || 'pack'}
        {' '}= {sku.unitsTotal} units
        {priceText}
      </Tag>
    </Tooltip>
  );
};

export default SkuPackPreview;
