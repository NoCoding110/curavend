/**
 * Vendor scorecard snapshots — monthly rollups computed by nightly cron.
 */
import React, { useEffect, useState } from 'react';
import { Button, Card, Col, InputNumber, Row, Space, Table, Tag, Typography, message } from 'antd';
import { TrophyOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const VendorScorecardsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fy, setFy] = useState(new Date().getFullYear());
  const [computing, setComputing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: any[] }>(`/reporting/vendor-scorecard?fiscalYear=${fy}`);
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    (async () => {
      try { const r = await get<any>('/vendors?limit=500'); setVendors(r.items ?? r ?? []); }
      catch { /* noop */ }
    })();
  }, [fy]);

  const compute = async () => {
    setComputing(true);
    try {
      const r = await post<any>('/reporting/vendor-scorecard/compute', {});
      message.success(`Computed ${r.snapshotsWritten} snapshots`);
      void load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setComputing(false); }
  };

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id.slice(0, 8);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><TrophyOutlined /> Vendor Scorecards</Space>
          </Title>
          <Text type="secondary">Monthly snapshots auto-computed at 08:00 UTC. Metrics: on-time, fill rate, defect rate, match accuracy, lead time.</Text>
        </Col>
        <Col>
          <Space>
            <InputNumber min={2020} max={2100} value={fy} onChange={(v) => setFy(Number(v) || new Date().getFullYear())} addonBefore="FY" />
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button icon={<ThunderboltOutlined />} loading={computing} onClick={compute}>Compute now</Button>
          </Space>
        </Col>
      </Row>

      <Card size="small">
        <Table size="small" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 100 }}
          columns={[
            { title: 'Vendor', dataIndex: 'vendorId', width: 220, render: vendorName },
            { title: 'Period', width: 100, render: (_, r: any) => <Tag>{r.fiscalYear}/{r.fiscalPeriod}</Tag> },
            { title: 'POs', dataIndex: 'posTotal', width: 70, align: 'right' as const },
            { title: 'Received', dataIndex: 'posReceived', width: 90, align: 'right' as const },
            {
              title: 'On-time %', dataIndex: 'onTimePct', width: 110, align: 'right' as const,
              render: (v) => v != null ? <Tag color={v >= 95 ? 'green' : v >= 85 ? 'orange' : 'red'}>{v.toFixed(0)}%</Tag> : '—',
            },
            {
              title: 'Fill %', dataIndex: 'fillRatePct', width: 90, align: 'right' as const,
              render: (v) => v != null ? `${v.toFixed(0)}%` : '—',
            },
            {
              title: 'Defect %', dataIndex: 'defectRatePct', width: 100, align: 'right' as const,
              render: (v) => v != null ? <Tag color={v > 2 ? 'red' : 'green'}>{v.toFixed(1)}%</Tag> : '—',
            },
            {
              title: 'Lead (d)', dataIndex: 'avgLeadTimeDays', width: 100, align: 'right' as const,
              render: (v) => v != null ? v.toFixed(1) : '—',
            },
            {
              title: 'Spend', dataIndex: 'totalSpendUsd', width: 120, align: 'right' as const,
              render: (v) => v != null ? `$${Number(v).toLocaleString()}` : '—',
            },
            { title: 'Computed', dataIndex: 'computedAt', width: 160, render: (v) => new Date(v).toLocaleString() },
          ]}
        />
      </Card>
    </PageWrap>
  );
};

export default VendorScorecardsPage;
