/**
 * Contract leakage detection — surface invoice lines that paid more than
 * the best-available contract / GPO rate.
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, DollarOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { get } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const PageWrap = styled.div`padding: 24px;`;

interface Leak {
  invoiceItemId: string;
  invoiceId: string;
  invoiceNumber: string;
  hcpc: string;
  description: string | null;
  vendorName: string | null;
  quantity: number;
  invoiceUnitPriceUsd: number;
  bestAvailablePriceUsd: number;
  leakPerUnitUsd: number;
  leakTotalUsd: number;
  leakPct: number;
}

export const ContractLeakagePage: React.FC = () => {
  const [items, setItems] = useState<Leak[]>([]);
  const [totalLeakage, setTotalLeakage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await get<{ totalLeakageUsd: number; leakCount: number; items: Leak[] }>(
        '/reports/contract-leakage',
        {
          startDate: range[0].format('YYYY-MM-DD'),
          endDate: range[1].format('YYYY-MM-DD'),
        },
      );
      setItems(r.items ?? []);
      setTotalLeakage(r.totalLeakageUsd ?? 0);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  const fmt = (v: number) =>
    `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const columns: ColumnsType<Leak> = [
    { title: 'Invoice', dataIndex: 'invoiceNumber', width: 130 },
    { title: 'HCPC', dataIndex: 'hcpc', width: 90 },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Vendor', dataIndex: 'vendorName', width: 160, ellipsis: true },
    { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' },
    { title: 'Paid $', dataIndex: 'invoiceUnitPriceUsd', width: 100, align: 'right', render: fmt },
    { title: 'Best $', dataIndex: 'bestAvailablePriceUsd', width: 100, align: 'right', render: fmt },
    {
      title: 'Leak/unit',
      dataIndex: 'leakPerUnitUsd',
      width: 110,
      align: 'right',
      render: (v) => <Text type="danger">{fmt(v)}</Text>,
    },
    {
      title: 'Leak total',
      dataIndex: 'leakTotalUsd',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.leakTotalUsd - b.leakTotalUsd,
      defaultSortOrder: 'descend',
      render: (v) => <strong style={{ color: '#cf1322' }}>{fmt(v)}</strong>,
    },
    {
      title: '%',
      dataIndex: 'leakPct',
      width: 80,
      align: 'right',
      render: (v) => <Tag color="red">{v.toFixed(1)}%</Tag>,
    },
  ];

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Contract Leakage</Title>
          <Text type="secondary">Invoice lines paid above the best available contract / GPO rate. Tolerance ±2%.</Text>
        </Col>
        <Col>
          <Space>
            <RangePicker value={range} onChange={(v) => v && setRange(v as any)} />
            <Button icon={<ReloadOutlined />} onClick={() => void fetch()}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Total leakage in period"
              value={fmt(totalLeakage)}
              valueStyle={{ color: totalLeakage > 0 ? '#cf1322' : '#52c41a' }}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="Leaking lines" value={items.length} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Avg leak / line"
              value={items.length ? fmt(totalLeakage / items.length) : '$0.00'}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          <strong>How it works:</strong> for each invoice line within the date range, we look up the lowest
          available price across active contracts and active GPO contracts for the hospital. If the invoiced
          unit price exceeds that by more than 2%, we flag the line and compute the dollar leakage.
        </Paragraph>
        <Table<Leak>
          size="small"
          rowKey="invoiceItemId"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 25, showSizeChanger: true }}
        />
      </Card>
    </PageWrap>
  );
};

export default ContractLeakagePage;
