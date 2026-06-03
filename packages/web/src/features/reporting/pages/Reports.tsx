/**
 * Reports — URL-driven dispatcher.
 *
 * Reads `:reportId` from the URL and renders a focused view per report.
 * When `:reportId` is missing/unknown, renders the multi-chart overview
 * (Spend tab + Vendor Scorecard tab + Compliance tab — the original
 * dashboard).
 *
 * Why a dispatcher: 8 of the sidebar reporting entries (spend-by-physician,
 * spend-by-facility, spend-by-department, vendor-kpis, unbilled-transactions,
 * compliance-users, compliance-credentials, plus the 3 spend-by-* charts
 * that should focus on a single chart) used to land on this same page
 * showing the same dashboard, regardless of URL. Now each one renders a
 * scoped, focused view of just that report.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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
  Empty,
  Alert,
  Select,
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
  UserOutlined,
  BankOutlined,
  AppstoreOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { get } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { useAdminHospitalSelect } from '../../../hooks/useAdminHospitalSelect';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PageWrapper = styled.div`padding: 24px;`;
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
  .ant-statistic-title { font-size: 13px; }
  .ant-statistic-content-value { font-size: 24px; font-weight: 700; }
`;

const formatCurrency = (val: number | string | null | undefined) => {
  const n = Number(val ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(isFinite(n) ? n : 0);
};

// ─── Shared date filter bar ────────────────────────────────────────────────
const DateBar: React.FC<{
  dateRange: [Dayjs | null, Dayjs | null];
  setDateRange: (r: [Dayjs | null, Dayjs | null]) => void;
  onApply: () => void;
  loading?: boolean;
}> = ({ dateRange, setDateRange, onApply, loading }) => (
  <Card style={{ marginBottom: 16 }} size="small">
    <Row align="middle" gutter={12}>
      <Col><Space><FilterOutlined /><Text strong>Date Range:</Text></Space></Col>
      <Col>
        <RangePicker
          value={dateRange}
          onChange={(dates) => { if (dates) setDateRange([dates[0], dates[1]]); }}
          format="MM/DD/YYYY"
          allowClear={false}
        />
      </Col>
      <Col>
        <Button type="primary" icon={<FilterOutlined />} onClick={onApply} loading={loading}>
          Apply
        </Button>
      </Col>
    </Row>
  </Card>
);

// ─── Header (shared) ───────────────────────────────────────────────────────
const ReportHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  loading?: boolean;
}> = ({ icon, title, subtitle, onRefresh, loading }) => (
  <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
    <Col>
      <Space align="center">
        <span style={{ fontSize: 28, color: '#1677ff' }}>{icon}</span>
        <div>
          <Title level={3} style={{ margin: 0 }}>{title}</Title>
          {subtitle && <Text type="secondary">{subtitle}</Text>}
        </div>
      </Space>
    </Col>
    {onRefresh && (
      <Col>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>Refresh</Button>
      </Col>
    )}
  </Row>
);

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 1 — Spend by Vendor (focused single chart + table)
// ═══════════════════════════════════════════════════════════════════════════
const SpendByVendorView: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'),
    dayjs(),
  ]);
  const [rows, setRows] = useState<Array<{ vendorName: string; totalSpend: number; invoiceCount: number }>>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const data = await get<{ items: any[] }>('/reports/spend-by-vendor', params);
      setRows((data.items || []).map((v) => ({
        vendorName: v.vendor ?? v.vendorName ?? '—',
        totalSpend: Number(v.totalSpend ?? 0),
        invoiceCount: Number(v.invoiceCount ?? v.orders ?? 0),
      })));
    } catch {
      message.error('Failed to load vendor spend.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);
  useEffect(() => { void fetch(); }, [fetch]);

  const total = rows.reduce((s, r) => s + r.totalSpend, 0);
  const chartOpts: Highcharts.Options = {
    chart: { type: 'bar', height: Math.max(280, rows.length * 28 + 80) },
    title: { text: undefined },
    xAxis: { categories: rows.map((v) => v.vendorName) },
    yAxis: { title: { text: 'Total Spend ($)' } },
    tooltip: { formatter() { return `<b>${this.x}</b><br/>${formatCurrency(this.y as number)}`; } },
    series: [{ type: 'bar', name: 'Spend', data: rows.map((v) => v.totalSpend), color: '#52c41a' }],
    credits: { enabled: false },
    legend: { enabled: false },
  };

  return (
    <>
      <ReportHeader icon={<DollarOutlined />} title="Spend by Vendor"
        subtitle="Total invoiced spend per vendor in the selected period." onRefresh={fetch} loading={loading} />
      <DateBar dateRange={dateRange} setDateRange={setDateRange} onApply={fetch} loading={loading} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}><StatCardWrapper><Statistic title="Total Spend" value={total} formatter={(v) => formatCurrency(Number(v))} prefix={<DollarOutlined />} /></StatCardWrapper></Col>
        <Col xs={24} md={12}><StatCardWrapper><Statistic title="Vendors" value={rows.length} prefix={<TeamOutlined />} /></StatCardWrapper></Col>
      </Row>
      <ChartCard title="Spend Distribution">
        <Spin spinning={loading}>
          <div className="chart-wrap">
            {rows.length > 0
              ? <HighchartsReact highcharts={Highcharts} options={chartOpts} />
              : <Empty description="No invoices in the selected date range." />}
          </div>
        </Spin>
      </ChartCard>
      <Card title="Detail" style={{ marginTop: 16 }}>
        <Table size="middle" rowKey={(_, i) => String(i)} loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Vendor', dataIndex: 'vendorName' },
            { title: 'Invoices', dataIndex: 'invoiceCount', align: 'right', width: 110 },
            { title: 'Total Spend', dataIndex: 'totalSpend', align: 'right', width: 140, render: formatCurrency, sorter: (a: any, b: any) => a.totalSpend - b.totalSpend, defaultSortOrder: 'descend' },
            { title: '% of Total', key: 'pct', align: 'right', width: 110,
              render: (_: any, r: any) => total > 0 ? `${((r.totalSpend / total) * 100).toFixed(1)}%` : '—' },
          ]}
          locale={{ emptyText: 'No spend data.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 2 — Top 10 HCPC
// ═══════════════════════════════════════════════════════════════════════════
const SpendByHcpcView: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'), dayjs(),
  ]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const data = await get<{ items: any[] }>('/reports/spend-by-hcpc', params);
      setRows(data.items || []);
    } catch { message.error('Failed to load HCPC spend.'); }
    finally { setLoading(false); }
  }, [dateRange]);
  useEffect(() => { void fetch(); }, [fetch]);

  const chartOpts: Highcharts.Options = {
    chart: { type: 'bar', height: Math.max(280, rows.length * 28 + 80) },
    title: { text: undefined },
    xAxis: { categories: rows.slice(0, 10).map((h) => `${h.code} – ${h.description ?? ''}`) },
    yAxis: { title: { text: 'Total Spend ($)' } },
    tooltip: { formatter() { return `<b>${this.x}</b><br/>${formatCurrency(this.y as number)}`; } },
    series: [{ type: 'bar', name: 'Spend', data: rows.slice(0, 10).map((h) => Number(h.totalSpend ?? 0)), color: '#fa8c16' }],
    credits: { enabled: false },
    legend: { enabled: false },
  };

  return (
    <>
      <ReportHeader icon={<AppstoreOutlined />} title="Top HCPC Codes by Spend"
        subtitle="Top 10 highest-spend HCPCS codes in the selected period." onRefresh={fetch} loading={loading} />
      <DateBar dateRange={dateRange} setDateRange={setDateRange} onApply={fetch} loading={loading} />
      <ChartCard title="Top 10 by spend">
        <Spin spinning={loading}>
          <div className="chart-wrap">
            {rows.length > 0
              ? <HighchartsReact highcharts={Highcharts} options={chartOpts} />
              : <Empty description="No invoice items in the selected date range." />}
          </div>
        </Spin>
      </ChartCard>
      <Card title="Detail" style={{ marginTop: 16 }}>
        <Table size="middle" rowKey={(_, i) => String(i)} loading={loading} dataSource={rows} pagination={false}
          columns={[
            { title: 'HCPC', dataIndex: 'code', width: 110 },
            { title: 'Usage Count', dataIndex: 'usageCount', align: 'right', width: 120 },
            { title: 'Total Spend', dataIndex: 'totalSpend', align: 'right', width: 140, render: formatCurrency },
          ]}
          locale={{ emptyText: 'No HCPC spend data.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 3 — Spend by Month
// ═══════════════════════════════════════════════════════════════════════════
const SpendByMonthView: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<{ items: any[] }>('/reports/spend-by-month');
      setRows(data.items || []);
    } catch { message.error('Failed to load monthly spend.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetch(); }, [fetch]);

  const chartOpts: Highcharts.Options = {
    chart: { type: 'line', height: 320 },
    title: { text: undefined },
    xAxis: { categories: rows.map((m) => dayjs(m.month, 'YYYY-MM').format('MMM YYYY')) },
    yAxis: { title: { text: 'Spend ($)' } },
    tooltip: { formatter() { return `<b>${this.x}</b><br/>${formatCurrency(this.y as number)}`; } },
    series: [{ type: 'line', name: 'Spend', data: rows.map((m) => Number(m.totalSpend ?? 0)), color: '#1677ff' }],
    credits: { enabled: false }, legend: { enabled: false },
  };

  const total = rows.reduce((s, r) => s + Number(r.totalSpend ?? 0), 0);
  const months = rows.length;
  const avg = months > 0 ? total / months : 0;

  return (
    <>
      <ReportHeader icon={<CalendarOutlined />} title="Spend by Month"
        subtitle="Trailing 12 months of invoiced spend." onRefresh={fetch} loading={loading} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}><StatCardWrapper><Statistic title="12-mo total" value={total} formatter={(v) => formatCurrency(Number(v))} /></StatCardWrapper></Col>
        <Col xs={24} md={8}><StatCardWrapper><Statistic title="Months with data" value={months} /></StatCardWrapper></Col>
        <Col xs={24} md={8}><StatCardWrapper><Statistic title="Avg per month" value={avg} formatter={(v) => formatCurrency(Number(v))} /></StatCardWrapper></Col>
      </Row>
      <ChartCard title="Trend">
        <Spin spinning={loading}>
          <div className="chart-wrap">
            {rows.length > 0
              ? <HighchartsReact highcharts={Highcharts} options={chartOpts} />
              : <Empty description="No invoices in the last 12 months." />}
          </div>
        </Spin>
      </ChartCard>
      <Card title="Detail" style={{ marginTop: 16 }}>
        <Table size="middle" rowKey="month" loading={loading} dataSource={rows} pagination={false}
          columns={[
            { title: 'Month', dataIndex: 'month' },
            { title: 'Invoices', dataIndex: 'invoiceCount', align: 'right', width: 110 },
            { title: 'Spend', dataIndex: 'totalSpend', align: 'right', width: 140, render: formatCurrency },
          ]}
          locale={{ emptyText: 'No monthly data.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 4 — Spend by Physician (NEW)
// ═══════════════════════════════════════════════════════════════════════════
const SpendByPhysicianView: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'), dayjs(),
  ]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const data = await get<{ items: any[] }>('/reports/spend-by-physician', params);
      setRows(data.items || []);
    } catch { message.error('Failed to load physician spend.'); }
    finally { setLoading(false); }
  }, [dateRange]);
  useEffect(() => { void fetch(); }, [fetch]);

  const total = rows.reduce((s, r) => s + Number(r.total_spend ?? 0), 0);
  const chartOpts: Highcharts.Options = {
    chart: { type: 'bar', height: Math.max(280, rows.length * 28 + 80) },
    title: { text: undefined },
    xAxis: { categories: rows.map((r) => r.physician_name ?? r.physician_id) },
    yAxis: { title: { text: 'Spend ($)' } },
    tooltip: { formatter() { return `<b>${this.x}</b><br/>${formatCurrency(this.y as number)}`; } },
    series: [{ type: 'bar', name: 'Spend', data: rows.map((r) => Number(r.total_spend ?? 0)), color: '#722ed1' }],
    credits: { enabled: false }, legend: { enabled: false },
  };

  return (
    <>
      <ReportHeader icon={<UserOutlined />} title="Spend by Physician"
        subtitle="Orders attributed to each ordering physician, summed via the linked invoice totals." onRefresh={fetch} loading={loading} />
      <DateBar dateRange={dateRange} setDateRange={setDateRange} onApply={fetch} loading={loading} />
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}><StatCardWrapper><Statistic title="Total Spend" value={total} formatter={(v) => formatCurrency(Number(v))} prefix={<DollarOutlined />} /></StatCardWrapper></Col>
        <Col xs={24} md={12}><StatCardWrapper><Statistic title="Physicians with orders" value={rows.length} prefix={<UserOutlined />} /></StatCardWrapper></Col>
      </Row>
      <ChartCard title="Distribution">
        <Spin spinning={loading}>
          <div className="chart-wrap">
            {rows.length > 0
              ? <HighchartsReact highcharts={Highcharts} options={chartOpts} />
              : <Empty description="No orders with a physicianId in the selected date range." />}
          </div>
        </Spin>
      </ChartCard>
      <Card title="Detail" style={{ marginTop: 16 }}>
        <Table size="middle" rowKey="physician_id" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Physician', dataIndex: 'physician_name' },
            { title: 'Orders', dataIndex: 'order_count', align: 'right', width: 110 },
            { title: 'Invoices', dataIndex: 'invoice_count', align: 'right', width: 110 },
            { title: 'Total Spend', dataIndex: 'total_spend', align: 'right', width: 140, render: formatCurrency,
              sorter: (a: any, b: any) => Number(a.total_spend) - Number(b.total_spend), defaultSortOrder: 'descend' },
          ]}
          locale={{ emptyText: 'No physician-attributed spend.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 5 — Spend by Facility
// ═══════════════════════════════════════════════════════════════════════════
const SpendByFacilityView: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'), dayjs(),
  ]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const data = await get<{ items: any[] }>('/reports/spend-by-facility', params);
      setRows(data.items || []);
    } catch { message.error('Failed to load facility spend.'); }
    finally { setLoading(false); }
  }, [dateRange]);
  useEffect(() => { void fetch(); }, [fetch]);

  return (
    <>
      <ReportHeader icon={<BankOutlined />} title="Spend by Facility"
        subtitle="Invoiced spend rolled up by hospital facility." onRefresh={fetch} loading={loading} />
      <DateBar dateRange={dateRange} setDateRange={setDateRange} onApply={fetch} loading={loading} />
      <Card>
        <Table size="middle" rowKey="facility_id" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Facility', dataIndex: 'facility_name' },
            { title: 'City', dataIndex: 'city', width: 130 },
            { title: 'State', dataIndex: 'state', width: 80 },
            { title: 'Orders', dataIndex: 'order_count', align: 'right', width: 100 },
            { title: 'Invoices', dataIndex: 'invoice_count', align: 'right', width: 100 },
            { title: 'Total Spend', dataIndex: 'total_spend_usd', align: 'right', width: 140, render: (v) => formatCurrency(v),
              sorter: (a: any, b: any) => Number(a.total_spend_usd) - Number(b.total_spend_usd), defaultSortOrder: 'descend' },
          ]}
          locale={{ emptyText: 'No facility spend yet.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 6 — Spend by Department
// ═══════════════════════════════════════════════════════════════════════════
const SpendByDepartmentView: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'), dayjs(),
  ]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateRange[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const data = await get<{ items: any[] }>('/reports/spend-by-department', params);
      setRows(data.items || []);
    } catch { message.error('Failed to load department spend.'); }
    finally { setLoading(false); }
  }, [dateRange]);
  useEffect(() => { void fetch(); }, [fetch]);

  return (
    <>
      <ReportHeader icon={<AppstoreOutlined />} title="Spend by Department"
        subtitle="Invoiced spend rolled up by hospital department. For budget-aware burndown, see Department Spend (Budget)." onRefresh={fetch} loading={loading} />
      <DateBar dateRange={dateRange} setDateRange={setDateRange} onApply={fetch} loading={loading} />
      <Card>
        <Table size="middle" rowKey="department_id" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Department', dataIndex: 'department_name' },
            { title: 'Invoices', dataIndex: 'invoice_count', align: 'right', width: 110 },
            { title: 'Total Spend', dataIndex: 'total_spend_usd', align: 'right', width: 140, render: (v) => formatCurrency(v),
              sorter: (a: any, b: any) => Number(a.total_spend_usd) - Number(b.total_spend_usd), defaultSortOrder: 'descend' },
          ]}
          locale={{ emptyText: 'No department spend yet.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 7 — Vendor KPIs (per-vendor select + status / completion)
// ═══════════════════════════════════════════════════════════════════════════
const VendorKpisView: React.FC = () => {
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [kpis, setKpis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await get<any>('/vendors?limit=500');
        const list = (r.items ?? r ?? []).map((v: any) => ({ id: v.id, name: v.name }));
        setVendors(list);
        if (list.length > 0) setVendorId(list[0].id);
      } catch {/* noop */}
    })();
  }, []);

  const fetch = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    try {
      const r = await get<any>(`/reports/vendor-kpis?vendorId=${vendorId}`);
      setKpis(r);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load KPIs');
    } finally { setLoading(false); }
  }, [vendorId]);
  useEffect(() => { void fetch(); }, [fetch]);

  const avgHrs = kpis?.avgCompletionSeconds != null ? kpis.avgCompletionSeconds / 3600 : null;
  const breakdown = kpis?.statusBreakdown ?? [];

  return (
    <>
      <ReportHeader icon={<TrophyOutlined />} title="Vendor KPIs"
        subtitle="Per-vendor operational metrics: order status mix and average time-to-completion." onRefresh={fetch} loading={loading} />
      <Card style={{ marginBottom: 16 }} size="small">
        <Space>
          <Text strong>Vendor:</Text>
          <Select
            showSearch
            optionFilterProp="label"
            style={{ width: 320 }}
            placeholder="Select vendor"
            value={vendorId}
            onChange={setVendorId}
            options={vendors.map((v) => ({ value: v.id, label: v.name }))}
          />
        </Space>
      </Card>
      {!vendorId ? (
        <Empty description="No vendors available." />
      ) : (
        <Spin spinning={loading}>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}><StatCardWrapper><Statistic title="Total orders" value={kpis?.totalOrders ?? 0} prefix={<ShoppingCartOutlined />} /></StatCardWrapper></Col>
            <Col xs={24} md={8}><StatCardWrapper><Statistic title="Status buckets" value={breakdown.length} prefix={<AppstoreOutlined />} /></StatCardWrapper></Col>
            <Col xs={24} md={8}><StatCardWrapper><Statistic title="Avg completion (hours)" value={avgHrs != null ? avgHrs.toFixed(1) : '—'} /></StatCardWrapper></Col>
          </Row>
          <Card title="Status breakdown">
            <Table size="middle" rowKey={(_, i) => String(i)} dataSource={breakdown} pagination={false}
              columns={[
                { title: 'Status', dataIndex: 'status' },
                { title: 'Sub-status', dataIndex: 'orderSubStatus', render: (v) => v ?? <Text type="secondary">—</Text> },
                { title: 'Count', dataIndex: 'count', align: 'right', width: 100 },
              ]}
              locale={{ emptyText: 'No orders for this vendor yet.' }}
            />
          </Card>
        </Spin>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 8 — Unbilled Transactions
// ═══════════════════════════════════════════════════════════════════════════
const UnbilledTransactionsView: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fetch = useCallback(async () => {
    if (isAdmin && !adminHospital.selectedId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (isAdmin && adminHospital.selectedId) params.hospitalId = adminHospital.selectedId;
      const r = await get<{ items: any[] }>('/reports/unbilled-transactions', params);
      setRows(r.items || []);
    } catch { message.error('Failed to load unbilled transactions.'); }
    finally { setLoading(false); }
  }, [isAdmin, adminHospital.selectedId]);
  useEffect(() => { void fetch(); }, [fetch]);

  if (isAdmin && !adminHospital.selectedId) {
    return (
      <>
        <ReportHeader icon={<DollarOutlined />} title="Unbilled Transactions"
          subtitle="Orders completed but not yet invoiced — possible revenue capture issue." />
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Select a hospital to view this report"
          description={
            <Select
              placeholder="Select hospital…"
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280, marginTop: 8 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          }
        />
      </>
    );
  }

  return (
    <>
      <ReportHeader icon={<DollarOutlined />} title="Unbilled Transactions"
        subtitle="Orders completed but not yet invoiced — possible revenue capture issue." onRefresh={fetch} loading={loading} />
      {isAdmin && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <Text strong>Hospital:</Text>
            <Select
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          </Space>
        </Card>
      )}
      <Alert type="warning" showIcon style={{ marginBottom: 12 }}
        message="Each row is a COMPLETED order without an associated invoice. Create the invoice in Invoices, or close the order if it was non-billable." />
      <Card>
        <Table size="middle" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Order ID', dataIndex: 'identifier', width: 140 },
            { title: 'Patient', dataIndex: 'patient_name' },
            { title: 'Status', dataIndex: 'status', width: 120, render: (v) => <Tag color="green">{v}</Tag> },
            { title: 'Updated', dataIndex: 'updated_at', width: 180, render: (v) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—' },
          ]}
          locale={{ emptyText: 'No unbilled completed orders.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 9 — Compliance Users
// ═══════════════════════════════════════════════════════════════════════════
const ComplianceUsersView: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fetch = useCallback(async () => {
    if (isAdmin && !adminHospital.selectedId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (isAdmin && adminHospital.selectedId) params.hospitalId = adminHospital.selectedId;
      const r = await get<{ items: any[] }>('/reports/compliance/users', params);
      setRows(r.items || []);
    } catch { message.error('Failed to load user compliance.'); }
    finally { setLoading(false); }
  }, [isAdmin, adminHospital.selectedId]);
  useEffect(() => { void fetch(); }, [fetch]);

  const totalUsers = rows.length;
  const mfaCount = rows.filter((u) => u.mfa_enabled).length;
  const approvedCount = rows.filter((u) => u.approval_status === 'APPROVED').length;
  const phiCount = rows.filter((u) => u.has_agreed_to_phi_access).length;

  if (isAdmin && !adminHospital.selectedId) {
    return (
      <>
        <ReportHeader icon={<SafetyOutlined />} title="Compliance: Users"
          subtitle="User MFA enrolment, approval status, and PHI consent across the tenant." />
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Select a hospital to view this report"
          description={
            <Select
              placeholder="Select hospital…"
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280, marginTop: 8 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          }
        />
      </>
    );
  }

  return (
    <>
      <ReportHeader icon={<SafetyOutlined />} title="Compliance: Users"
        subtitle="User MFA enrolment, approval status, and PHI consent across the tenant." onRefresh={fetch} loading={loading} />
      {isAdmin && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <Text strong>Hospital:</Text>
            <Select
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          </Space>
        </Card>
      )}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><StatCardWrapper><Statistic title="Total users" value={totalUsers} /></StatCardWrapper></Col>
        <Col xs={12} md={6}><StatCardWrapper><Statistic title="MFA enrolled" value={mfaCount} valueStyle={{ color: '#52c41a' }} /></StatCardWrapper></Col>
        <Col xs={12} md={6}><StatCardWrapper><Statistic title="Approved" value={approvedCount} valueStyle={{ color: '#1677ff' }} /></StatCardWrapper></Col>
        <Col xs={12} md={6}><StatCardWrapper><Statistic title="PHI consented" value={phiCount} /></StatCardWrapper></Col>
      </Row>
      <Card>
        <Table size="middle" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 25 }} scroll={{ x: 900 }}
          columns={[
            { title: 'Email', dataIndex: 'email' },
            { title: 'Name', dataIndex: 'name' },
            { title: 'Role', dataIndex: 'role', render: (v) => <Tag>{v}</Tag> },
            { title: 'Type', dataIndex: 'user_type' },
            { title: 'Status', dataIndex: 'approval_status',
              render: (v) => <Tag color={v === 'APPROVED' ? 'green' : v === 'REJECTED' ? 'red' : 'gold'}>{v}</Tag> },
            { title: 'MFA', dataIndex: 'mfa_enabled',
              render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Enabled' : 'Disabled'}</Tag> },
            { title: 'PHI', dataIndex: 'has_agreed_to_phi_access',
              render: (v) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Agreed' : 'Pending'}</Tag> },
            { title: 'Last login', dataIndex: 'last_logged_in_at',
              render: (v) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—' },
          ]}
          locale={{ emptyText: 'No users.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 10 — Compliance Credentials
// ═══════════════════════════════════════════════════════════════════════════
const ComplianceCredentialsView: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fetch = useCallback(async () => {
    if (isAdmin && !adminHospital.selectedId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (isAdmin && adminHospital.selectedId) params.hospitalId = adminHospital.selectedId;
      const r = await get<{ items: any[] }>('/reports/compliance/credentials', params);
      setRows(r.items || []);
    } catch { message.error('Failed to load vendor credentials.'); }
    finally { setLoading(false); }
  }, [isAdmin, adminHospital.selectedId]);
  useEffect(() => { void fetch(); }, [fetch]);

  const expiredFlag = (v: any) => {
    if (!v) return <Text type="secondary">—</Text>;
    const expired = dayjs(v).isBefore(dayjs());
    return <Tag color={expired ? 'red' : 'green'}>{v}</Tag>;
  };

  if (isAdmin && !adminHospital.selectedId) {
    return (
      <>
        <ReportHeader icon={<SafetyOutlined />} title="Compliance: Vendor Credentials"
          subtitle="Vendor accreditation, license, and insurance expiry dates. Red = expired." />
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="Select a hospital to view this report"
          description={
            <Select
              placeholder="Select hospital…"
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280, marginTop: 8 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          }
        />
      </>
    );
  }

  return (
    <>
      <ReportHeader icon={<SafetyOutlined />} title="Compliance: Vendor Credentials"
        subtitle="Vendor accreditation, license, and insurance expiry dates. Red = expired." onRefresh={fetch} loading={loading} />
      {isAdmin && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <Text strong>Hospital:</Text>
            <Select
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          </Space>
        </Card>
      )}
      <Card>
        <Table size="middle" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 25 }}
          columns={[
            { title: 'Vendor', dataIndex: 'name' },
            { title: 'Accreditation expiry', dataIndex: 'accreditation_expiry_date', render: expiredFlag },
            { title: 'License expiry', dataIndex: 'state_level_license_expiry_date', render: expiredFlag },
            { title: 'Insurance expiry', dataIndex: 'liability_insurance_expiry_date', render: expiredFlag },
          ]}
          locale={{ emptyText: 'No vendor credentials on file.' }}
        />
      </Card>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// VIEW 0 — Overview (default fallback when no :reportId or unrecognized)
// ═══════════════════════════════════════════════════════════════════════════
const OverviewView: React.FC<{ initialTab?: string }> = ({ initialTab }) => {
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    dayjs().subtract(6, 'month'), dayjs(),
  ]);

  const [spendByMonth, setSpendByMonth] = useState<any[]>([]);
  const [spendByVendor, setSpendByVendor] = useState<any[]>([]);
  const [ordersByStatus, setOrdersByStatus] = useState<any[]>([]);
  const [spendByHcpc, setSpendByHcpc] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab ?? 'spend');
  const [scorecard, setScorecard] = useState<any[]>([]);
  const [loadingScorecard, setLoadingScorecard] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [creds, setCreds] = useState<any[]>([]);
  const [access, setAccess] = useState<any[]>([]);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (dateRange[0]) p.startDate = dateRange[0].format('YYYY-MM-DD');
    if (dateRange[1]) p.endDate = dateRange[1].format('YYYY-MM-DD');
    return p;
  }, [dateRange]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([
      get<{ items: any[] }>('/reports/spend-by-month', params).then((d) => setSpendByMonth(d.items || [])).catch(() => {}),
      get<{ items: any[] }>('/reports/spend-by-vendor', params).then((d) => {
        setSpendByVendor((d.items || []).map((v: any) => ({
          vendor: v.vendor ?? v.vendorName ?? '—',
          totalSpend: Number(v.totalSpend ?? 0),
          orders: Number(v.invoiceCount ?? v.orders ?? 0),
        })));
      }).catch(() => {}),
      get<{ items: any[] }>('/reports/orders-by-status', params).then((d) => setOrdersByStatus(d.items || [])).catch(() => {}),
      get<{ items: any[] }>('/reports/spend-by-hcpc', params).then((d) => setSpendByHcpc(d.items || [])).catch(() => {}),
    ]);
    setLoading(false);
  }, [params]);
  useEffect(() => { void fetchAll(); }, []);

  const fetchScorecard = useCallback(async () => {
    setLoadingScorecard(true);
    try {
      const r = await get<{ items: any[] }>('/reports/vendor-scorecard');
      setScorecard(r.items || []);
    } catch { message.error('Failed to load vendor scorecard'); }
    finally { setLoadingScorecard(false); }
  }, []);

  const fetchCompliance = useCallback(async () => {
    setLoadingCompliance(true);
    const [u, c, a] = await Promise.allSettled([
      get<{ items: any[] }>('/reports/compliance/users'),
      get<{ items: any[] }>('/reports/compliance/credentials'),
      get<{ items: any[] }>('/reports/compliance/network-access'),
    ]);
    if (u.status === 'fulfilled') setUsers(u.value.items || []);
    if (c.status === 'fulfilled') setCreds(c.value.items || []);
    if (a.status === 'fulfilled') setAccess(a.value.items || []);
    setLoadingCompliance(false);
  }, []);

  const onTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'scorecard' && scorecard.length === 0) void fetchScorecard();
    if (key === 'compliance' && users.length === 0) void fetchCompliance();
  };

  const totalSpend = spendByVendor.reduce((s, v) => s + v.totalSpend, 0);
  const totalOrders = spendByVendor.reduce((s, v) => s + v.orders, 0);
  const topVendor = [...spendByVendor].sort((a, b) => b.totalSpend - a.totalSpend)[0]?.vendor || '—';
  const thisMonthLabel = dayjs().format('MMM YYYY');
  const thisMonthSpend = spendByMonth.find((m) => m.month === dayjs().format('YYYY-MM'))?.totalSpend ?? 0;

  const spendByMonthOpts: Highcharts.Options = {
    chart: { type: 'line', height: 280 }, title: { text: undefined },
    xAxis: { categories: spendByMonth.map((m) => dayjs(m.month, 'YYYY-MM').format('MMM YYYY')) },
    yAxis: { title: { text: 'Spend ($)' } },
    series: [{ type: 'line', name: 'Spend', data: spendByMonth.map((m) => Number(m.totalSpend ?? 0)), color: '#1677ff' }],
    credits: { enabled: false }, legend: { enabled: false },
  };
  const spendByVendorOpts: Highcharts.Options = {
    chart: { type: 'bar', height: 280 }, title: { text: undefined },
    xAxis: { categories: spendByVendor.map((v) => v.vendor) },
    yAxis: { title: { text: 'Total Spend ($)' } },
    series: [{ type: 'bar', name: 'Spend', data: spendByVendor.map((v) => v.totalSpend), color: '#52c41a' }],
    credits: { enabled: false }, legend: { enabled: false },
  };
  const ordersByStatusOpts: Highcharts.Options = {
    chart: { type: 'pie', height: 280 }, title: { text: undefined },
    series: [{ type: 'pie', name: 'Orders', data: ordersByStatus.map((s) => ({ name: s.status, y: s.count })) }],
    credits: { enabled: false },
  };
  const spendByHcpcOpts: Highcharts.Options = {
    chart: { type: 'bar', height: 280 }, title: { text: undefined },
    xAxis: { categories: spendByHcpc.slice(0, 10).map((h) => `${h.code} – ${h.description ?? ''}`) },
    yAxis: { title: { text: 'Total Spend ($)' } },
    series: [{ type: 'bar', name: 'Spend', data: spendByHcpc.slice(0, 10).map((h) => Number(h.totalSpend ?? 0)), color: '#fa8c16' }],
    credits: { enabled: false }, legend: { enabled: false },
  };

  return (
    <>
      <ReportHeader icon={<BarChartOutlined />} title="Reports & Analytics"
        subtitle="Supply chain spend and order insights — pick a sidebar item for a focused report." />
      <Tabs activeKey={activeTab} onChange={onTabChange} style={{ marginBottom: 0 }}
        items={[
          { key: 'spend', label: <><BarChartOutlined /> Spend</> },
          { key: 'scorecard', label: <><TrophyOutlined /> Vendor Scorecard</> },
          { key: 'compliance', label: <><SafetyOutlined /> Compliance</> },
        ]}
      />
      {activeTab === 'spend' && <>
        <DateBar dateRange={dateRange} setDateRange={setDateRange} onApply={fetchAll} loading={loading} />
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}><StatCardWrapper><Statistic title="Total Spend" value={totalSpend} formatter={(v) => formatCurrency(Number(v))} prefix={<DollarOutlined />} loading={loading} /></StatCardWrapper></Col>
          <Col xs={24} sm={12} md={6}><StatCardWrapper><Statistic title="Total Orders" value={totalOrders} prefix={<ShoppingCartOutlined />} loading={loading} /></StatCardWrapper></Col>
          <Col xs={24} sm={12} md={6}><StatCardWrapper><Statistic title="Top Vendor" value={topVendor} prefix={<TeamOutlined />} loading={loading} /></StatCardWrapper></Col>
          <Col xs={24} sm={12} md={6}><StatCardWrapper><Statistic title={`This Month (${thisMonthLabel})`} value={thisMonthSpend} formatter={(v) => formatCurrency(Number(v))} prefix={<CalendarOutlined />} loading={loading} /></StatCardWrapper></Col>
        </Row>
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={12}>
            <ChartCard title="Spend by Month" style={{ height: '100%' }}>
              <Spin spinning={loading}><div className="chart-wrap">
                {spendByMonth.length > 0 ? <HighchartsReact highcharts={Highcharts} options={spendByMonthOpts} /> : <Empty description="No data" />}
              </div></Spin>
            </ChartCard>
          </Col>
          <Col xs={24} lg={12}>
            <ChartCard title="Spend by Vendor" style={{ height: '100%' }}>
              <Spin spinning={loading}><div className="chart-wrap">
                {spendByVendor.length > 0 ? <HighchartsReact highcharts={Highcharts} options={spendByVendorOpts} /> : <Empty description="No data" />}
              </div></Spin>
            </ChartCard>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <ChartCard title="Orders by Status">
              <Spin spinning={loading}><div className="chart-wrap">
                {ordersByStatus.length > 0 ? <HighchartsReact highcharts={Highcharts} options={ordersByStatusOpts} /> : <Empty description="No data" />}
              </div></Spin>
            </ChartCard>
          </Col>
          <Col xs={24} lg={12}>
            <ChartCard title="Top HCPC Codes">
              <Spin spinning={loading}><div className="chart-wrap">
                {spendByHcpc.length > 0 ? <HighchartsReact highcharts={Highcharts} options={spendByHcpcOpts} /> : <Empty description="No data" />}
              </div></Spin>
            </ChartCard>
          </Col>
        </Row>
      </>}
      {activeTab === 'scorecard' && (
        <Card title={<Space><TrophyOutlined />Vendor Performance Scorecard</Space>}
          extra={<Button onClick={fetchScorecard} loading={loadingScorecard}>Refresh</Button>}
          style={{ marginTop: 16 }}
        >
          <Spin spinning={loadingScorecard}>
            <Table rowKey="vendor_id" dataSource={scorecard} pagination={{ pageSize: 20 }}
              locale={{ emptyText: 'No scorecard data.' }}
              columns={[
                { title: 'Vendor', dataIndex: 'vendor_name' },
                { title: 'Total Orders', dataIndex: 'total_orders', align: 'center' },
                { title: 'Completed', dataIndex: 'completed', align: 'center', render: (v: number, r: any) => {
                  const pct = r.total_orders > 0 ? Math.round((v / r.total_orders) * 100) : 0;
                  return <><Tag color="green">{v}</Tag><Progress percent={pct} size="small" style={{ width: 80 }} /></>;
                } },
                { title: 'Cancelled', dataIndex: 'cancelled', align: 'center', render: (v: number) => <Tag color={v > 0 ? 'red' : 'default'}>{v}</Tag> },
                { title: 'On-Time %', dataIndex: 'on_time_pct', align: 'center',
                  render: (v: number | null) => v == null ? '—' : <Tag color={v >= 90 ? 'green' : v >= 70 ? 'orange' : 'red'}>{v}%</Tag> },
                { title: 'QC %', dataIndex: 'qc_pass_pct', align: 'center',
                  render: (v: number | null) => v == null ? '—' : <Tag color={v >= 95 ? 'green' : v >= 80 ? 'orange' : 'red'}>{v}%</Tag> },
                { title: 'SLA breaches', dataIndex: 'sla_breach_count', align: 'center',
                  render: (v: number) => <Tag color={v === 0 ? 'green' : v < 3 ? 'orange' : 'red'}>{v ?? 0}</Tag> },
              ]}
            />
          </Spin>
        </Card>
      )}
      {activeTab === 'compliance' && (
        <Spin spinning={loadingCompliance}>
          <Card title="User Compliance" style={{ marginTop: 16, marginBottom: 16 }}>
            <Table rowKey="id" dataSource={users} pagination={{ pageSize: 20 }} scroll={{ x: 900 }}
              columns={[
                { title: 'Email', dataIndex: 'email' },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Role', dataIndex: 'role', render: (v) => <Tag>{v}</Tag> },
                { title: 'MFA', dataIndex: 'mfa_enabled', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'On' : 'Off'}</Tag> },
                { title: 'Last login', dataIndex: 'last_logged_in_at', render: (v) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—' },
              ]}
              locale={{ emptyText: 'No users.' }}
            />
          </Card>
          <Card title="Vendor Credentials" style={{ marginBottom: 16 }}>
            <Table rowKey="id" dataSource={creds} pagination={{ pageSize: 20 }}
              columns={[
                { title: 'Vendor', dataIndex: 'name' },
                { title: 'Accreditation', dataIndex: 'accreditation_expiry_date' },
                { title: 'License', dataIndex: 'state_level_license_expiry_date' },
                { title: 'Insurance', dataIndex: 'liability_insurance_expiry_date' },
              ]}
              locale={{ emptyText: 'No vendor credentials.' }}
            />
          </Card>
          <Card title="Network Access (last 100 logins)">
            <Table rowKey="email" dataSource={access} pagination={{ pageSize: 20 }}
              columns={[
                { title: 'Email', dataIndex: 'email' },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Last login', dataIndex: 'last_logged_in_at', render: (v) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '—' },
              ]}
              locale={{ emptyText: 'No access logs.' }}
            />
          </Card>
        </Spin>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════
const Reports: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();

  let view: React.ReactNode;
  switch (reportId) {
    case 'spend-by-vendor': view = <SpendByVendorView />; break;
    case 'spend-by-hcpc': view = <SpendByHcpcView />; break;
    case 'spend-by-month': view = <SpendByMonthView />; break;
    case 'spend-by-physician': view = <SpendByPhysicianView />; break;
    case 'spend-by-facility': view = <SpendByFacilityView />; break;
    case 'spend-by-department': view = <SpendByDepartmentView />; break;
    case 'vendor-kpis': view = <VendorKpisView />; break;
    case 'unbilled-transactions': view = <UnbilledTransactionsView />; break;
    case 'compliance-users': view = <ComplianceUsersView />; break;
    case 'compliance-credentials': view = <ComplianceCredentialsView />; break;
    // Overview tab shortcuts — land with the correct tab pre-selected
    case 'vendor-scorecard': view = <OverviewView initialTab="scorecard" />; break;
    case 'compliance': view = <OverviewView initialTab="compliance" />; break;
    default: view = <OverviewView />; break;
  }

  return <PageWrapper>{view}</PageWrapper>;
};

export default Reports;
