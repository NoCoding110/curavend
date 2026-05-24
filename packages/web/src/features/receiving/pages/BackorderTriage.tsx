/**
 * Backorder triage — aging buckets + suggested substitutes + bulk actions.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Empty, Row, Space, Table, Tag, Typography, message,
} from 'antd';
import { ReloadOutlined, BulbOutlined, ClockCircleOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const BUCKET_COLOR: Record<string, string> = { FRESH: 'green', WEEK: 'cyan', AGING: 'orange', STALE: 'red' };

interface TriageRow {
  id: string;
  orderId: string;
  hcpcCode: string | null;
  description: string | null;
  quantityRemaining: number;
  expectedFulfillmentDate: string | null;
  ageDays: number;
  bucket: string;
  orderVendorId: string;
  createdAt: string;
}

const BackorderTriagePage: React.FC = () => {
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [subs, setSubs] = useState<{ rowId: string | null; items: any[] }>({ rowId: null, items: [] });

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: TriageRow[]; counts: Record<string, number>; total: number }>('/backorders/triage');
      setRows(r.items ?? []);
      setCounts(r.counts ?? {});
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const loadSubs = async (rowId: string) => {
    try {
      const r = await get<{ items: any[] }>(`/backorders/${rowId}/suggested-substitutes`);
      setSubs({ rowId, items: r.items ?? [] });
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const fulfill = async (rowId: string, qty: number) => {
    try {
      await post(`/backorders/${rowId}/fulfill`, { quantity: qty });
      message.success('Fulfilled');
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const cancel = async (rowId: string) => {
    try {
      await post(`/backorders/${rowId}/cancel`, {});
      message.success('Cancelled');
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><ClockCircleOutlined /> Backorder Triage</Space>
          </Title>
          <Text type="secondary">Open backorders with aging buckets and substitute suggestions.</Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button></Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        {Object.entries({ FRESH: '≤3d', WEEK: '4-7d', AGING: '8-21d', STALE: '>21d' }).map(([b, label]) => (
          <Col span={6} key={b}>
            <Card size="small">
              <Space direction="vertical" size={0}>
                <Tag color={BUCKET_COLOR[b]}>{b}</Tag>
                <strong style={{ fontSize: 22 }}>{counts[b] ?? 0}</strong>
                <Text type="secondary">{label}</Text>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card size="small">
        <Table<TriageRow>
          rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 100 }}
          columns={[
            { title: 'Age', dataIndex: 'ageDays', width: 90, render: (v, r) => <Space><Tag color={BUCKET_COLOR[r.bucket]}>{r.bucket}</Tag>{v}d</Space> },
            { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Remaining', dataIndex: 'quantityRemaining', width: 100, align: 'right' as const },
            {
              title: 'Expected', dataIndex: 'expectedFulfillmentDate', width: 130,
              render: (v) => v ? new Date(v).toLocaleDateString() : <Tag>none</Tag>,
            },
            { title: 'Vendor', dataIndex: 'orderVendorId', width: 180, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> },
            {
              title: 'Actions', width: 320,
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<BulbOutlined />} onClick={() => loadSubs(r.id)}>
                    Substitutes
                  </Button>
                  <Button size="small" onClick={() => fulfill(r.id, r.quantityRemaining)}>
                    Fulfill all
                  </Button>
                  <Button size="small" danger onClick={() => cancel(r.id)}>Cancel</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title="Suggested substitutes"
        open={!!subs.rowId}
        onClose={() => setSubs({ rowId: null, items: [] })}
        width={520}
      >
        {subs.items.length === 0 ? (
          <Empty description="No substitutes on file for this item" />
        ) : (
          <Table
            size="small" rowKey="id" pagination={false}
            dataSource={subs.items}
            columns={[
              { title: 'Priority', dataIndex: 'priority', width: 80, render: (v) => <Tag>{v}</Tag> },
              { title: 'HCPC', dataIndex: 'substituteHcpcCode', width: 110 },
              { title: 'Description', dataIndex: 'substituteDescription', ellipsis: true },
              { title: 'Notes', dataIndex: 'notes', ellipsis: true },
            ]}
          />
        )}
      </Drawer>
    </PageWrap>
  );
};

export default BackorderTriagePage;
