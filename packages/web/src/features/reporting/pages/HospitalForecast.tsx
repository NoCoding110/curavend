/**
 * Hospital demand forecast (12-month trailing + seasonality projection).
 */
import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Space, Table, Tag, Typography, message } from 'antd';
import { LineChartOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface ForecastRow {
  hcpcCode: string;
  description: string | null;
  trailing12Total: number;
  trailing12Avg: number;
  projections: { month: string; projectedQty: number }[];
}

const HospitalForecastPage: React.FC = () => {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [meta, setMeta] = useState<{ runAt: string; cached: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<any>('/reporting/hospital-forecast');
      setRows(r.items ?? []);
      setMeta({ runAt: r.runAt, cached: r.cached });
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const recompute = async () => {
    setRunning(true);
    try {
      const r = await post<any>('/reporting/hospital-forecast/run', {});
      setRows(r.items ?? []);
      setMeta({ runAt: new Date().toISOString(), cached: false });
      message.success('Recomputed');
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setRunning(false); }
  };

  // Build dynamic projection columns from first row's projections array.
  const horizonMonths = rows[0]?.projections.map((p) => p.month) ?? [];
  const columns: any[] = [
    { title: 'HCPC', dataIndex: 'hcpcCode', width: 100, fixed: 'left' as const },
    { title: 'Description', dataIndex: 'description', width: 240, ellipsis: true, fixed: 'left' as const },
    { title: '12mo total', dataIndex: 'trailing12Total', width: 110, align: 'right' as const },
    { title: '12mo avg', dataIndex: 'trailing12Avg', width: 110, align: 'right' as const },
    ...horizonMonths.map((m, idx) => ({
      title: m,
      width: 110,
      align: 'right' as const,
      render: (_: any, r: ForecastRow) => <strong>{r.projections[idx]?.projectedQty ?? '—'}</strong>,
    })),
  ];

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><LineChartOutlined /> Hospital Demand Forecast</Space>
          </Title>
          <Text type="secondary">
            12-month trailing average × month-of-year seasonality factor. Cached daily.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Reload</Button>
            <Button icon={<ThunderboltOutlined />} loading={running} onClick={recompute}>Recompute</Button>
          </Space>
        </Col>
      </Row>

      {meta && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <span>Run at: {new Date(meta.runAt).toLocaleString()}</span>
            <Tag color={meta.cached ? 'default' : 'green'}>{meta.cached ? 'cached' : 'fresh'}</Tag>
            <span>{rows.length} HCPCs</span>
          </Space>
        </Card>
      )}

      <Card size="small">
        <Table<ForecastRow>
          rowKey="hcpcCode" size="small" loading={loading} dataSource={rows}
          columns={columns} scroll={{ x: 'max-content' }} pagination={{ pageSize: 100 }}
        />
      </Card>
    </PageWrap>
  );
};

export default HospitalForecastPage;
