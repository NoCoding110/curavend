import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Table,
  DatePicker,
  Spin,
  message,
  Statistic,
  Tabs,
  Tag,
  Progress,
} from 'antd';
import {
  BarChartOutlined,
  FilterOutlined,
  DollarOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  CalendarOutlined,
  FilePdfOutlined,
  SafetyOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { get } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PageWrapper = styled.div`
  padding: 24px;
`;

const ChartCard = styled(Card)`
  .chart-wrap {
    min-height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

const StatCardWrapper = styled(Card)`
  border-radius: 8px;
  .ant-statistic-title {
    font-size: 13px;
  }
  .ant-statistic-content-value {
    font-size: 24px;
    font-weight: 700;
  }
`;

// ---- Types ----

interface SpendByMonth {
  month: string;       // e.g. "2025-01"
  totalSpend: number;
  orders: number;
}

interface SpendByVendor {
  vendor: string;
  totalSpend: number;
  orders: number;
}

interface OrdersByStatus {
  status: string;
  count: number;
}

interface SpendByHcpc {
  hcpcCode: string;
  description: string;
  totalSpend: number;
  quantity: number;
}

// ---- Helpers ----

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

// ---- Component ----

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'),
    dayjs(),
  ]);

  // Data states
  const [spendByMonth, setSpendByMonth] = useState<SpendByMonth[]>([]);
  const [spendByVendor, setSpendByVendor] = useState<SpendByVendor[]>([]);
  const [ordersByStatus, setOrdersByStatus] = useState<OrdersByStatus[]>([]);
  const [spendByHcpc, setSpendByHcpc] = useState<SpendByHcpc[]>([]);

  // Loading states
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingVendor, setLoadingVendor] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingHcpc, setLoadingHcpc] = useState(false);

  // Vendor Scorecard state
  const [vendorScorecard, setVendorScorecard] = useState<any[]>([]);
  const [loadingScorecard, setLoadingScorecard] = useState(false);

  // Compliance state
  const [complianceUsers, setComplianceUsers] = useState<any[]>([]);
  const [complianceCredentials, setComplianceCredentials] = useState<any[]>([]);
  const [complianceAccess, setComplianceAccess] = useState<any[]>([]);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

  const [activeTab, setActiveTab] = useState('spend');

  const getParams = useCallback(() => {
    const params: Record<string, string> = {};
    if (dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
    if (dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
    return params;
  }, [dateRange]);

  const fetchAll = useCallback(async () => {
    const params = getParams();
    await Promise.allSettled([
      (async () => {
        setLoadingMonth(true);
        try {
          const data = await get<{ items: SpendByMonth[] }>('/reports/spend-by-month', params);
          setSpendByMonth(data.items || []);
        } catch {
          message.error('Failed to load monthly spend data.');
        } finally {
          setLoadingMonth(false);
        }
      })(),
      (async () => {
        setLoadingVendor(true);
        try {
          const data = await get<{ items: SpendByVendor[] }>('/reports/spend-by-vendor', params);
          setSpendByVendor(data.items || []);
        } catch {
          message.error('Failed to load vendor spend data.');
        } finally {
          setLoadingVendor(false);
        }
      })(),
      (async () => {
        setLoadingStatus(true);
        try {
          const data = await get<{ items: OrdersByStatus[] }>('/reports/orders-by-status', params);
          setOrdersByStatus(data.items || []);
        } catch {
          message.error('Failed to load order status data.');
        } finally {
          setLoadingStatus(false);
        }
      })(),
      (async () => {
        setLoadingHcpc(true);
        try {
          const data = await get<{ items: SpendByHcpc[] }>('/reports/spend-by-hcpc', params);
          setSpendByHcpc(data.items || []);
        } catch {
          message.error('Failed to load HCPC spend data.');
        } finally {
          setLoadingHcpc(false);
        }
      })(),
    ]);
  }, [getParams]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchScorecard = useCallback(async () => {
    setLoadingScorecard(true);
    try {
      const data = await get<{ items: any[] }>('/reports/vendor-scorecard');
      setVendorScorecard(data.items || []);
    } catch {
      message.error('Failed to load vendor scorecard');
    } finally {
      setLoadingScorecard(false);
    }
  }, []);

  const fetchCompliance = useCallback(async () => {
    setLoadingCompliance(true);
    try {
      const [users, creds, access] = await Promise.allSettled([
        get<{ items: any[] }>('/reports/compliance/users'),
        get<{ items: any[] }>('/reports/compliance/credentials'),
        get<{ items: any[] }>('/reports/compliance/network-access'),
      ]);
      if (users.status === 'fulfilled') setComplianceUsers(users.value.items || []);
      if (creds.status === 'fulfilled') setComplianceCredentials(creds.value.items || []);
      if (access.status === 'fulfilled') setComplianceAccess(access.value.items || []);
    } catch {
      message.error('Failed to load compliance data');
    } finally {
      setLoadingCompliance(false);
    }
  }, []);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'scorecard' && !vendorScorecard.length) fetchScorecard();
    if (key === 'compliance' && !complianceUsers.length) fetchCompliance();
  };

  // ---- Derived stats ----
  const totalSpend = spendByVendor.reduce((sum, v) => sum + v.totalSpend, 0);
  const totalOrders = spendByVendor.reduce((sum, v) => sum + v.orders, 0);
  const topVendor = [...spendByVendor].sort((a, b) => b.totalSpend - a.totalSpend)[0]?.vendor || '—';
  const thisMonthLabel = dayjs().format('MMM YYYY');
  const thisMonthSpend =
    spendByMonth.find((m) => m.month === dayjs().format('YYYY-MM'))?.totalSpend ?? 0;

  // ---- Chart configs ----

  const spendByMonthOptions: Highcharts.Options = {
    chart: { type: 'line', height: 280 },
    title: { text: undefined },
    xAxis: {
      categories: spendByMonth.map((m) => dayjs(m.month, 'YYYY-MM').format('MMM YYYY')),
      crosshair: true,
    },
    yAxis: {
      title: { text: 'Spend ($)' },
      labels: { formatter() { return `$${(this.value as number / 1000).toFixed(0)}k`; } },
    },
    tooltip: {
      formatter() {
        return `<b>${this.x}</b><br/>Spend: <b>${formatCurrency(this.y as number)}</b>`;
      },
    },
    series: [
      {
        type: 'line',
        name: 'Spend',
        data: spendByMonth.map((m) => m.totalSpend),
        color: '#1677ff',
        marker: { enabled: true },
      },
    ],
    credits: { enabled: false },
    legend: { enabled: false },
  };

  const spendByVendorOptions: Highcharts.Options = {
    chart: { type: 'bar', height: 280 },
    title: { text: undefined },
    xAxis: {
      categories: spendByVendor.map((v) => v.vendor),
      title: { text: null },
    },
    yAxis: {
      title: { text: 'Total Spend ($)' },
      labels: { formatter() { return `$${(this.value as number / 1000).toFixed(0)}k`; } },
    },
    tooltip: {
      formatter() {
        return `<b>${this.x}</b><br/>Spend: <b>${formatCurrency(this.y as number)}</b>`;
      },
    },
    series: [
      {
        type: 'bar',
        name: 'Spend',
        data: spendByVendor.map((v) => v.totalSpend),
        color: '#52c41a',
      },
    ],
    credits: { enabled: false },
    legend: { enabled: false },
  };

  const ordersByStatusOptions: Highcharts.Options = {
    chart: { type: 'pie', height: 280 },
    title: { text: undefined },
    tooltip: {
      pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> ({point.y} orders)',
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.percentage:.1f}%',
        },
      },
    },
    series: [
      {
        type: 'pie',
        name: 'Orders',
        data: ordersByStatus.map((s) => ({
          name: s.status,
          y: s.count,
        })),
      },
    ],
    credits: { enabled: false },
  };

  const spendByHcpcOptions: Highcharts.Options = {
    chart: { type: 'bar', height: 280 },
    title: { text: undefined },
    xAxis: {
      categories: spendByHcpc.slice(0, 10).map((h) => `${h.hcpcCode} – ${h.description}`),
      title: { text: null },
    },
    yAxis: {
      title: { text: 'Total Spend ($)' },
      labels: { formatter() { return `$${(this.value as number / 1000).toFixed(0)}k`; } },
    },
    tooltip: {
      formatter() {
        return `<b>${this.x}</b><br/>Spend: <b>${formatCurrency(this.y as number)}</b>`;
      },
    },
    series: [
      {
        type: 'bar',
        name: 'Spend',
        data: spendByHcpc.slice(0, 10).map((h) => h.totalSpend),
        color: '#fa8c16',
      },
    ],
    credits: { enabled: false },
    legend: { enabled: false },
  };

  // ---- Vendor table columns ----
  const baseVendorTableColumns: ColumnsType<SpendByVendor> = [
    { title: 'Vendor', dataIndex: 'vendor', key: 'vendor' },
    {
      title: 'Orders',
      dataIndex: 'orders',
      key: 'orders',
      align: 'center',
      width: 100,
    },
    {
      title: 'Total Spend',
      dataIndex: 'totalSpend',
      key: 'totalSpend',
      align: 'right',
      width: 140,
      render: (val: number) => formatCurrency(val),
      sorter: (a, b) => a.totalSpend - b.totalSpend,
      defaultSortOrder: 'descend',
    },
    {
      title: '% of Total',
      key: 'pct',
      align: 'right',
      width: 110,
      render: (_: any, record: SpendByVendor) =>
        totalSpend > 0 ? `${((record.totalSpend / totalSpend) * 100).toFixed(1)}%` : '—',
    },
  ];

  const { columns: vendorTableColumns, components: vendorTableComponents } = useResizableColumns(baseVendorTableColumns as any[]);

  const anyLoading = loadingMonth || loadingVendor || loadingStatus || loadingHcpc;
  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const rangeLabel = `${dateRange[0]?.format('MM/DD/YYYY') ?? '—'} – ${dateRange[1]?.format('MM/DD/YYYY') ?? '—'}`;

      doc.setFontSize(18);
      doc.text('Reports & Analytics', 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Date range: ${rangeLabel}`, 14, 27);
      doc.setTextColor(0);

      // Stats
      doc.setFontSize(12);
      doc.text('Summary', 14, 38);
      doc.setFontSize(10);
      doc.text(`Total Spend: ${formatCurrency(totalSpend)}`, 14, 46);
      doc.text(`Total Orders: ${totalOrders}`, 14, 52);
      doc.text(`Top Vendor: ${topVendor}`, 14, 58);
      doc.text(`This Month (${thisMonthLabel}): ${formatCurrency(thisMonthSpend)}`, 14, 64);

      // Vendor spend table
      let y = 76;
      doc.setFontSize(12);
      doc.text('Spend by Vendor', 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFillColor(240, 240, 240);
      doc.rect(14, y - 4, 182, 6, 'F');
      doc.text('Vendor', 16, y);
      doc.text('Orders', 110, y);
      doc.text('Total Spend', 140, y);
      doc.text('% of Total', 170, y);
      y += 6;
      for (const v of spendByVendor) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(v.vendor.slice(0, 50), 16, y);
        doc.text(String(v.orders), 110, y);
        doc.text(formatCurrency(v.totalSpend), 140, y);
        doc.text(totalSpend > 0 ? `${((v.totalSpend / totalSpend) * 100).toFixed(1)}%` : '—', 170, y);
        y += 6;
      }

      // Orders by status
      if (ordersByStatus.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }
        y += 6;
        doc.setFontSize(12);
        doc.text('Orders by Status', 14, y);
        y += 6;
        doc.setFontSize(9);
        for (const s of ordersByStatus) {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(`${s.status}: ${s.count}`, 16, y);
          y += 6;
        }
      }

      // Top HCPC codes
      if (spendByHcpc.length > 0) {
        if (y > 220) { doc.addPage(); y = 20; }
        y += 6;
        doc.setFontSize(12);
        doc.text('Top HCPC Codes by Spend', 14, y);
        y += 6;
        doc.setFontSize(9);
        for (const h of spendByHcpc.slice(0, 10)) {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(`${h.hcpcCode} – ${h.description.slice(0, 40)}: ${formatCurrency(h.totalSpend)}`, 16, y);
          y += 6;
        }
      }

      doc.save(`curavend-report-${dayjs().format('YYYY-MM-DD')}.pdf`);
    } catch {
      message.error('PDF generation failed');
    } finally {
      setPdfLoading(false);
    }
  };

  // ---- Scorecard + Compliance column defs ----
  const scorecardColumns = [
    { title: 'Vendor', dataIndex: 'vendor_name', key: 'vendor_name' },
    { title: 'Total Orders', dataIndex: 'total_orders', key: 'total_orders', align: 'center' as const },
    { title: 'Completed', dataIndex: 'completed', key: 'completed', align: 'center' as const,
      render: (v: number, r: any) => {
        const pct = r.total_orders > 0 ? Math.round((v / r.total_orders) * 100) : 0;
        return <><Tag color="green">{v}</Tag><Progress percent={pct} size="small" style={{ width: 80 }} /></>;
      },
    },
    { title: 'Cancelled', dataIndex: 'cancelled', key: 'cancelled', align: 'center' as const,
      render: (v: number) => <Tag color={v > 0 ? 'red' : 'default'}>{v}</Tag>,
    },
    { title: 'Modified', dataIndex: 'modified', key: 'modified', align: 'center' as const,
      render: (v: number) => <Tag color={v > 0 ? 'orange' : 'default'}>{v}</Tag>,
    },
    { title: 'Fill Rate', key: 'fill_rate', align: 'center' as const,
      render: (_: any, r: any) => {
        const pct = r.total_orders > 0 ? Math.round(((r.completed ?? 0) / r.total_orders) * 100) : 0;
        return <Tag color={pct >= 90 ? 'green' : pct >= 70 ? 'orange' : 'red'}>{pct}%</Tag>;
      },
    },
  ];

  const userComplianceColumns = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (v: any) => <Tag>{v}</Tag> },
    { title: 'Type', dataIndex: 'user_type', key: 'user_type' },
    { title: 'Status', dataIndex: 'approval_status', key: 'approval_status',
      render: (v: any) => <Tag color={v === 'APPROVED' ? 'green' : v === 'REJECTED' ? 'red' : 'gold'}>{v}</Tag>,
    },
    { title: 'MFA', dataIndex: 'mfa_enabled', key: 'mfa_enabled',
      render: (v: any) => <Tag color={v ? 'green' : 'red'}>{v ? 'Enabled' : 'Disabled'}</Tag>,
    },
    { title: 'PHI Consent', dataIndex: 'has_agreed_to_phi_access', key: 'phi',
      render: (v: any) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Agreed' : 'Pending'}</Tag>,
    },
    { title: 'Last Login', dataIndex: 'last_logged_in_at', key: 'last_logged_in_at',
      render: (v: any) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—',
    },
  ];

  const credentialsColumns = [
    { title: 'Vendor', dataIndex: 'name', key: 'name' },
    { title: 'Accreditation Expiry', dataIndex: 'accreditation_expiry_date', key: 'acc',
      render: (v: any) => {
        if (!v) return '—';
        const expired = dayjs(v).isBefore(dayjs());
        return <Tag color={expired ? 'red' : 'green'}>{v}</Tag>;
      },
    },
    { title: 'License Expiry', dataIndex: 'state_level_license_expiry_date', key: 'lic',
      render: (v: any) => {
        if (!v) return '—';
        const expired = dayjs(v).isBefore(dayjs());
        return <Tag color={expired ? 'red' : 'green'}>{v}</Tag>;
      },
    },
    { title: 'Insurance Expiry', dataIndex: 'liability_insurance_expiry_date', key: 'ins',
      render: (v: any) => {
        if (!v) return '—';
        const expired = dayjs(v).isBefore(dayjs());
        return <Tag color={expired ? 'red' : 'green'}>{v}</Tag>;
      },
    },
  ];

  const accessColumns = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Last Login', dataIndex: 'last_logged_in_at', key: 'last_logged_in_at',
      render: (v: any) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—',
    },
    { title: 'Current Login', dataIndex: 'current_logged_in_at', key: 'cur',
      render: (v: any) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—',
    },
  ];

  return (
    <PageWrapper>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center">
            <BarChartOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div>
              <Title level={3} style={{ margin: 0 }}>Reports &amp; Analytics</Title>
              <Text type="secondary">Supply chain spend and order insights</Text>
            </div>
          </Space>
        </Col>
        <Col>
          <Button icon={<FilePdfOutlined />} onClick={downloadPdf} loading={pdfLoading}>
            Download PDF
          </Button>
        </Col>
      </Row>

      <Tabs activeKey={activeTab} onChange={handleTabChange} style={{ marginBottom: 0 }}
        items={[{ key: 'spend', label: <><BarChartOutlined /> Spend Analytics</> },
                { key: 'scorecard', label: <><TrophyOutlined /> Vendor Scorecard</> },
                { key: 'compliance', label: <><SafetyOutlined /> Compliance</> }]}
      />

      {/* ── Spend Analytics Tab ──────────────────────────── */}
      {activeTab === 'spend' && <>

      {/* Date filter bar */}
      <Card style={{ marginBottom: 24 }}>
        <Row align="middle" gutter={12}>
          <Col>
            <Space>
              <FilterOutlined />
              <Text strong>Date Range:</Text>
            </Space>
          </Col>
          <Col>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                if (dates) setDateRange([dates[0], dates[1]]);
              }}
              format="MM/DD/YYYY"
              allowClear={false}
            />
          </Col>
          <Col>
            <Button type="primary" icon={<FilterOutlined />} onClick={fetchAll} loading={anyLoading}>
              Apply Filter
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Stat cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <StatCardWrapper>
            <Statistic
              title="Total Spend"
              value={totalSpend}
              precision={0}
              prefix={<DollarOutlined />}
              formatter={(val) => formatCurrency(Number(val))}
              loading={loadingVendor}
            />
          </StatCardWrapper>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCardWrapper>
            <Statistic
              title="Total Orders"
              value={totalOrders}
              prefix={<ShoppingCartOutlined />}
              loading={loadingVendor}
            />
          </StatCardWrapper>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCardWrapper>
            <Statistic
              title="Top Vendor by Spend"
              value={topVendor}
              prefix={<TeamOutlined />}
              loading={loadingVendor}
            />
          </StatCardWrapper>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCardWrapper>
            <Statistic
              title={`This Month (${thisMonthLabel})`}
              value={thisMonthSpend}
              precision={0}
              prefix={<CalendarOutlined />}
              formatter={(val) => formatCurrency(Number(val))}
              loading={loadingMonth}
            />
          </StatCardWrapper>
        </Col>
      </Row>

      {/* Charts row 1: spend by month + spend by vendor */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <ChartCard title="Spend by Month" style={{ height: '100%' }}>
            <Spin spinning={loadingMonth}>
              <div className="chart-wrap">
                {spendByMonth.length > 0 ? (
                  <HighchartsReact highcharts={Highcharts} options={spendByMonthOptions} />
                ) : (
                  <Text type="secondary">No data available for selected period.</Text>
                )}
              </div>
            </Spin>
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="Spend by Vendor" style={{ height: '100%' }}>
            <Spin spinning={loadingVendor}>
              <div className="chart-wrap">
                {spendByVendor.length > 0 ? (
                  <HighchartsReact highcharts={Highcharts} options={spendByVendorOptions} />
                ) : (
                  <Text type="secondary">No data available for selected period.</Text>
                )}
              </div>
            </Spin>
          </ChartCard>
        </Col>
      </Row>

      {/* Charts row 2: orders by status + top HCPC codes */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <ChartCard title="Orders by Status">
            <Spin spinning={loadingStatus}>
              <div className="chart-wrap">
                {ordersByStatus.length > 0 ? (
                  <HighchartsReact highcharts={Highcharts} options={ordersByStatusOptions} />
                ) : (
                  <Text type="secondary">No data available for selected period.</Text>
                )}
              </div>
            </Spin>
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="Top HCPC Codes by Spend">
            <Spin spinning={loadingHcpc}>
              <div className="chart-wrap">
                {spendByHcpc.length > 0 ? (
                  <HighchartsReact highcharts={Highcharts} options={spendByHcpcOptions} />
                ) : (
                  <Text type="secondary">No data available for selected period.</Text>
                )}
              </div>
            </Spin>
          </ChartCard>
        </Col>
      </Row>

      {/* Summary table */}
      <Card title="Spend by Vendor — Detail">
        <Spin spinning={loadingVendor}>
          <Table
            columns={vendorTableColumns}
            components={vendorTableComponents}
            dataSource={spendByVendor.map((v, i) => ({ ...v, key: i }))}
            pagination={false}
            size="middle"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Text strong>Total</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">
                  <Text strong>{totalOrders}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <Text strong>{formatCurrency(totalSpend)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <Text strong>100%</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
            locale={{ emptyText: 'No spend data available.' }}
          />
        </Spin>
      </Card>

      </>}

      {/* ── Vendor Scorecard Tab ────────────────────────── */}
      {activeTab === 'scorecard' && (
        <Card
          title={<Space><TrophyOutlined />Vendor Performance Scorecard</Space>}
          extra={<Button onClick={fetchScorecard} loading={loadingScorecard}>Refresh</Button>}
          style={{ marginTop: 16 }}
        >
          <Spin spinning={loadingScorecard}>
            <Table
              rowKey="vendor_id"
              columns={scorecardColumns}
              dataSource={vendorScorecard}
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: 'No vendor data available.' }}
            />
          </Spin>
        </Card>
      )}

      {/* ── Compliance Tab ──────────────────────────────── */}
      {activeTab === 'compliance' && (
        <Spin spinning={loadingCompliance}>
          <Card title="User Compliance" style={{ marginTop: 16, marginBottom: 16 }}>
            <Table
              rowKey="id"
              columns={userComplianceColumns}
              dataSource={complianceUsers}
              scroll={{ x: 900 }}
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: 'No data.' }}
            />
          </Card>

          <Card title="Vendor Credentials & Expiry" style={{ marginBottom: 16 }}>
            <Table
              rowKey="id"
              columns={credentialsColumns}
              dataSource={complianceCredentials}
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: 'No data.' }}
            />
          </Card>

          <Card title="Network Access Log (Last 100 Logins)">
            <Table
              rowKey="email"
              columns={accessColumns}
              dataSource={complianceAccess}
              pagination={{ pageSize: 20 }}
              locale={{ emptyText: 'No data.' }}
            />
          </Card>
        </Spin>
      )}

    </PageWrapper>
  );
};

export default Reports;
