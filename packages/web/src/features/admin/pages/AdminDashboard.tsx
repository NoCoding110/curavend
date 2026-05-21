import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, Button, Space, Table, Tag, message } from 'antd';
import { UserOutlined, ShoppingCartOutlined, BankOutlined, ShopOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../../api/admin';
import styled from 'styled-components';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const AdminDashboard: React.FC = () => {
  const nav = useNavigate();

  const baseColumnsUsersByType = [
    { title: 'Type', dataIndex: 'user_type', render: (v: any) => <Tag color="blue">{v}</Tag> },
    { title: 'Count', dataIndex: 'count' },
  ];
  const baseColumnsOrdersByStatus = [
    { title: 'Status', dataIndex: 'status', render: (v: any) => <Tag>{v}</Tag> },
    { title: 'Count', dataIndex: 'count' },
  ];
  const { columns: columnsUsersByType, components: tableComponentsUsersByType } = useResizableColumns(baseColumnsUsersByType as any[]);
  const { columns: columnsOrdersByStatus, components: tableComponentsOrdersByStatus } = useResizableColumns(baseColumnsOrdersByStatus as any[]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await adminApi.stats();
        setStats(s);
      } catch (err: any) {
        message.error(err?.response?.data?.error || 'Failed to load admin stats');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageWrapper>
      <Title level={3}>Admin Dashboard</Title>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="Pending Approvals" value={stats?.pendingUsers ?? 0} prefix={<WarningOutlined />} valueStyle={{ color: '#faad14' }} />
            <Button type="link" onClick={() => nav('/admin/approvals')}>Review →</Button>
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}><Statistic title="Total Vendors" value={stats?.totalVendors ?? 0} prefix={<ShopOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}><Statistic title="Total Hospitals" value={stats?.totalHospitals ?? 0} prefix={<BankOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}><Statistic title="Total Providers" value={stats?.totalProviders ?? 0} prefix={<UserOutlined />} /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Users by Type" loading={loading}>
            <Table
              size="small"
              pagination={false}
              rowKey="user_type"
              dataSource={stats?.usersByType ?? []}
              columns={columnsUsersByType}
              components={tableComponentsUsersByType}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Orders by Status" loading={loading}>
            <Table
              size="small"
              pagination={false}
              rowKey="status"
              dataSource={stats?.ordersByStatus ?? []}
              columns={columnsOrdersByStatus}
              components={tableComponentsOrdersByStatus}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 24 }} title="Quick Actions">
        <Space>
          <Button icon={<UserOutlined />} onClick={() => nav('/admin/approvals')}>Approval Queue</Button>
          <Button icon={<ShoppingCartOutlined />} onClick={() => nav('/provider-orders')}>All Orders</Button>
          <Button icon={<BankOutlined />} onClick={() => nav('/setting')}>Users</Button>
          <Button onClick={() => nav('/subscription')}>Subscription Plans</Button>
        </Space>
      </Card>
    </PageWrapper>
  );
};

export default AdminDashboard;
