import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, Button, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { labsApi, type LabOrder } from '../../../api/labs';

const { Title } = Typography;

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'default',
  READY_FOR_APPROVAL: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  SHIPPED: 'blue',
  DELIVERED: 'cyan',
  COMPLETED: 'success',
  CANCELLED: 'default',
};

const LabDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [recentOrders, setRecentOrders] = useState<LabOrder[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [c, o] = await Promise.all([
          labsApi.dashboardCounts(),
          labsApi.listOrders({ limit: 10 }),
        ]);
        if (!mounted) return;
        setCounts(c.counts);
        setTotal(c.total);
        setRecentOrders(o.data);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Lab Dashboard</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Total Orders" value={total} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card><Statistic title="Open" value={counts.OPEN ?? 0} /></Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Awaiting Approval" value={counts.READY_FOR_APPROVAL ?? 0} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="Completed" value={counts.COMPLETED ?? 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Recent Orders"
        style={{ marginTop: 24 }}
        extra={<Button type="primary" onClick={() => navigate('/labs/orders/new')}>+ New Lab Order</Button>}
      >
        <Table
          dataSource={recentOrders}
          rowKey="id"
          pagination={false}
          onRow={(r) => ({ onClick: () => navigate(`/labs/orders/${r.id}`) })}
          columns={[
            { title: 'Order #', dataIndex: 'orderNumber', key: 'orderNumber' },
            {
              title: 'Patient',
              key: 'patient',
              render: (_, r) => `${r.patientName ?? ''} ${r.patientLastName ?? ''}`.trim() || '—',
            },
            {
              title: 'Status',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => <Tag color={STATUS_COLORS[s] ?? 'default'}>{s}</Tag>,
            },
            {
              title: 'Tracking',
              dataIndex: 'trackingNumber',
              key: 'trackingNumber',
              render: (t: string | null) => t || '—',
            },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (s: string) => new Date(s).toLocaleDateString(),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default LabDashboard;
