/**
 * Forecast page — demand forecasting on the trailing 12 months.
 *
 * Surfaces items the user should consider reordering this week, along with
 * trend %, average monthly demand, and days since last ordered.
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Alert,
  Input,
} from 'antd';
import { ReloadOutlined, RiseOutlined, FallOutlined, SearchOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import { get } from '../../../api/client';

const { Title, Paragraph, Text } = Typography;

const PageWrap = styled.div`padding: 24px;`;

interface ForecastItem {
  hcpcCode: string;
  hcpcDescription: string | null;
  hospitalId: string;
  total12mo: number;
  total3mo: number;
  avgMonthly12: number;
  avgMonthly3: number;
  trendPct: number;
  activeMonths3mo: number;
  lastOrderedAt: string | null;
  lastOrderedDays: number | null;
  projectedNext30Days: number;
  suggested: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | null;
}

interface Summary {
  totalItems: number;
  suggested: number;
  critical: number;
  high: number;
  asOf: string;
}

const PriorityTag: React.FC<{ p: ForecastItem['priority'] }> = ({ p }) => {
  if (!p) return <Text type="secondary">—</Text>;
  const color = p === 'CRITICAL' ? 'red' : p === 'HIGH' ? 'orange' : 'blue';
  return <Tag color={color}>{p}</Tag>;
};

export const Forecast: React.FC = () => {
  const [items, setItems] = useState<ForecastItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showOnlySuggested, setShowOnlySuggested] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const resp = await get<{ items: ForecastItem[]; summary: Summary }>('/forecasting/demand');
      setItems(resp.items);
      setSummary(resp.summary);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetch();
  }, []);

  const filtered = items.filter((i) => {
    if (showOnlySuggested && !i.suggested) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!i.hcpcCode.toLowerCase().includes(s) && !(i.hcpcDescription ?? '').toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  const columns: ColumnsType<ForecastItem> = [
    {
      title: 'HCPC',
      dataIndex: 'hcpcCode',
      key: 'hcpcCode',
      width: 110,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Description',
      dataIndex: 'hcpcDescription',
      key: 'hcpcDescription',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: '12-mo Total',
      dataIndex: 'total12mo',
      key: 'total12mo',
      width: 110,
      align: 'right',
    },
    {
      title: 'Avg / mo',
      dataIndex: 'avgMonthly3',
      key: 'avgMonthly3',
      width: 100,
      align: 'right',
      render: (v: number) => <Text strong>{v.toFixed(1)}</Text>,
    },
    {
      title: 'Trend',
      dataIndex: 'trendPct',
      key: 'trendPct',
      width: 110,
      align: 'right',
      render: (v: number) => {
        if (Math.abs(v) < 0.5) return <Text type="secondary">flat</Text>;
        const up = v > 0;
        return (
          <Tag color={up ? 'green' : 'volcano'} icon={up ? <RiseOutlined /> : <FallOutlined />}>
            {up ? '+' : ''}
            {v.toFixed(0)}%
          </Tag>
        );
      },
    },
    {
      title: 'Last Ordered',
      dataIndex: 'lastOrderedDays',
      key: 'lastOrderedDays',
      width: 130,
      align: 'right',
      render: (v: number | null) => {
        if (v == null) return <Text type="secondary">—</Text>;
        if (v === 0) return <Tag color="green">today</Tag>;
        if (v < 7) return <Tag color="green">{v}d ago</Tag>;
        if (v < 30) return <Tag color="blue">{v}d ago</Tag>;
        if (v < 60) return <Tag color="orange">{v}d ago</Tag>;
        return <Tag color="red">{v}d ago</Tag>;
      },
    },
    {
      title: 'Next 30 days',
      dataIndex: 'projectedNext30Days',
      key: 'projectedNext30Days',
      width: 120,
      align: 'right',
      render: (v: number) => <Text strong>{v.toFixed(1)}</Text>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 110,
      render: (p: ForecastItem['priority']) => <PriorityTag p={p} />,
    },
  ];

  return (
    <PageWrap>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Demand Forecast
          </Title>
          <Text type="secondary">
            Trailing 12-month order history with reorder suggestions. Re-fetched on demand.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>
          Refresh
        </Button>
      </Space>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="How the suggestion works"
        description="An item is flagged for reorder when it appeared in 2 of the last 3 months AND the last order is more than 21 days old AND its 3-month average is at least 1 unit/month. Priority shifts to HIGH past 35 days and CRITICAL past 60 days for high-volume items."
      />

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Tracked items (12-mo)" value={summary.totalItems} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Reorder suggestions" value={summary.suggested} valueStyle={{ color: '#1BAEE5' }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="High priority" value={summary.high} valueStyle={{ color: '#fa8c16' }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Critical" value={summary.critical} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        <Space style={{ marginBottom: 12 }}>
          <Input
            placeholder="Search HCPC code or description"
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 320 }}
          />
          <Button
            type={showOnlySuggested ? 'primary' : 'default'}
            onClick={() => setShowOnlySuggested((v) => !v)}
          >
            {showOnlySuggested ? 'Showing suggested only' : 'Showing all items'}
          </Button>
        </Space>
        {filtered.length === 0 && !loading ? (
          <Empty description={showOnlySuggested ? 'No reorder suggestions right now — everything looks fresh.' : 'No items in the last 12 months.'} />
        ) : (
          <Table<ForecastItem>
            rowKey={(r) => `${r.hospitalId}-${r.hcpcCode}`}
            dataSource={filtered}
            columns={columns}
            loading={loading}
            pagination={{ pageSize: 20 }}
            size="middle"
          />
        )}
      </Card>
    </PageWrap>
  );
};

export default Forecast;
