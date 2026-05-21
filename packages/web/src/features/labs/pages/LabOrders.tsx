import React, { useEffect, useState } from 'react';
import { Table, Card, Input, Select, Button, Tag, Typography, Space } from 'antd';
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

const LabOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await labsApi.listOrders({
        q: q || undefined,
        status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setOrders(res.data);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>Lab Orders</Title>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder="Search order #, patient, reference"
            allowClear
            onSearch={(v) => {
              setQ(v);
              setPage(1);
              refresh();
            }}
            style={{ width: 320 }}
          />
          <Select
            placeholder="Status filter"
            allowClear
            style={{ width: 200 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              'OPEN',
              'READY_FOR_APPROVAL',
              'APPROVED',
              'REJECTED',
              'SHIPPED',
              'DELIVERED',
              'COMPLETED',
              'CANCELLED',
            ].map((s) => ({ value: s, label: s }))}
          />
          <Button type="primary" onClick={() => navigate('/labs/orders/new')}>+ New Lab Order</Button>
          <Button onClick={() => window.open(labsApi.ordersXlsxUrl(), '_blank')}>Export XLSX</Button>
        </Space>
        <Table
          loading={loading}
          dataSource={orders}
          rowKey="id"
          onRow={(r) => ({ onClick: () => navigate(`/labs/orders/${r.id}`) })}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (t) => `Total ${t} orders`,
          }}
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
            { title: 'Carrier', dataIndex: 'carrier', key: 'carrier', render: (v) => v || '—' },
            { title: 'Tracking', dataIndex: 'trackingNumber', key: 'trackingNumber', render: (v) => v || '—' },
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

export default LabOrdersPage;
