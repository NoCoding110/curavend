/**
 * CategoryCoverageRow — rendered inside the expanded row of each facility
 * in the Vendor Coverage matrix. Shows one category per row, with a
 * horizontally scrolling stack of `RankedVendorPill`s.
 *
 * Filters (categoryFilter, vendorFilter, showOnlyGaps) are applied here
 * so the parent table can stay focused on facility iteration.
 */

import React from 'react';
import { Empty, Tag, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import RankedVendorPill from './RankedVendorPill';
import type {
  CategoryCell,
  ItemCategory,
} from '../hooks/useVendorCoverage';

interface Props {
  facilityId: string;
  facilityState: string | null;
  categories: ItemCategory[];
  categoryCoverage: Record<string, CategoryCell>;
  /** Filters from parent toolbar. */
  categoryFilter: ItemCategory[];
  vendorFilter: string[];
  showOnlyGaps: boolean;
  /** Click handler for a vendor pill. */
  onPillClick: (vendorId: string, facilityId: string) => void;
}

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  WOUND_CARE: 'Wound Care',
  ORTHOTICS: 'Orthotics',
  PROSTHETICS: 'Prosthetics',
  BIOLOGICS: 'Biologics',
  DME: 'DME',
  IMPLANTS: 'Implants',
  CONSUMABLES: 'Consumables',
  GENERAL: 'General',
};

const CATEGORY_COLOR: Record<ItemCategory, string> = {
  WOUND_CARE: 'volcano',
  ORTHOTICS: 'geekblue',
  PROSTHETICS: 'purple',
  BIOLOGICS: 'magenta',
  DME: 'cyan',
  IMPLANTS: 'gold',
  CONSUMABLES: 'lime',
  GENERAL: 'default',
};

const GAP_REASON_LABEL: Record<string, string> = {
  'no-vendor-for-category':
    'No preferred vendor configured for this category at this facility',
  'no-location-serves-state':
    'A vendor is configured but no branch serves this facility’s state',
};

const CategoryCoverageRow: React.FC<Props> = ({
  facilityId,
  facilityState,
  categories,
  categoryCoverage,
  categoryFilter,
  vendorFilter,
  showOnlyGaps,
  onPillClick,
}) => {
  const visibleCategories =
    categoryFilter.length > 0
      ? categories.filter((c) => categoryFilter.includes(c))
      : categories;

  const rows = visibleCategories.map((category) => {
    const cell = categoryCoverage[category] || {
      rankedVendors: [],
      gapReason: 'no-vendor-for-category' as const,
    };

    let visibleVendors = cell.rankedVendors;
    if (vendorFilter.length > 0) {
      visibleVendors = visibleVendors.filter((v) =>
        vendorFilter.includes(v.vendorId),
      );
    }

    const isGap = visibleVendors.length === 0;
    if (showOnlyGaps && !isGap) return null;
    if (!showOnlyGaps && cell.rankedVendors.length === 0 && vendorFilter.length > 0) {
      // When a vendor filter is active, hide categories that already had no
      // ranked vendors anyway — they were gaps before the filter applied.
      return null;
    }

    return (
      <tr key={category} style={{ verticalAlign: 'top' }}>
        <td
          style={{
            padding: '6px 12px',
            width: 160,
            whiteSpace: 'nowrap',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Tag color={CATEGORY_COLOR[category]} style={{ marginRight: 0 }}>
            {CATEGORY_LABEL[category]}
          </Tag>
        </td>
        <td
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          {visibleVendors.length === 0 ? (
            <Tooltip
              title={
                cell.gapReason
                  ? GAP_REASON_LABEL[cell.gapReason] ||
                    'No coverage'
                  : vendorFilter.length > 0
                    ? 'No matching vendor for this category'
                    : 'No coverage'
              }
            >
              <Typography.Text type="secondary" italic>
                <InfoCircleOutlined style={{ marginRight: 6 }} />
                No coverage
              </Typography.Text>
            </Tooltip>
          ) : (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {visibleVendors.map((cell, i) => (
                <RankedVendorPill
                  key={cell.vendorId}
                  cell={cell}
                  rank={i + 1}
                  onClick={() => onPillClick(cell.vendorId, facilityId)}
                />
              ))}
            </div>
          )}
        </td>
      </tr>
    );
  });

  const visibleRowCount = rows.filter(Boolean).length;
  if (visibleRowCount === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          showOnlyGaps
            ? 'No coverage gaps for this facility'
            : 'No matching categories'
        }
        style={{ padding: 12 }}
      />
    );
  }

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: '#fafafa',
      }}
    >
      <thead>
        <tr>
          <th
            style={{
              textAlign: 'left',
              padding: '6px 12px',
              fontSize: 11,
              color: '#888',
              fontWeight: 500,
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            Category
          </th>
          <th
            style={{
              textAlign: 'left',
              padding: '6px 12px',
              fontSize: 11,
              color: '#888',
              fontWeight: 500,
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            Ranked vendors{facilityState ? ` covering ${facilityState}` : ''}
          </th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
};

export default CategoryCoverageRow;
