/**
 * Vendor Coverage — read-only matrix for hospital users.
 *
 * Phase A: rows = facilities (expandable), expanded row shows per-category
 * sub-table with ranked vendor pills. Toolbar adds category multi-select,
 * vendor multi-select, and a "Show only gaps" toggle.
 *
 * Click a vendor pill (or the legacy compact cell) → opens the existing
 * per-pair drill-down Drawer with VendorLocationsList.
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import {
  useVendorCoverageMatrix,
  fetchCoverageForPair,
  type CoverageVendorDetail,
  type ItemCategory,
} from '../hooks/useVendorCoverage';
import VendorLocationsList from '../../vendors/components/VendorLocationsList';
import CategoryCoverageRow from '../components/CategoryCoverageRow';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

const VendorCoveragePage: React.FC = () => {
  const [activeOnly, setActiveOnly] = useState(true);
  // Phase A: byCategory mode is the default for hospital users.
  const [byCategory, setByCategory] = useState(true);
  const { data, loading, error, refetch } = useVendorCoverageMatrix(
    activeOnly,
    byCategory,
  );

  // Phase A toolbar filters
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string[]>([]);
  const [showOnlyGaps, setShowOnlyGaps] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerDetail, setDrawerDetail] = useState<CoverageVendorDetail | null>(null);
  const [drawerFacility, setDrawerFacility] = useState<{
    id: string;
    name: string;
    state: string | null;
  } | null>(null);

  const facilities = data?.facilities ?? [];
  const vendors = data?.vendors ?? [];
  const categories = data?.categories ?? [];

  const openCell = async (
    facility: typeof facilities[number],
    vendorId: string,
  ) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerDetail(null);
    setDrawerFacility({
      id: facility.id,
      name: facility.name,
      state: facility.state ?? null,
    });
    try {
      const detail = await fetchCoverageForPair(facility.id, vendorId);
      setDrawerDetail(detail);
    } finally {
      setDrawerLoading(false);
    }
  };

  // ─────────────── Empty-state hint: most hospital_vendors uncategorised ──
  // We can't see the raw hospital_vendors rows from the matrix payload, but
  // we can infer it: when byCategory=1, every vendor that appears in EVERY
  // category cell almost certainly has item_categories=NULL. If ≥80% of
  // (vendor, category) cells are populated, surface a hygiene hint.
  const showCategoryHint = useMemo(() => {
    if (!byCategory || !data?.categoryCoverage) return false;
    let total = 0;
    let populated = 0;
    for (const facilityId of Object.keys(data.categoryCoverage)) {
      const fcc = data.categoryCoverage[facilityId];
      for (const cat of categories) {
        total += vendors.length;
        const cell = fcc[cat];
        if (cell?.rankedVendors?.length) {
          populated += cell.rankedVendors.length;
        }
      }
    }
    if (total === 0 || vendors.length === 0) return false;
    return populated / total >= 0.8;
  }, [byCategory, data, categories, vendors]);

  // ─────────────── Legacy flat matrix columns (when byCategory=off) ───────
  const tableColumns = useMemo(() => {
    if (byCategory) {
      // Single facility column — sub-rows render the per-category data
      return [
        {
          title: 'Facility',
          dataIndex: 'name',
          key: 'facility',
          render: (_: any, row: any) => (
            <div>
              <Text strong>{row.name}</Text>
              <div style={{ fontSize: 12, color: '#888' }}>
                {[row.city, row.state, row.zip].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          ),
        },
      ];
    }

    const cols: any[] = [
      {
        title: 'Facility',
        dataIndex: 'name',
        key: 'facility',
        fixed: 'left',
        width: 220,
        render: (_: any, row: any) => (
          <div>
            <Text strong>{row.name}</Text>
            <div style={{ fontSize: 12, color: '#888' }}>
              {[row.city, row.state, row.zip].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        ),
      },
    ];
    for (const v of vendors) {
      cols.push({
        title: v.name || '—',
        key: `vendor-${v.id}`,
        align: 'center' as const,
        width: 180,
        render: (_: any, row: any) => {
          const cell = data?.cells?.[row.id]?.[v.id];
          if (!cell) return <Text type="secondary">—</Text>;
          const { branchesServing, bestSlaHours, capabilityUnion, branchesTotal } = cell;
          if (branchesServing === 0) {
            return (
              <Tooltip
                title={
                  branchesTotal === 0
                    ? `${v.name ?? 'This vendor'} has no active branches`
                    : `No branches of ${v.name ?? 'this vendor'} serve ${row.state ?? 'this facility'}`
                }
              >
                <Button type="link" size="small" onClick={() => openCell(row, v.id)}>
                  —
                </Button>
              </Tooltip>
            );
          }
          const tipLines = [
            `${branchesServing} branch${branchesServing > 1 ? 'es' : ''} serving ${row.state ?? 'facility'}`,
            capabilityUnion?.length ? `Capabilities: ${capabilityUnion.join(', ')}` : '',
            typeof bestSlaHours === 'number' ? `Best SLA: ${bestSlaHours}h` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Tooltip title={tipLines}>
              <Button type="link" size="small" onClick={() => openCell(row, v.id)}>
                <Tag color="success" style={{ marginRight: 0 }}>
                  {branchesServing} branch{branchesServing > 1 ? 'es' : ''}
                  {typeof bestSlaHours === 'number' ? ` · ${bestSlaHours}h` : ''}
                </Tag>
              </Button>
            </Tooltip>
          );
        },
      });
    }
    return cols;
  }, [vendors, data, byCategory]);

  const expandable =
    byCategory && data?.categoryCoverage
      ? {
          expandedRowRender: (row: any) => {
            const facilityCoverage = data.categoryCoverage?.[row.id];
            if (!facilityCoverage) return null;
            return (
              <CategoryCoverageRow
                facilityId={row.id}
                facilityState={row.state ?? null}
                categories={categories}
                categoryCoverage={facilityCoverage}
                categoryFilter={categoryFilter}
                vendorFilter={vendorFilter}
                showOnlyGaps={showOnlyGaps}
                onPillClick={(vendorId, facilityId) => {
                  const facility = facilities.find((f) => f.id === facilityId);
                  if (facility) openCell(facility, vendorId);
                }}
              />
            );
          },
          // Default expand-all when filters applied so the user sees results
          defaultExpandAllRows:
            categoryFilter.length > 0 || vendorFilter.length > 0 || showOnlyGaps,
        }
      : undefined;

  if (error) {
    return (
      <PageWrapper>
        <Alert type="error" message={error} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Space
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Vendor Coverage
          </Title>
          <Text type="secondary">
            Which of your linked vendor branches serve each of your facilities,
            broken down by item category.
          </Text>
        </div>
        <Space>
          <span style={{ fontSize: 13 }}>By category</span>
          <Switch checked={byCategory} onChange={setByCategory} />
          <span style={{ fontSize: 13 }}>Active vendors only</span>
          <Switch checked={activeOnly} onChange={setActiveOnly} />
          <Button icon={<ReloadOutlined />} onClick={refetch}>
            Refresh
          </Button>
        </Space>
      </Space>

      {byCategory && (
        <Card
          size="small"
          style={{ marginBottom: 12 }}
          bodyStyle={{ padding: 12 }}
        >
          <Space wrap size={[12, 8]}>
            <span style={{ fontSize: 12, color: '#666' }}>Filter:</span>
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 220 }}
              size="small"
              placeholder="Categories"
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v as ItemCategory[])}
              options={categories.map((c) => ({
                label: c.replace('_', ' '),
                value: c,
              }))}
            />
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 240 }}
              size="small"
              placeholder="Vendors"
              value={vendorFilter}
              onChange={(v) => setVendorFilter(v as string[])}
              options={vendors.map((v) => ({
                label: v.name || v.id,
                value: v.id,
              }))}
            />
            <Space size={6}>
              <Switch
                size="small"
                checked={showOnlyGaps}
                onChange={setShowOnlyGaps}
              />
              <span style={{ fontSize: 12 }}>Show only gaps</span>
            </Space>
            {(categoryFilter.length > 0 ||
              vendorFilter.length > 0 ||
              showOnlyGaps) && (
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setCategoryFilter([]);
                  setVendorFilter([]);
                  setShowOnlyGaps(false);
                }}
              >
                Clear filters
              </Button>
            )}
          </Space>
        </Card>
      )}

      {showCategoryHint && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Most of your vendor preferences aren't categorised — every vendor appears under every category. Open My Vendors and set Categories on each link to make this view more accurate."
        />
      )}

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="Loading coverage…" />
          </div>
        ) : facilities.length === 0 || vendors.length === 0 ? (
          <Empty
            description={
              facilities.length === 0
                ? 'No facilities found for your hospital. Add facilities first.'
                : 'No vendors are linked to your hospital yet.'
            }
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={facilities}
            columns={tableColumns}
            pagination={false}
            size="middle"
            scroll={{ x: 'max-content' }}
            expandable={expandable}
          />
        )}
      </Card>

      <Drawer
        title={
          drawerDetail
            ? `${drawerDetail.vendorName ?? 'Vendor'} — ${drawerFacility?.name ?? ''}`
            : 'Vendor branches'
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {drawerLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="Loading branches…" />
          </div>
        ) : drawerDetail ? (
          <>
            {drawerDetail.summary.branchesServing === 0 && (
              <Alert
                type="warning"
                showIcon
                message={`No branches serve ${drawerFacility?.state ?? 'this facility'}.`}
                style={{ marginBottom: 12 }}
              />
            )}
            <VendorLocationsList
              locations={drawerDetail.locations.map((l) => ({
                id: l.id,
                name: l.name,
                locationType: l.locationType,
                city: l.city,
                state: l.state,
                capabilities: l.capabilities,
                serviceStates: l.serviceStates,
                maxDeliveryHours: l.maxDeliveryHours,
                isPrimary: l.isPrimary ? 1 : 0,
              }))}
              facilityState={drawerFacility?.state ?? null}
              servesFacilityById={Object.fromEntries(
                drawerDetail.locations.map((l) => [l.id, l.servesFacility]),
              )}
              emptyText="This vendor has no active branches."
            />
          </>
        ) : (
          <Empty />
        )}
      </Drawer>
    </PageWrapper>
  );
};

export default VendorCoveragePage;
