/**
 * Department spend dashboard — per-department burn-down with over-budget flags.
 */
import React, { useEffect, useState } from 'react';
import {
  Card, Col, InputNumber, Progress, Row, Space, Statistic, Table, Tag, Typography, message,
} from 'antd';
import { ReloadOutlined, BarChartOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { Button } from 'antd';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface DeptSpend {
  departmentId: string;
  departmentName: string;
  costCenter: string | null;
  glCode: string | null;
  serviceLine: string | null;
  fiscalYear: number;
  budgetAmountUsd: number | null;
  committedUsd: number;
  consumedUsd: number;
  availableUsd: number | null;
  burnPct: number | null;
  overBudget: boolean;
}

const DepartmentSpendPage: React.FC = () => {
  const [rows, setRows] = useState<DeptSpend[]>([]);
  const [totals, setTotals] = useState({ budgetAmountUsd: 0, committedUsd: 0, consumedUsd: 0 });
  const [fy, setFy] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: DeptSpend[]; totals: typeof totals }>(
        `/reporting/department-spend?fiscalYear=${fy}`,
      );
      setRows(r.items ?? []);
      setTotals(r.totals);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [fy]);

  const totalBurn = totals.budgetAmountUsd > 0
    ? Math.round(((totals.committedUsd + totals.consumedUsd) / totals.budgetAmountUsd) * 100)
    : 0;

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><BarChartOutlined /> Department Spend</Space>
          </Title>
          <Text type="secondary">Per-department budget burn-down with over-budget flags. FY-scoped.</Text>
        </Col>
        <Col>
          <Space>
            <InputNumber
              value={fy}
              min={2020}
              max={2100}
              onChange={(v) => setFy(Number(v) || new Date().getFullYear())}
              addonBefore="FY"
            />
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Total budget" value={totals.budgetAmountUsd} prefix="$" precision={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Committed" value={totals.committedUsd} prefix="$" precision={0} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Consumed" value={totals.consumedUsd} prefix="$" precision={0} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>Total burn</Text>
            <Progress percent={Math.min(totalBurn, 100)} status={totalBurn > 100 ? 'exception' : totalBurn > 80 ? 'active' : 'success'} />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Table<DeptSpend>
          rowKey="departmentId"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Department', dataIndex: 'departmentName' },
            { title: 'Cost center', dataIndex: 'costCenter', width: 140, render: (v) => v ?? '—' },
            { title: 'Service line', dataIndex: 'serviceLine', width: 140, render: (v) => v ?? '—' },
            { title: 'GL code', dataIndex: 'glCode', width: 110, render: (v) => v ?? '—' },
            {
              title: 'Budget', dataIndex: 'budgetAmountUsd', align: 'right' as const, width: 110,
              render: (v) => v != null ? `$${v.toLocaleString()}` : <Text type="secondary">none</Text>,
            },
            {
              title: 'Committed', dataIndex: 'committedUsd', align: 'right' as const, width: 110,
              render: (v) => `$${v.toLocaleString()}`,
            },
            {
              title: 'Consumed', dataIndex: 'consumedUsd', align: 'right' as const, width: 110,
              render: (v) => `$${v.toLocaleString()}`,
            },
            {
              title: 'Available', dataIndex: 'availableUsd', align: 'right' as const, width: 120,
              render: (v) =>
                v == null ? <Text type="secondary">—</Text> :
                  <strong style={{ color: v < 0 ? '#cf1322' : '#52c41a' }}>
                    {v < 0 ? '−' : ''}${Math.abs(v).toLocaleString()}
                  </strong>,
            },
            {
              title: 'Burn', dataIndex: 'burnPct', width: 130,
              render: (pct, r) => pct == null ? '—' : (
                <Progress
                  percent={Math.min(pct, 100)}
                  size="small"
                  status={r.overBudget ? 'exception' : pct > 80 ? 'active' : 'success'}
                  format={() => `${pct}%`}
                />
              ),
            },
            {
              title: 'Status', width: 110,
              render: (_, r) =>
                r.overBudget ? <Tag color="red">OVER</Tag> :
                  r.burnPct != null && r.burnPct > 80 ? <Tag color="orange">HIGH</Tag> :
                    r.budgetAmountUsd == null ? <Tag>UNBUDGETED</Tag> :
                      <Tag color="green">OK</Tag>,
            },
          ]}
        />
      </Card>
    </PageWrap>
  );
};

export default DepartmentSpendPage;
