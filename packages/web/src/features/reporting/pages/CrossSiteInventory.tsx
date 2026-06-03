/**
 * Cross-site inventory — one row per consumable, columns per site.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { GlobalOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { useAdminHospitalSelect } from '../../../hooks/useAdminHospitalSelect';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface SiteRef { id: string; name: string }
interface ItemRow {
  consumableId: string;
  itemCode: string;
  description: string;
  category: string;
  totalOnHand: number;
  sites: { siteId: string; onHand: number; status: string }[];
}

const STATUS_COLOR: Record<string, string> = { OK: 'green', LOW: 'orange', CRITICAL: 'red' };

const CrossSiteInventoryPage: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [sitesIndex, setSitesIndex] = useState<SiteRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [belowOnly, setBelowOnly] = useState(false);

  const load = async () => {
    if (isAdmin && !adminHospital.selectedId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (belowOnly) params.belowReorder = 1;
      if (isAdmin && adminHospital.selectedId) params.hospitalId = adminHospital.selectedId;
      const r = await get<{ items: ItemRow[]; sitesIndex: SiteRef[] }>(
        '/reporting/cross-site-inventory',
        params,
      );
      setItems(r.items ?? []);
      setSitesIndex(r.sitesIndex ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [belowOnly, adminHospital.selectedId]);

  // Build dynamic columns: one per site + a total.
  const columns: any[] = [
    { title: 'Item', dataIndex: 'itemCode', width: 110, fixed: 'left' as const, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Description', dataIndex: 'description', width: 240, fixed: 'left' as const, ellipsis: true },
    { title: 'Cat', dataIndex: 'category', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Total', dataIndex: 'totalOnHand', width: 90, align: 'right' as const, render: (v: number) => <strong>{v}</strong> },
    ...sitesIndex.map((s) => ({
      title: s.name,
      key: `site-${s.id}`,
      width: 110,
      align: 'right' as const,
      render: (_: any, r: ItemRow) => {
        const site = r.sites.find((x) => x.siteId === s.id);
        if (!site) return <Text type="secondary">—</Text>;
        return (
          <Space size={4}>
            <span>{site.onHand}</span>
            {site.status !== 'OK' && <Tag color={STATUS_COLOR[site.status]} style={{ marginInlineEnd: 0 }}>{site.status}</Tag>}
          </Space>
        );
      },
    })),
  ];

  if (isAdmin && !adminHospital.selectedId) {
    return (
      <PageWrap>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Select a hospital to view this report"
          description={
            <Select
              placeholder="Select hospital…"
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280, marginTop: 8 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          }
        />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      {isAdmin && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <span>Hospital:</span>
            <Select
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          </Space>
        </Card>
      )}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><GlobalOutlined /> Cross-Site Inventory</Space>
          </Title>
          <Text type="secondary">Per-consumable stock across every site in your tenant. LOW = below reorder point, CRITICAL = below min.</Text>
        </Col>
        <Col>
          <Space>
            <Switch checked={belowOnly} onChange={setBelowOnly} /> <Text>Only show items LOW/CRITICAL anywhere</Text>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Card size="small">
        <Table<ItemRow>
          rowKey="consumableId"
          size="small"
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 100 }}
        />
      </Card>
    </PageWrap>
  );
};

export default CrossSiteInventoryPage;
