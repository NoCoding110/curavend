/**
 * Multi-site spend dashboard.
 *
 * Three rollups:
 *   1. By facility (with drill-down to departments)
 *   2. By department (across facilities)
 *   3. Cross-facility scorecard with exception counts
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Col,
  DatePicker,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  Button,
  Select,
} from 'antd';
import { ReloadOutlined, BankOutlined, AppstoreOutlined, AlertOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const PageWrap = styled.div`padding: 24px;`;

interface FacilityRow {
  facility_id: string;
  facility_name: string;
  city?: string;
  state?: string;
  invoice_count: number;
  order_count: number;
  total_spend_usd: number;
}
interface DepartmentRow {
  department_id: string;
  department_name: string;
  invoice_count: number;
  total_spend_usd: number;
}
interface RollupRow extends FacilityRow {
  hospital_id: string;
  hospital_name: string;
  exception_count: number;
}

export const MultiSiteSpendPage: React.FC = () => {
  const [facilityRows, setFacilityRows] = useState<FacilityRow[]>([]);
  const [departmentRows, setDepartmentRows] = useState<DepartmentRow[]>([]);
  const [rollupRows, setRollupRows] = useState<RollupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [facilityFilter, setFacilityFilter] = useState<string>('');

  const fetch = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: range[0].format('YYYY-MM-DD'),
        endDate: range[1].format('YYYY-MM-DD'),
      };
      const [f, d, r] = await Promise.all([
        get<{ items: FacilityRow[] }>('/reports/spend-by-facility', params),
        get<{ items: DepartmentRow[] }>('/reports/spend-by-department', {
          ...params,
          facilityId: facilityFilter || undefined,
        } as any),
        get<{ items: RollupRow[] }>('/reports/multi-site-rollup', params),
      ]);
      setFacilityRows(f.items ?? []);
      setDepartmentRows(d.items ?? []);
      setRollupRows(r.items ?? []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range, facilityFilter]);

  const totalSpend = rollupRows.reduce((s, r) => s + (Number(r.total_spend_usd) || 0), 0);
  const totalInvoices = rollupRows.reduce((s, r) => s + (Number(r.invoice_count) || 0), 0);
  const totalOrders = rollupRows.reduce((s, r) => s + (Number(r.order_count) || 0), 0);
  const totalExceptions = rollupRows.reduce((s, r) => s + (Number(r.exception_count) || 0), 0);

  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Multi-site Spend</Title>
          <Text type="secondary">Cross-facility and cross-department spend rollups with exception flags.</Text>
        </Col>
        <Col>
          <Space>
            <RangePicker value={range} onChange={(v) => v && setRange(v as any)} />
            <Button icon={<ReloadOutlined />} onClick={() => void fetch()}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Total spend" value={fmt(totalSpend)} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Invoices" value={totalInvoices} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Orders" value={totalOrders} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Match exceptions" value={totalExceptions} valueStyle={{ color: totalExceptions > 0 ? '#cf1322' : '#52c41a' }} /></Card></Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'rollup',
            label: <Space><BankOutlined /> Cross-site rollup</Space>,
            children: (
              <Card size="small">
                <Table<RollupRow>
                  size="small"
                  rowKey="facility_id"
                  loading={loading}
                  dataSource={rollupRows}
                  columns={[
                    { title: 'Hospital', dataIndex: 'hospital_name', width: 200, ellipsis: true },
                    { title: 'Facility', dataIndex: 'facility_name', width: 200, ellipsis: true },
                    { title: 'Orders', dataIndex: 'order_count', width: 90, align: 'right' },
                    { title: 'Invoices', dataIndex: 'invoice_count', width: 100, align: 'right' },
                    { title: 'Spend', dataIndex: 'total_spend_usd', width: 130, align: 'right', render: fmt },
                    {
                      title: 'Exceptions',
                      dataIndex: 'exception_count',
                      width: 110,
                      align: 'right',
                      render: (v: number) =>
                        v > 0 ? <Tag color="red" icon={<AlertOutlined />}>{v}</Tag> : <Tag color="green">0</Tag>,
                    },
                  ]}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: 'facility',
            label: <Space><BankOutlined /> By facility</Space>,
            children: (
              <Card size="small">
                <Table<FacilityRow>
                  size="small"
                  rowKey="facility_id"
                  loading={loading}
                  dataSource={facilityRows}
                  columns={[
                    {
                      title: 'Facility',
                      dataIndex: 'facility_name',
                      render: (v, r) => (
                        <a onClick={() => setFacilityFilter(r.facility_id === 'unassigned' ? '' : r.facility_id)}>
                          {v}
                        </a>
                      ),
                    },
                    { title: 'City', dataIndex: 'city', width: 140 },
                    { title: 'State', dataIndex: 'state', width: 80 },
                    { title: 'Orders', dataIndex: 'order_count', width: 90, align: 'right' },
                    { title: 'Invoices', dataIndex: 'invoice_count', width: 100, align: 'right' },
                    { title: 'Spend', dataIndex: 'total_spend_usd', width: 130, align: 'right', render: fmt },
                  ]}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: 'department',
            label: <Space><AppstoreOutlined /> By department</Space>,
            children: (
              <Card
                size="small"
                extra={
                  <Space>
                    <Text type="secondary">Filter by facility:</Text>
                    <Select
                      allowClear
                      style={{ width: 240 }}
                      placeholder="All facilities"
                      value={facilityFilter || undefined}
                      onChange={(v) => setFacilityFilter(v ?? '')}
                      options={facilityRows
                        .filter((f) => f.facility_id !== 'unassigned')
                        .map((f) => ({ value: f.facility_id, label: f.facility_name }))}
                    />
                  </Space>
                }
              >
                <Table<DepartmentRow>
                  size="small"
                  rowKey="department_id"
                  loading={loading}
                  dataSource={departmentRows}
                  columns={[
                    { title: 'Department', dataIndex: 'department_name' },
                    { title: 'Invoices', dataIndex: 'invoice_count', width: 100, align: 'right' },
                    { title: 'Spend', dataIndex: 'total_spend_usd', width: 130, align: 'right', render: fmt },
                  ]}
                  pagination={false}
                />
              </Card>
            ),
          },
        ]}
      />
    </PageWrap>
  );
};

export default MultiSiteSpendPage;
