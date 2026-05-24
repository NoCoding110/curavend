import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Skeleton,
  message,
  Badge,
} from 'antd';
import {
  ShoppingCartOutlined,
  DollarOutlined,
  ShopOutlined,
  BankOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import type { RootState } from '../../../store/store';
import { reportsApi } from '../../../api/reports';
import { ordersApi } from '../../../api/orders';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;

const BRAND_COLOR = '#1BAEE5';

const PageWrapper = styled.div`
  padding: 24px;
`;

const StatCard = styled(Card)`
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  height: 100%;

  .ant-statistic-title {
    font-size: 13px;
    font-weight: 500;
    color: #8c8c8c;
    margin-bottom: 8px;
  }

  .ant-statistic-content {
    font-size: 28px;
  }
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-top: 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
`;

const WelcomeBanner = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const StatusBadgeMap: Record<string, { color: string; label: string }> = {
  NEW_ORDER: { color: 'gold', label: 'New Order' },
  VENDOR_ASSIGNED: { color: 'blue', label: 'Vendor Assigned' },
  VENDOR_CONFIRMED: { color: 'geekblue', label: 'Vendor Confirmed' },
  VENDOR_DECLINED: { color: 'red', label: 'Vendor Declined' },
  DISPENSED: { color: 'purple', label: 'Dispensed' },
  DELIVERED: { color: 'lime', label: 'Delivered' },
  SPEND_CONFIRMED: { color: 'cyan', label: 'Spend Confirmed' },
  COMPLETED: { color: 'green', label: 'Completed' },
  ORDER_COMPLETED: { color: 'green', label: 'Completed' },
  CANCELLED: { color: 'red', label: 'Cancelled' },
  FACILITY_CANCELLED: { color: 'red', label: 'Cancelled' },
  // Legacy / fallback mappings
  Pending: { color: 'gold', label: 'Pending' },
  'In Process': { color: 'blue', label: 'In Process' },
  Completed: { color: 'green', label: 'Completed' },
  Cancelled: { color: 'red', label: 'Cancelled' },
};

interface RecentOrder {
  key: string;
  id: string;
  identifier?: string;
  patientName?: string;
  patient?: { firstName?: string; lastName?: string; name?: string };
  orderSubStatus?: string;
  status?: string;
  vendor?: { name?: string } | string;
  vendorName?: string;
  hospital?: { name?: string } | string;
  hospitalName?: string;
  priority?: string;
  createdAt?: string;
  date?: string;
}

interface SummaryStats {
  totalOrders?: number;
  totalSpend?: number;
  activeVendors?: number;
  activeHospitals?: number;
  ordersThisMonth?: number;
  spendThisMonth?: number;
}

const getPatientName = (order: RecentOrder): string => {
  if (order.patient) {
    if (order.patient.name) return order.patient.name;
    const first = order.patient.firstName || '';
    const last = order.patient.lastName || '';
    if (first || last) return `${first} ${last}`.trim();
  }
  return order.patientName || '—';
};

const getVendorName = (order: RecentOrder): string => {
  if (order.vendorName) return order.vendorName;
  if (!order.vendor) return '—';
  if (typeof order.vendor === 'string') return order.vendor;
  return order.vendor.name || '—';
};

const getHospitalName = (order: RecentOrder): string => {
  if (order.hospitalName) return order.hospitalName;
  if (!order.hospital) return '—';
  if (typeof order.hospital === 'string') return order.hospital;
  return order.hospital.name || '—';
};

const getOrderStatus = (order: RecentOrder): string =>
  order.orderSubStatus || order.status || '—';

const getOrderDate = (order: RecentOrder): string => {
  const raw = order.createdAt || order.date;
  if (!raw) return '—';
  return new Date(raw).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const userData = useSelector((state: RootState) => state.auth.userData);
  const userType = userData?.userType ?? '';

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryStats>({});
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  // Procurement KPIs (Session 11 integration)
  const [procurementKpis, setProcurementKpis] = useState<{
    reqsAwaitingMe: number;
    matchExceptions7d: number;
    contractLeakageYtd: number;
  }>({ reqsAwaitingMe: 0, matchExceptions7d: 0, contractLeakageYtd: 0 });
  const [procurementLoading, setProcurementLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { get } = await import('../../../api/client');
        const dayjsMod = await import('dayjs');
        const dayjs = dayjsMod.default;
        const sevenDaysAgo = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
        const ytdStart = dayjs().startOf('year').format('YYYY-MM-DD');
        const todayEnd = dayjs().format('YYYY-MM-DD');
        const myId = userData?.id;
        const [reqs, exc, leak] = await Promise.allSettled([
          myId
            ? get<{ items: any[] }>('/requisitions', { approverId: myId, status: 'SUBMITTED' })
            : Promise.resolve({ items: [] as any[] }),
          get<{ items: any[] }>('/three-way-match/exceptions'),
          get<{ totalLeakageUsd: number }>(
            '/reports/contract-leakage',
            { startDate: ytdStart, endDate: todayEnd } as any,
          ).catch(() => ({ totalLeakageUsd: 0 })),
        ]);
        if (cancelled) return;
        setProcurementKpis({
          reqsAwaitingMe: reqs.status === 'fulfilled' ? reqs.value.items?.length ?? 0 : 0,
          matchExceptions7d:
            exc.status === 'fulfilled'
              ? exc.value.items?.filter((m: any) => m.computedAt && m.computedAt >= sevenDaysAgo).length ?? 0
              : 0,
          contractLeakageYtd: leak.status === 'fulfilled' ? leak.value.totalLeakageUsd ?? 0 : 0,
        });
      } catch { /* noop */ }
      finally { if (!cancelled) setProcurementLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userData?.id]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await reportsApi.executiveSummary();
      setSummary(data?.data ?? data ?? {});
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load dashboard summary.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchRecentOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const data = await ordersApi.list({ limit: 5, page: 1 });
      const orders: RecentOrder[] = (data?.items ?? data?.data ?? data?.orders ?? []).map(
        (o: any, idx: number) => ({ ...o, key: o.id ?? o._id ?? String(idx) }),
      );
      setRecentOrders(orders);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load recent orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchRecentOrders();
  }, [fetchSummary, fetchRecentOrders]);

  const baseColumns: ColumnsType<RecentOrder> = [
    {
      title: 'Order ID',
      key: 'identifier',
      render: (_: unknown, record: RecentOrder) => {
        const label = record.identifier || record.id || '—';
        const id = record.id || record.identifier || '';
        return (
          <a
            style={{ color: BRAND_COLOR, fontWeight: 500 }}
            onClick={() => navigate(`/provider-orders/${id}`)}
          >
            {label}
          </a>
        );
      },
    },
    {
      title: 'Patient Name',
      key: 'patientName',
      render: (_: unknown, record: RecentOrder) => getPatientName(record),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, record: RecentOrder) => {
        const status = getOrderStatus(record);
        const cfg = StatusBadgeMap[status];
        return cfg ? (
          <Badge color={cfg.color} text={cfg.label} />
        ) : (
          <Tag>{status}</Tag>
        );
      },
    },
    {
      title: 'Vendor',
      key: 'vendor',
      render: (_: unknown, record: RecentOrder) => getVendorName(record),
    },
    {
      title: 'Hospital',
      key: 'hospital',
      render: (_: unknown, record: RecentOrder) => getHospitalName(record),
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: string) => {
        if (!priority) return <Text type="secondary">—</Text>;
        const colorMap: Record<string, string> = { HIGH: 'red', URGENT: 'volcano', STANDARD: 'default', LOW: 'default' };
        return <Tag color={colorMap[priority?.toUpperCase()] || 'default'}>{priority}</Tag>;
      },
    },
    {
      title: 'Date Created',
      key: 'createdAt',
      render: (_: unknown, record: RecentOrder) => (
        <Text type="secondary">{getOrderDate(record)}</Text>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 72,
      render: (_: unknown, record: RecentOrder) => {
        const id = record.id || record.identifier || '';
        return (
          <Button
            type="link"
            size="small"
            icon={<ArrowRightOutlined />}
            onClick={() => navigate(`/provider-orders/${id}`)}
          />
        );
      },
    },
  ];
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  const statItems = [
    {
      title: 'Total Orders',
      value: summary.totalOrders ?? 0,
      icon: <ShoppingCartOutlined style={{ color: BRAND_COLOR }} />,
      color: BRAND_COLOR,
      loading: summaryLoading,
    },
    {
      title: 'Total Spend',
      value: summary.totalSpend ?? 0,
      icon: <DollarOutlined style={{ color: '#52c41a' }} />,
      color: '#52c41a',
      isCurrency: true,
      loading: summaryLoading,
    },
    {
      title: userType === 'HOSPITAL' ? 'My Vendors' : 'Active Vendors',
      value: summary.activeVendors ?? 0,
      icon: <ShopOutlined style={{ color: '#faad14' }} />,
      color: '#faad14',
      loading: summaryLoading,
    },
    // Only show "Active Hospitals" for ADMIN; for HOSPITAL users show "Orders This Month"; for VENDOR show "My Hospitals"
    userType === 'HOSPITAL'
      ? {
          title: 'Orders This Month',
          value: summary.ordersThisMonth ?? 0,
          icon: <BankOutlined style={{ color: '#722ed1' }} />,
          color: '#722ed1',
          loading: summaryLoading,
        }
      : userType === 'VENDOR'
      ? {
          title: 'My Hospitals',
          value: summary.activeHospitals ?? 0,
          icon: <BankOutlined style={{ color: '#722ed1' }} />,
          color: '#722ed1',
          loading: summaryLoading,
        }
      : {
          title: 'Active Hospitals',
          value: summary.activeHospitals ?? 0,
          icon: <BankOutlined style={{ color: '#722ed1' }} />,
          color: '#722ed1',
          loading: summaryLoading,
        },
  ];

  return (
    <PageWrapper>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <WelcomeBanner>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Welcome back, {userData?.name || userData?.email || 'User'}
            </Title>
            <Text type="secondary">Here's what's happening with your supply chain today.</Text>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              style={{ background: BRAND_COLOR, borderColor: BRAND_COLOR }}
              onClick={() => navigate('/create-order')}
            >
              Create Order
            </Button>
            <Button
              icon={<UnorderedListOutlined />}
              onClick={() => navigate('/provider-orders')}
            >
              View All Orders
            </Button>
          </Space>
        </WelcomeBanner>

        {/* Stat Cards */}
        <Row gutter={[16, 16]}>
          {statItems.map((item) => (
            <Col xs={24} sm={12} lg={6} key={item.title}>
              <StatCard>
                {item.loading ? (
                  <Skeleton active paragraph={{ rows: 1 }} />
                ) : (
                  <Statistic
                    title={item.title}
                    value={item.isCurrency ? formatCurrency(item.value as number) : item.value}
                    prefix={item.isCurrency ? undefined : item.icon}
                    valueStyle={{ color: item.color, fontSize: 26 }}
                  />
                )}
              </StatCard>
            </Col>
          ))}
        </Row>

        {/* Procurement KPIs (Session 11) */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <StatCard onClick={() => navigate('/requisitions')} style={{ cursor: 'pointer' }}>
              {procurementLoading ? (
                <Skeleton active paragraph={{ rows: 1 }} />
              ) : (
                <Statistic
                  title="Requisitions awaiting my approval"
                  value={procurementKpis.reqsAwaitingMe}
                  valueStyle={{ color: procurementKpis.reqsAwaitingMe > 0 ? '#fa8c16' : '#52c41a', fontSize: 26 }}
                />
              )}
            </StatCard>
          </Col>
          <Col xs={24} sm={8}>
            <StatCard onClick={() => navigate('/match-exceptions')} style={{ cursor: 'pointer' }}>
              {procurementLoading ? (
                <Skeleton active paragraph={{ rows: 1 }} />
              ) : (
                <Statistic
                  title="Match exceptions (7d)"
                  value={procurementKpis.matchExceptions7d}
                  valueStyle={{ color: procurementKpis.matchExceptions7d > 0 ? '#cf1322' : '#52c41a', fontSize: 26 }}
                />
              )}
            </StatCard>
          </Col>
          <Col xs={24} sm={8}>
            <StatCard onClick={() => navigate('/reporting/contract-leakage')} style={{ cursor: 'pointer' }}>
              {procurementLoading ? (
                <Skeleton active paragraph={{ rows: 1 }} />
              ) : (
                <Statistic
                  title="Contract leakage YTD"
                  value={formatCurrency(procurementKpis.contractLeakageYtd)}
                  valueStyle={{ color: procurementKpis.contractLeakageYtd > 0 ? '#cf1322' : '#52c41a', fontSize: 26 }}
                />
              )}
            </StatCard>
          </Col>
        </Row>

        {/* Recent Orders */}
        <SectionCard
          title={
            <Space>
              <ShoppingCartOutlined style={{ color: BRAND_COLOR }} />
              <span style={{ fontWeight: 600 }}>Recent Orders</span>
            </Space>
          }
          extra={
            <Button
              type="link"
              style={{ color: BRAND_COLOR, paddingRight: 0 }}
              onClick={() => navigate('/provider-orders')}
            >
              View All <ArrowRightOutlined />
            </Button>
          }
        >
          {ordersLoading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : (
            <Table
              columns={columns}
              components={tableComponents}
              dataSource={recentOrders}
              loading={false}
              pagination={false}
              size="middle"
              locale={{ emptyText: 'No recent orders found.' }}
              onRow={(record) => ({
                style: { cursor: 'pointer' },
                onClick: () => navigate(`/provider-orders/${record.id || record.identifier || ''}`),
              })}
            />
          )}
        </SectionCard>
      </Space>
    </PageWrapper>
  );
};

export default Dashboard;
