/**
 * Price variance — bought price vs contract price.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { DollarOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const PriceVariancePage: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [rollup, setRollup] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<any>('/reporting/price-variance');
      setItems(r.items ?? []);
      setRollup(r.rollup ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const totalOverpay = items.reduce((s, r) => s + Math.max(0, Number(r.delta_total ?? 0)), 0);
  const totalUnderpay = items.reduce((s, r) => s + Math.min(0, Number(r.delta_total ?? 0)), 0);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><DollarOutlined /> Price Variance</Space>
          </Title>
          <Text type="secondary">PO line unit price vs active contract unit price. Positive = overpaid.</Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button></Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={8}><Card size="small"><Statistic title="Variance lines" value={items.length} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Total overpaid" value={totalOverpay} prefix="$" precision={2} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Total underpaid (savings)" value={Math.abs(totalUnderpay)} prefix="$" precision={2} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      {rollup.length > 0 && (
        <Card size="small" title="Per-vendor rollup" style={{ marginBottom: 12 }}>
          <Table size="small" rowKey="vendorId" pagination={false} dataSource={rollup}
            columns={[
              { title: 'Vendor', dataIndex: 'vendorId', width: 220, render: (v: string) => <Text code>{v.slice(0, 8)}</Text> },
              { title: 'Lines', dataIndex: 'lineCount', width: 90, align: 'right' as const },
              { title: 'Total delta', dataIndex: 'totalDelta', align: 'right' as const, render: (v: number) => <strong style={{ color: v > 0 ? '#cf1322' : '#52c41a' }}>{v > 0 ? '+' : ''}${v.toFixed(2)}</strong> },
            ]}
          />
        </Card>
      )}

      <Card size="small" title="Top variance lines">
        <Table size="small" rowKey={(r: any) => `${r.order_id}-${r.hcpc_code}`} loading={loading} dataSource={items} pagination={{ pageSize: 100 }}
          columns={[
            { title: 'HCPC', dataIndex: 'hcpc_code', width: 100 },
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Vendor', dataIndex: 'vendor_id', width: 180, render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> : '—' },
            { title: 'Bought', dataIndex: 'bought_price', width: 100, align: 'right' as const, render: (v) => `$${Number(v).toFixed(2)}` },
            { title: 'Contract', dataIndex: 'contract_price', width: 110, align: 'right' as const, render: (v) => `$${Number(v).toFixed(2)}` },
            { title: 'Δ/unit', dataIndex: 'delta_per_unit', width: 100, align: 'right' as const, render: (v) => <Tag color={v > 0 ? 'red' : 'green'}>{v > 0 ? '+' : ''}${Number(v).toFixed(2)}</Tag> },
            { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' as const },
            { title: 'Δ total', dataIndex: 'delta_total', width: 110, align: 'right' as const, render: (v) => <strong style={{ color: v > 0 ? '#cf1322' : '#52c41a' }}>{v > 0 ? '+' : ''}${Number(v).toFixed(2)}</strong> },
          ]}
        />
      </Card>
    </PageWrap>
  );
};

export default PriceVariancePage;
