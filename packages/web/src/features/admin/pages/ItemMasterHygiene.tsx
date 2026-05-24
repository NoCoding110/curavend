/**
 * Admin: Item master hygiene — duplicates, missing fields, ERP-unmapped.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { ClearOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const ItemMasterHygienePage: React.FC = () => {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [missing, setMissing] = useState<any[]>([]);
  const [unmapped, setUnmapped] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [d, m, u] = await Promise.all([
        get<{ items: any[] }>('/item-master-hygiene/duplicates'),
        get<{ items: any[] }>('/item-master-hygiene/missing'),
        get<{ items: any[] }>('/item-master-hygiene/unmapped'),
      ]);
      setDuplicates(d.items ?? []);
      setMissing(m.items ?? []);
      setUnmapped(u.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><WarningOutlined /> Item Master Hygiene</Space>
          </Title>
          <Text type="secondary">Surface duplicates, missing fields, and items not mapped to any vendor SKU.</Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button></Col>
      </Row>

      <Tabs
        defaultActiveKey="dup"
        items={[
          {
            key: 'dup',
            label: `Duplicates (${duplicates.length})`,
            children: (
              <Card size="small">
                <Alert type="info" showIcon style={{ marginBottom: 12 }}
                  message="Groups of formulary items sharing the same HCPC and a similar (first 40 chars) description. Review and merge." />
                <Table
                  size="small" rowKey={(r: any) => `${r.hcpcCode}-${r.descKey}`}
                  dataSource={duplicates}
                  columns={[
                    { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
                    { title: 'Description key', dataIndex: 'descKey', ellipsis: true },
                    { title: 'Rows', dataIndex: 'rowCount', width: 80, align: 'right' as const, render: (v) => <Tag color="orange">{v}</Tag> },
                    { title: 'IDs', dataIndex: 'ids', render: (ids: string[]) => <Text code style={{ fontSize: 11 }}>{ids.join(', ')}</Text> },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'missing',
            label: `Missing fields (${missing.length})`,
            children: (
              <Card size="small">
                <Table
                  size="small" rowKey="id" dataSource={missing}
                  columns={[
                    { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
                    { title: 'Description', dataIndex: 'description', ellipsis: true, render: (v) => v ?? <Text type="danger">—</Text> },
                    {
                      title: 'Missing', dataIndex: 'missingFields', width: 280,
                      render: (fields: string[]) => fields.map((f) => <Tag key={f} color="red">{f}</Tag>),
                    },
                    { title: 'Created', dataIndex: 'createdAt', width: 130, render: (v) => new Date(v).toLocaleDateString() },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'unmapped',
            label: `Unmapped to vendor SKU (${unmapped.length})`,
            children: (
              <Card size="small">
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message="These formulary items have no vendor_item_skus row — they cannot be purchased through any vendor today." />
                <Table
                  size="small" rowKey="id" dataSource={unmapped}
                  columns={[
                    { title: 'HCPC', dataIndex: 'hcpc_code', width: 100 },
                    { title: 'Description', dataIndex: 'description', ellipsis: true },
                    { title: 'Preferred vendor', dataIndex: 'preferred_vendor_id', width: 200, render: (v: string | null) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> : <Tag>none</Tag> },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
    </PageWrap>
  );
};

export default ItemMasterHygienePage;
