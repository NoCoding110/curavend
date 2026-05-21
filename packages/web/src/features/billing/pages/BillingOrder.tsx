import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tag,
  Input,
  Tabs,
  Row,
  Col,
  message,
  Spin,
  Modal,
  DatePicker,
  Select,
  Alert,
  Dropdown,
  Tooltip,
} from 'antd';
import {
  SearchOutlined,
  EyeOutlined,
  DollarOutlined,
  ReloadOutlined,
  DownloadOutlined,
  UploadOutlined,
  MoreOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import styled from 'styled-components';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { invoicesApi } from '../../../api/invoices';
import { get } from '../../../api/client';
import { useListColumns, type ListColumnDef } from '../../../hooks/useListColumns';
import { useFilterPresets } from '../../../hooks/useFilterPresets';
import { useAsyncDropdown } from '../../../hooks/useAsyncDropdown';
import { ColumnCustomizerDrawer } from '../../../components/list/ColumnCustomizerDrawer';
import { FilterPresetsMenu } from '../../../components/list/FilterPresetsMenu';
import type { FilterPreset } from '../../../api/filterPresets';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';
import {
  getInvoiceStatusDisplay,
  getInvoiceStatusTabs,
  perspectiveFromUserType,
  type InvoiceStatus as InvoiceStatusEnum,
} from '../invoiceStatusDisplay';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const PageWrapper = styled.div`
  padding: 24px;
`;

const FilterBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
`;

type InvoiceStatus =
  | 'ORDER_COMPLETED'
  | 'SPEND_CONFIRMED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_SENT'
  | 'INVOICE_PAID';

interface InvoiceRecord {
  id: string;
  number: string;
  orderId: string;
  hospital: string;
  hospitalId: string;
  vendor: string;
  vendorId: string;
  total: number;
  status: InvoiceStatus;
  createdAt: string;
}

const ALL_TAB = 'ALL';

const PAGE_SIZE = 10;

type ColumnKey =
  | 'number'
  | 'orderId'
  | 'hospital'
  | 'vendor'
  | 'status'
  | 'total'
  | 'createdAt'
  | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'number', label: 'Invoice #' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'hospital', label: 'Hospital' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'status', label: 'Status' },
  { key: 'total', label: 'Total' },
  { key: 'createdAt', label: 'Date' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = [
  'number',
  'orderId',
  'hospital',
  'vendor',
  'status',
  'total',
  'createdAt',
  'actions',
];

const ENTITY = 'invoices';

interface FetchParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  vendorId?: string;
  hospitalId?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const BillingOrder: React.FC = () => {
  const navigate = useNavigate();
  const userType = useSelector((state: RootState) => state.auth.userData?.userType);
  const perspective = useMemo(() => perspectiveFromUserType(userType), [userType]);
  const tabItems = useMemo(() => getInvoiceStatusTabs(perspective), [perspective]);

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [searchText, setSearchText] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string | undefined>();
  const [hospitalFilter, setHospitalFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const [pagination, setPagination] = useState({ current: 1, pageSize: PAGE_SIZE, total: 0 });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Columns & presets
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_invoices_columns_v1',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const presetsCtrl = useFilterPresets(ENTITY);

  // Async vendor / hospital dropdowns
  const vendorDropdown = useAsyncDropdown<{ label: string; value: string }>({
    fetcher: async (q) => {
      const res = await get<any>('/vendors', { search: q, limit: 20 });
      const items = res?.items ?? (Array.isArray(res) ? res : []);
      return items.map((v: any) => ({ label: v.name ?? v.vendorName, value: v.id }));
    },
    prefetch: true,
    minChars: 0,
  });

  const hospitalDropdown = useAsyncDropdown<{ label: string; value: string }>({
    fetcher: async (q) => {
      const res = await get<any>('/hospital-facilities', { search: q, limit: 20 });
      const items = res?.items ?? (Array.isArray(res) ? res : []);
      return items.map((h: any) => ({ label: h.name ?? h.facilityName, value: h.id }));
    },
    prefetch: true,
    minChars: 0,
  });

  // CSV Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportDateRange, setExportDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  // CSV Import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = useCallback(async (p: FetchParams = {}) => {
    setLoading(true);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? PAGE_SIZE;
      const offset = (page - 1) * pageSize;
      const params: Record<string, any> = { limit: pageSize, offset };

      const status = 'status' in p ? p.status : activeTab;
      const search = 'search' in p ? p.search : searchText;
      const vendor = 'vendorId' in p ? p.vendorId : vendorFilter;
      const hospital = 'hospitalId' in p ? p.hospitalId : hospitalFilter;
      const from = 'dateFrom' in p ? p.dateFrom : (dateRange[0]?.format('YYYY-MM-DD'));
      const to = 'dateTo' in p ? p.dateTo : (dateRange[1]?.format('YYYY-MM-DD'));

      if (status && status !== ALL_TAB) params.status = status;
      if (search?.trim()) params.search = search.trim();
      if (vendor) params.vendorId = vendor;
      if (hospital) params.hospitalId = hospital;
      if (from) params.startDate = from;
      if (to) params.endDate = to;
      if (p.sortBy) { params.sortBy = p.sortBy; params.sortOrder = p.sortOrder ?? 'asc'; }

      const data = await invoicesApi.list(params);

      const items: any[] = Array.isArray(data)
        ? data
        : (data?.items ?? data?.data ?? data?.invoices ?? []);
      const total: number = Array.isArray(data)
        ? items.length
        : (data?.total ?? data?.count ?? items.length);

      setInvoices(
        items.map((inv: any) => ({
          id: inv.id ?? inv._id,
          number: inv.number ?? inv.invoiceNumber ?? inv.id,
          orderId: inv.orderId ?? inv.order?.id ?? inv.supplyOrderId ?? '—',
          hospital:
            inv.hospitalName ?? inv.hospital?.name ?? inv.facilityName ?? inv.hospitalId ?? '—',
          hospitalId: inv.hospitalId ?? inv.hospital?.id ?? '',
          vendor: inv.vendorName ?? inv.vendor?.name ?? inv.vendorId ?? '—',
          vendorId: inv.vendorId ?? inv.vendor?.id ?? '',
          total: Number(inv.total ?? inv.totalAmount ?? 0),
          status: inv.status as InvoiceStatus,
          createdAt: inv.createdAt ?? inv.date ?? '',
        })),
      );
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchText, vendorFilter, hospitalFilter, dateRange]);

  const currentFilters = (): FetchParams => ({
    status: activeTab,
    search: searchText || undefined,
    vendorId: vendorFilter,
    hospitalId: hospitalFilter,
    dateFrom: dateRange[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange[1]?.format('YYYY-MM-DD'),
    sortBy,
    sortOrder,
  });

  // Initial load after presets are ready
  useEffect(() => {
    if (!presetsCtrl.defaultApplied) return;
    const def = presetsCtrl.presets.find((p) => p.isDefault);
    if (def && !presetsCtrl.activePresetId) applyPreset(def);
    else fetchInvoices({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetsCtrl.defaultApplied]);

  const handleSearch = (v: string) => {
    setSearchText(v);
    presetsCtrl.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchInvoices({ ...currentFilters(), search: v || undefined, page: 1 });
    }, 400);
  };

  const handleVendorChange = (v?: string) => {
    setVendorFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchInvoices({ ...currentFilters(), vendorId: v, page: 1 });
  };

  const handleHospitalChange = (v?: string) => {
    setHospitalFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchInvoices({ ...currentFilters(), hospitalId: v, page: 1 });
  };

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    const next: [Dayjs | null, Dayjs | null] = dates ? [dates[0], dates[1]] : [null, null];
    setDateRange(next);
    presetsCtrl.setActivePresetId(null);
    fetchInvoices({
      ...currentFilters(),
      dateFrom: next[0]?.format('YYYY-MM-DD'),
      dateTo: next[1]?.format('YYYY-MM-DD'),
      page: 1,
    });
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    presetsCtrl.setActivePresetId(null);
    setPagination((prev) => ({ ...prev, current: 1 }));
    fetchInvoices({ ...currentFilters(), status: key, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<InvoiceRecord> | SorterResult<InvoiceRecord>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nb = s?.order ? (s.field as string) : undefined;
    const no: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nb);
    setSortOrder(no);
    fetchInvoices({
      ...currentFilters(),
      sortBy: nb,
      sortOrder: no,
      page: pag.current ?? 1,
      pageSize: pag.pageSize ?? PAGE_SIZE,
    });
  };

  const applyPreset = (preset: FilterPreset) => {
    const f = preset.filters || {};
    const tab = f.status ?? ALL_TAB;
    const dr: [Dayjs | null, Dayjs | null] = [
      f.dateFrom ? dayjs(f.dateFrom) : null,
      f.dateTo ? dayjs(f.dateTo) : null,
    ];
    setActiveTab(tab);
    setSearchText(f.search ?? '');
    setVendorFilter(f.vendorId ?? undefined);
    setHospitalFilter(f.hospitalId ?? undefined);
    setDateRange(dr);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presetsCtrl.setActivePresetId(preset.id);
    fetchInvoices({
      status: tab,
      search: f.search,
      vendorId: f.vendorId,
      hospitalId: f.hospitalId,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      sortBy: f.sortBy,
      sortOrder: f.sortOrder,
      page: 1,
    });
  };

  const clearAllFilters = () => {
    setActiveTab(ALL_TAB);
    setSearchText('');
    setVendorFilter(undefined);
    setHospitalFilter(undefined);
    setDateRange([null, null]);
    setSortBy(undefined);
    setSortOrder(undefined);
    presetsCtrl.setActivePresetId(null);
    fetchInvoices({ status: ALL_TAB, search: '', vendorId: undefined, hospitalId: undefined, page: 1 });
  };

  const handleExportCsv = async () => {
    setExportLoading(true);
    try {
      const params: Record<string, any> = {};
      if (exportStatus) params.status = exportStatus;
      if (exportDateRange[0]) params.startDate = exportDateRange[0].format('YYYY-MM-DD');
      if (exportDateRange[1]) params.endDate = exportDateRange[1].format('YYYY-MM-DD');
      await invoicesApi.exportCsv(params);
      message.success('CSV downloaded');
      setExportModalOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Export failed');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportResults(null);
    try {
      const text = await file.text();
      const result = await invoicesApi.importPayments(text);
      setImportResults(result);
      message.success(`Imported: ${result.processed} succeeded, ${result.failed} failed`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Import failed');
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sortedOrder = (field: string): 'ascend' | 'descend' | null =>
    sortBy === field ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null;

  const columnDefs: Record<ColumnKey, ColumnType<InvoiceRecord>> = {
    number: {
      title: 'Invoice #',
      dataIndex: 'number',
      key: 'number',
      sorter: true,
      sortOrder: sortedOrder('number'),
      render: (text: string, record) => (
        <a
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/billing-orders/${record.id}`);
          }}
        >
          {text}
        </a>
      ),
    },
    orderId: { title: 'Order ID', dataIndex: 'orderId', key: 'orderId' },
    hospital: { title: 'Hospital', dataIndex: 'hospital', key: 'hospital' },
    vendor: { title: 'Vendor', dataIndex: 'vendor', key: 'vendor' },
    status: {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      sortOrder: sortedOrder('status'),
      render: (status: InvoiceStatus) => {
        const { label, color } = getInvoiceStatusDisplay(status as InvoiceStatusEnum, perspective);
        return <Tag color={color}>{label}</Tag>;
      },
    },
    total: {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      sorter: true,
      sortOrder: sortedOrder('total'),
      render: (val: number) => `$${val.toFixed(2)}`,
    },
    createdAt: {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: true,
      sortOrder: sortedOrder('createdAt'),
      render: (val: string) => (val ? dayjs(val).format('YYYY-MM-DD') : '—'),
    },
    actions: {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: unknown, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/billing-orders/${record.id}`);
          }}
        >
          View
        </Button>
      ),
    },
  };

  const baseColumns: ColumnsType<InvoiceRecord> = useMemo(
    () => cols.finalKeys.map((k) => columnDefs[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols.finalKeys, sortBy, sortOrder],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  const baseImportColumns = [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'num' },
    {
      title: 'Result',
      key: 'result',
      render: (_: any, r: any) =>
        r.success ? (
          <Tag color="green">OK</Tag>
        ) : (
          <Tag color="red">{r.error ?? 'Failed'}</Tag>
        ),
    },
  ];
  const { columns: importColumns, components: importTableComponents } = useResizableColumns(baseImportColumns as any[]);

  const actionMenuItems = [
    {
      key: 'export',
      label: 'Export CSV',
      icon: <DownloadOutlined />,
      onClick: () => setExportModalOpen(true),
    },
    {
      key: 'import',
      label: 'Import Payments CSV',
      icon: <UploadOutlined />,
      onClick: () => setImportModalOpen(true),
    },
  ];

  const activeFiltersCount = [
    vendorFilter,
    hospitalFilter,
    dateRange[0],
    activeTab !== ALL_TAB ? activeTab : null,
  ].filter(Boolean).length;

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <DollarOutlined style={{ fontSize: 24 }} />
            <Title level={3} style={{ margin: 0 }}>
              Billing
            </Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button
                icon={<ReloadOutlined />}
                onClick={() =>
                  fetchInvoices({ ...currentFilters(), page: pagination.current })
                }
              />
            </Tooltip>
            <Tooltip title="Choose & reorder columns">
              <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>
                Columns
              </Button>
            </Tooltip>
            <Dropdown menu={{ items: actionMenuItems }} trigger={['click']}>
              <Button icon={<MoreOutlined />}>Actions</Button>
            </Dropdown>
          </Space>
        </Col>
      </Row>

      <Card>
        {/* Status tabs */}
        <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />

        {/* Filter bar */}
        <FilterBar>
          <Input
            placeholder="Search invoices…"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 220 }}
            allowClear
            onClear={() => handleSearch('')}
          />

          {/* Vendor filter */}
          <Select
            allowClear
            showSearch
            filterOption={false}
            placeholder="Filter by vendor"
            style={{ width: 200 }}
            value={vendorFilter}
            onChange={handleVendorChange}
            onSearch={vendorDropdown.onSearch}
            onClear={vendorDropdown.reset}
            options={vendorDropdown.options}
            loading={vendorDropdown.loading}
            notFoundContent={
              vendorDropdown.loading ? <Spin size="small" /> : 'Type to search vendors'
            }
          />

          {/* Hospital filter */}
          <Select
            allowClear
            showSearch
            filterOption={false}
            placeholder="Filter by hospital"
            style={{ width: 200 }}
            value={hospitalFilter}
            onChange={handleHospitalChange}
            onSearch={hospitalDropdown.onSearch}
            onClear={hospitalDropdown.reset}
            options={hospitalDropdown.options}
            loading={hospitalDropdown.loading}
            notFoundContent={
              hospitalDropdown.loading ? <Spin size="small" /> : 'Type to search hospitals'
            }
          />

          {/* Date range */}
          <RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            format="MM/DD/YYYY"
            placeholder={['Start date', 'End date']}
            style={{ width: 240 }}
            allowClear
          />

          <FilterPresetsMenu
            controller={presetsCtrl}
            getCurrentFilters={() => currentFilters()}
            onApply={applyPreset}
            hint="Saves tab, search, vendor, hospital, date range, and sort."
          />

          {activeFiltersCount > 0 && (
            <Button type="text" onClick={clearAllFilters}>
              Clear filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </Button>
          )}
        </FilterBar>

        <Spin spinning={loading}>
          <Table
            columns={columns}
            components={tableComponents}
            dataSource={invoices}
            rowKey="id"
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '25', '50'],
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} invoices`,
            }}
            onChange={handleTableChange}
            onRow={(record) => ({
              onClick: () => navigate(`/billing-orders/${record.id}`),
              style: { cursor: 'pointer' },
            })}
            size="middle"
          />
        </Spin>
      </Card>

      {/* Column customizer drawer */}
      <ColumnCustomizerDrawer<ColumnKey>
        open={columnsDrawerOpen}
        onClose={() => setColumnsDrawerOpen(false)}
        allColumns={ALL_COLUMNS}
        visibleKeys={cols.visibleKeys}
        orderedKeys={cols.orderedKeys}
        onToggle={cols.toggle}
        onOrderChange={cols.setOrder}
        onReset={cols.resetDefaults}
        onShowAll={cols.showAll}
      />

      {/* Export CSV Modal */}
      <Modal
        title="Export Invoices CSV"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        onOk={handleExportCsv}
        confirmLoading={exportLoading}
        okText="Download CSV"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Status Filter</div>
            <Select
              allowClear
              placeholder="All statuses"
              style={{ width: '100%' }}
              value={exportStatus || undefined}
              onChange={(v) => setExportStatus(v ?? '')}
              options={tabItems.filter((t) => t.key !== ALL_TAB).map((t) => ({
                label: t.label,
                value: t.key,
              }))}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Date Range</div>
            <RangePicker
              style={{ width: '100%' }}
              value={exportDateRange}
              onChange={(dates) =>
                setExportDateRange(dates ? [dates[0], dates[1]] : [null, null])
              }
              format="MM/DD/YYYY"
            />
          </div>
        </Space>
      </Modal>

      {/* Import Payments Modal */}
      <Modal
        title="Import Payment Details CSV"
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportResults(null);
        }}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert
            message="CSV must have columns: invoiceNumber, payeeName, amountPaid, paymentDate, reference"
            type="info"
            showIcon
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            disabled={importLoading}
          />
          {importLoading && <Spin />}
          {importResults && (
            <div>
              <Alert
                message={`${importResults.processed} succeeded · ${importResults.failed} failed`}
                type={importResults.failed > 0 ? 'warning' : 'success'}
                showIcon
                style={{ marginBottom: 8 }}
              />
              <Table
                size="small"
                rowKey="invoiceNumber"
                dataSource={importResults.results}
                pagination={false}
                columns={importColumns}
                components={importTableComponents}
              />
            </div>
          )}
        </Space>
      </Modal>
    </PageWrapper>
  );
};

export default BillingOrder;
