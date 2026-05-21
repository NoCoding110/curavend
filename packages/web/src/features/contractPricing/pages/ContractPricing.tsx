import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRoles } from '../../../hooks/useUserRoles';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
  Modal,
  Form,
  Input,
  DatePicker,
  Collapse,
  Spin,
  message,
  Tooltip,
  Drawer,
  Descriptions,
  Divider,
  Select,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  FileTextOutlined,
  WarningOutlined,
  DollarOutlined,
  FilePdfOutlined,
  EyeOutlined,
  SearchOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { get, post, put, uploadFile } from '../../../api/client';
import { useListColumns, type ListColumnDef } from '../../../hooks/useListColumns';
import { useFilterPresets } from '../../../hooks/useFilterPresets';
import { useAsyncDropdown } from '../../../hooks/useAsyncDropdown';
import { ColumnCustomizerDrawer } from '../../../components/list/ColumnCustomizerDrawer';
import { FilterPresetsMenu } from '../../../components/list/FilterPresetsMenu';
import type { FilterPreset } from '../../../api/filterPresets';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
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
  padding: 0 24px;
`;

const StatCard = styled(Card)`
  text-align: center;
  .stat-value {
    font-size: 26px;
    font-weight: 700;
    color: #1677ff;
  }
  .stat-label {
    font-size: 13px;
    color: #888;
    margin-top: 4px;
  }
`;

interface Contract {
  id: string;
  name: string;
  vendor: string;
  vendorId: string;
  hospital: string;
  hospitalId: string;
  startDate: string;
  endDate: string;
  fileUrl?: string;
  fileName?: string;
  status?: string;
  initiatedBy?: string;
  currentRevisionId?: string;
  parentContractId?: string;
}

interface FeeScheduleItem {
  id: string;
  hcpcCode: string;
  description: string;
  price: number;
}

interface FeeSchedule {
  id: string;
  name: string;
  vendor: string;
  vendorId: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  items?: FeeScheduleItem[];
}

const isExpired = (endDate: string): boolean =>
  dayjs(endDate).isBefore(dayjs(), 'day');

type ColumnKey =
  | 'name'
  | 'vendor'
  | 'hospital'
  | 'status'
  | 'startDate'
  | 'endDate'
  | 'file'
  | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'hospital', label: 'Hospital' },
  { key: 'status', label: 'Status' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'endDate', label: 'End Date' },
  { key: 'file', label: 'File' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = [
  'name',
  'vendor',
  'hospital',
  'status',
  'startDate',
  'endDate',
  'file',
  'actions',
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'gold',
  APPROVED: 'blue',
  ACTIVE: 'green',
  EXPIRED: 'red',
  TERMINATED: 'red',
  REJECTED: 'volcano',
  SUPERSEDED: 'purple',
};

const ENTITY = 'contracts';

const ContractPricing: React.FC = () => {
  const { isAdmin, isHospital, isVendor, userData } = useUserRoles();
  const canCreateContract = isAdmin || isHospital || isVendor;

  // Mirror of backend `assertContractAccess` — gates per-row edit/upload UI.
  const canEditContract = (c: Contract | null | undefined): boolean => {
    if (!c) return false;
    if (isAdmin) return true;
    if (isHospital && userData?.hospitalId && (c as any).hospitalId === userData.hospitalId) return true;
    if (isVendor && userData?.vendorId && (c as any).vendorId === userData.vendorId) return true;
    return false;
  };
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('contracts');

  // Contracts state
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [addContractOpen, setAddContractOpen] = useState(false);
  const [addContractLoading, setAddContractLoading] = useState(false);
  const [contractFileList, setContractFileList] = useState<UploadFile[]>([]);
  const [contractForm] = Form.useForm();

  // Contract detail drawer
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [contractDrawerOpen, setContractDrawerOpen] = useState(false);
  const [drawerFileList, setDrawerFileList] = useState<UploadFile[]>([]);
  const [drawerUploadLoading, setDrawerUploadLoading] = useState(false);

  // Contracted-partner dropdown options for the Add Contract modal.
  // For HOSPITAL users → list of vendors they have an APPROVED hospital_vendor with.
  // For VENDOR users   → list of hospitals they have an APPROVED hospital_vendor with.
  const [partnerOptions, setPartnerOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [partnerOptionsLoading, setPartnerOptionsLoading] = useState(false);

  // Filters / sort
  const [searchText, setSearchText] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string | undefined>();
  const [hospitalFilter, setHospitalFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
  });

  // Columns & presets
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_contracts_columns_v1',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const presetsCtrl = useFilterPresets(ENTITY);

  // Async vendor/hospital lookups
  const vendorDropdown = useAsyncDropdown<{ label: string; value: string }>({
    fetcher: async (q) => {
      const res = await get<any>('/vendors', { search: q, limit: 20 });
      const items = res?.items ?? (Array.isArray(res) ? res : []);
      return items.map((v: any) => ({ label: v.name, value: v.id }));
    },
  });
  const hospitalDropdown = useAsyncDropdown<{ label: string; value: string }>({
    fetcher: async (q) => {
      const res = await get<any>('/hospital-facilities', { search: q, limit: 20 });
      const items = res?.items ?? (Array.isArray(res) ? res : []);
      return items.map((h: any) => ({ label: h.name, value: h.id }));
    },
  });

  // Fee schedules state
  const [feeSchedules, setFeeSchedules] = useState<FeeSchedule[]>([]);
  const [feeSchedulesLoading, setFeeSchedulesLoading] = useState(false);
  const [expandedScheduleItems, setExpandedScheduleItems] = useState<
    Record<string, FeeScheduleItem[]>
  >({});
  const [expandedScheduleLoading, setExpandedScheduleLoading] = useState<Record<string, boolean>>(
    {},
  );

  interface FetchParams {
    page?: number;
    pageSize?: number;
    search?: string;
    vendorId?: string;
    hospitalId?: string;
    status?: string; // free-form to support new lifecycle statuses
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  const fetchContracts = useCallback(async (p: FetchParams = {}) => {
    setContractsLoading(true);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? (pagination.pageSize as number) ?? 20;
      const query: Record<string, any> = { limit: pageSize, offset: (page - 1) * pageSize };
      if (p.search) query.search = p.search;
      if (p.vendorId) query.vendorId = p.vendorId;
      if (p.hospitalId) query.hospitalId = p.hospitalId;
      if (p.status) query.status = p.status;
      if (p.sortBy) {
        query.sortBy = p.sortBy;
        query.sortOrder = p.sortOrder ?? 'asc';
      }
      const data = await get<any>('/contracts', query);
      const rawItems: any[] = data?.items ?? (Array.isArray(data) ? data : []);
      // API stores the file path in `s3key`; map it to `fileUrl` for the UI.
      const items: Contract[] = rawItems.map((c) => ({
        ...c,
        fileUrl: c.fileUrl ?? (c.s3key || undefined),
      }));
      const total = data?.total ?? items.length;
      // Client-side expired filtering fallback in case the backend ignores status
      const filtered =
        p.status === 'active'
          ? items.filter((c) => !isExpired(c.endDate))
          : p.status === 'expired'
          ? items.filter((c) => isExpired(c.endDate))
          : items;
      setContracts(filtered);
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load contracts.');
    } finally {
      setContractsLoading(false);
    }
  }, [pagination.pageSize]);

  const fetchFeeSchedules = async () => {
    setFeeSchedulesLoading(true);
    try {
      const data = await get<{ items: FeeSchedule[] }>('/contracts/fee-schedules');
      setFeeSchedules(data.items || []);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load fee schedules.');
    } finally {
      setFeeSchedulesLoading(false);
    }
  };

  const fetchFeeScheduleItems = async (scheduleId: string) => {
    if (expandedScheduleItems[scheduleId]) return;
    setExpandedScheduleLoading((prev) => ({ ...prev, [scheduleId]: true }));
    try {
      const data = await get<{ items: FeeScheduleItem[] }>(
        `/contracts/fee-schedules/${scheduleId}/items`,
      );
      setExpandedScheduleItems((prev) => ({ ...prev, [scheduleId]: data.items || [] }));
    } catch {
      setExpandedScheduleItems((prev) => ({ ...prev, [scheduleId]: [] }));
    } finally {
      setExpandedScheduleLoading((prev) => ({ ...prev, [scheduleId]: false }));
    }
  };

  const currentFilters = () => ({
    search: searchText || undefined,
    vendorId: vendorFilter,
    hospitalId: hospitalFilter,
    status: statusFilter,
    sortBy,
    sortOrder,
  });

  useEffect(() => {
    presetsCtrl.refresh();
    fetchFeeSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!presetsCtrl.defaultApplied) return;
    const def = presetsCtrl.presets.find((p) => p.isDefault);
    if (def && !presetsCtrl.activePresetId) applyPreset(def);
    else fetchContracts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetsCtrl.defaultApplied]);

  const handleSearch = (v: string) => {
    setSearchText(v);
    presetsCtrl.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchContracts({ ...currentFilters(), search: v || undefined, page: 1 });
    }, 400);
  };

  const handleVendorChange = (v?: string) => {
    setVendorFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchContracts({ ...currentFilters(), vendorId: v, page: 1 });
  };

  const handleHospitalChange = (v?: string) => {
    setHospitalFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchContracts({ ...currentFilters(), hospitalId: v, page: 1 });
  };

  const handleStatusChange = (v?: string) => {
    setStatusFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchContracts({ ...currentFilters(), status: v, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<Contract> | SorterResult<Contract>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nb = s?.order ? (s.field as string) : undefined;
    const no: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nb);
    setSortOrder(no);
    fetchContracts({
      ...currentFilters(),
      sortBy: nb,
      sortOrder: no,
      page: pag.current ?? 1,
      pageSize: pag.pageSize ?? 20,
    });
  };

  const applyPreset = (preset: FilterPreset) => {
    const f = preset.filters || {};
    setSearchText(f.search ?? '');
    setVendorFilter(f.vendorId ?? undefined);
    setHospitalFilter(f.hospitalId ?? undefined);
    setStatusFilter(f.status ?? undefined);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presetsCtrl.setActivePresetId(preset.id);
    fetchContracts({
      search: f.search,
      vendorId: f.vendorId,
      hospitalId: f.hospitalId,
      status: f.status,
      sortBy: f.sortBy,
      sortOrder: f.sortOrder,
      page: 1,
    });
  };

  const clearAllFilters = () => {
    setSearchText('');
    setVendorFilter(undefined);
    setHospitalFilter(undefined);
    setStatusFilter(undefined);
    setSortBy(undefined);
    setSortOrder(undefined);
    presetsCtrl.setActivePresetId(null);
    fetchContracts({ page: 1 });
  };

  // The Add Contract flow is now a dedicated wizard page (4-step wizard at
  // /contracts/new). The legacy modal helper is retained for back-compat but
  // the primary CTA in the page header routes to the wizard instead.
  const openWizard = () => navigate('/contracts/new');

  // (Legacy) Opens the Add Contract modal — kept for fallback during migration.
  const openAddContract = async () => {
    setAddContractOpen(true);
    setPartnerOptions([]);
    contractForm.resetFields();
    if (isHospital && userData?.hospitalId) {
      contractForm.setFieldsValue({ hospitalId: userData.hospitalId });
    } else if (isVendor && userData?.vendorId) {
      contractForm.setFieldsValue({ vendorId: userData.vendorId });
    }
    if ((isHospital && userData?.hospitalId) || (isVendor && userData?.vendorId)) {
      setPartnerOptionsLoading(true);
      try {
        const params: any = { approvalStatus: 'APPROVED', limit: 200 };
        if (isHospital) params.hospitalId = userData!.hospitalId;
        if (isVendor)   params.vendorId   = userData!.vendorId;
        const res = await get<any>('/hospital-vendors', params);
        const rows: any[] = res?.items ?? res?.hospitalVendors ?? (Array.isArray(res) ? res : []);
        if (isHospital) {
          setPartnerOptions(
            rows
              .map((hv: any) => ({
                value: hv.vendorId,
                label: hv.vendorName ?? hv.vendor?.name ?? hv.vendorId,
              }))
              .filter((o: any) => o.value),
          );
        } else {
          setPartnerOptions(
            rows
              .map((hv: any) => ({
                value: hv.hospitalId,
                label: hv.hospitalName ?? hv.hospital?.name ?? hv.hospitalId,
              }))
              .filter((o: any) => o.value),
          );
        }
      } catch {
        message.error('Failed to load contracted partners');
      } finally {
        setPartnerOptionsLoading(false);
      }
    }
  };

  const handleAddContract = async () => {
    try {
      const values = await contractForm.validateFields();
      setAddContractLoading(true);
      const payload: any = {
        name: values.name,
        vendorId: values.vendorId,
        hospitalId: values.hospitalId,
        startDate: values.dateRange?.[0]?.toISOString(),
        endDate: values.dateRange?.[1]?.toISOString(),
      };
      if (contractFileList.length > 0 && contractFileList[0].originFileObj) {
        try {
          const uploadRes = await uploadFile('/uploads', contractFileList[0].originFileObj);
          // Backend stores the file path in the `s3key` column
          payload.s3key = uploadRes.url;
        } catch {
          message.warning('Contract created but file upload failed.');
        }
      }
      await post('/contracts', payload);
      message.success('Contract added successfully.');
      setAddContractOpen(false);
      contractForm.resetFields();
      setContractFileList([]);
      fetchContracts(currentFilters());
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || 'Failed to add contract.');
    } finally {
      setAddContractLoading(false);
    }
  };

  // Downloads a contract file through the authenticated API proxy so the
  // access is recorded in file_access_log (Phase B audit trail).
  const downloadContractFile = async (fileUrl: string, fileName?: string) => {
    try {
      const apiHost =
        ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://curavend-api.metabilityllc1.workers.dev/api')
          .replace(/\/api$/, '');
      const { store: rootStore } = await import('../../../store/store');
      const authToken = rootStore.getState().auth.token;
      const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${apiHost}${fileUrl}`;
      const resp = await fetch(fullUrl, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!resp.ok) {
        message.error('Failed to download contract file');
        return;
      }
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || 'contract';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      message.error('Failed to download contract file');
    }
  };

  // Uploads a file for an existing contract from the details drawer.
  const saveDrawerFile = async () => {
    if (!selectedContract || !drawerFileList[0]) return;
    // RcFile extends File directly; originFileObj is set by Ant Design's
    // internal wrapper but may be absent when we store it manually.
    const rawFile = (drawerFileList[0].originFileObj ?? drawerFileList[0]) as unknown as File;
    if (!rawFile) return;
    setDrawerUploadLoading(true);
    try {
      const uploadRes = await uploadFile('/uploads', rawFile);
      // `s3key` is the DB column; the UI reads it back as `fileUrl` via the fetch mapping above.
      await put(`/contracts/${selectedContract.id}`, { s3key: uploadRes.url });
      message.success('Contract file uploaded');
      const updated = { ...selectedContract, fileUrl: uploadRes.url };
      setSelectedContract(updated);
      setDrawerFileList([]);
      fetchContracts(currentFilters());
    } catch {
      message.error('File upload failed');
    } finally {
      setDrawerUploadLoading(false);
    }
  };

  const sortedOrder = (field: string): 'ascend' | 'descend' | null =>
    sortBy === field ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null;

  const columnDefs: Record<ColumnKey, ColumnType<Contract>> = {
    name: {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      sortOrder: sortedOrder('name'),
      render: (name: string) => <Text strong>{name}</Text>,
    },
    vendor: {
      title: 'Vendor',
      dataIndex: 'vendor',
      key: 'vendor',
      render: (v: string) => v || '—',
    },
    hospital: {
      title: 'Hospital',
      dataIndex: 'hospital',
      key: 'hospital',
      render: (v: string) => v || '—',
    },
    status: {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (val: string) => (
        <Tag color={STATUS_COLORS[val] ?? 'default'} style={{ fontWeight: 600 }}>
          {val ?? 'DRAFT'}
        </Tag>
      ),
    },
    startDate: {
      title: 'Start Date',
      dataIndex: 'startDate',
      key: 'startDate',
      width: 120,
      sorter: true,
      sortOrder: sortedOrder('startDate'),
      render: (val: string) => (val ? dayjs(val).format('MM/DD/YYYY') : '—'),
    },
    endDate: {
      title: 'End Date',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 160,
      sorter: true,
      sortOrder: sortedOrder('endDate'),
      render: (val: string) => {
        const expired = isExpired(val);
        return (
          <Space>
            <span>{val ? dayjs(val).format('MM/DD/YYYY') : '—'}</span>
            {expired && (
              <Tooltip title="Contract expired">
                <Tag icon={<WarningOutlined />} color="error">
                  Expired
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    file: {
      title: 'File',
      key: 'file',
      width: 140,
      render: (_: any, record: Contract) => {
        if (record.fileUrl) {
          return (
            <Button
              type="link"
              size="small"
              icon={<FilePdfOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                downloadContractFile(record.fileUrl!, record.fileName);
              }}
            >
              {record.fileName || 'Download'}
            </Button>
          );
        }
        return <Text type="secondary">No file</Text>;
      },
    },
    actions: {
      title: '',
      key: 'actions',
      width: 70,
      render: (_: any, record: Contract) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/contracts/${record.id}`);
          }}
        >
          View
        </Button>
      ),
    },
  };

  const baseContractColumns: ColumnsType<Contract> = useMemo(
    () => cols.finalKeys.map((k) => columnDefs[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols.finalKeys, sortBy, sortOrder],
  );
  const { columns: contractColumns, components: contractTableComponents } = useResizableColumns(baseContractColumns as any[]);

  const baseFeeItemColumns: ColumnsType<FeeScheduleItem> = [
    { title: 'HCPC Code', dataIndex: 'hcpcCode', key: 'hcpcCode', width: 130 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      align: 'right',
      width: 120,
      render: (val: number) => (val != null ? `$${Number(val).toFixed(2)}` : '—'),
    },
  ];
  const { columns: feeItemColumns, components: feeItemTableComponents } = useResizableColumns(baseFeeItemColumns as any[]);

  const feeSchedulePanels = feeSchedules.map((schedule) => ({
    key: schedule.id,
    label: (
      <Row justify="space-between" style={{ width: '100%', paddingRight: 32 }}>
        <Col>
          <Space>
            <Text strong>{schedule.name}</Text>
          </Space>
        </Col>
        <Col>
          <Space>
            <Text type="secondary">Vendor:</Text>
            <Text>{schedule.vendor}</Text>
            <Text type="secondary" style={{ marginLeft: 16 }}>
              Created:
            </Text>
            <Text>
              {schedule.createdAt ? dayjs(schedule.createdAt).format('MM/DD/YYYY') : '—'}
            </Text>
          </Space>
        </Col>
      </Row>
    ),
    children: expandedScheduleLoading[schedule.id] ? (
      <Spin style={{ display: 'block', padding: 24 }} />
    ) : (
      <Table
        columns={feeItemColumns}
        components={feeItemTableComponents}
        dataSource={(expandedScheduleItems[schedule.id] || []).map((item) => ({
          ...item,
          key: item.id,
        }))}
        pagination={false}
        size="small"
        locale={{ emptyText: 'No items in this fee schedule.' }}
      />
    ),
  }));

  const contractsTab = (
    <>
      <FilterBar>
        <Input
          placeholder="Search contracts…"
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ width: 240 }}
          allowClear
          onClear={() => handleSearch('')}
        />
        <Select
          allowClear
          showSearch
          filterOption={false}
          placeholder="Vendor"
          style={{ width: 200 }}
          value={vendorFilter}
          onChange={handleVendorChange}
          onSearch={vendorDropdown.onSearch}
          onClear={vendorDropdown.reset}
          options={vendorDropdown.options}
          loading={vendorDropdown.loading}
          notFoundContent={vendorDropdown.loading ? <Spin size="small" /> : 'Type to search'}
        />
        <Select
          allowClear
          showSearch
          filterOption={false}
          placeholder="Hospital"
          style={{ width: 200 }}
          value={hospitalFilter}
          onChange={handleHospitalChange}
          onSearch={hospitalDropdown.onSearch}
          onClear={hospitalDropdown.reset}
          options={hospitalDropdown.options}
          loading={hospitalDropdown.loading}
          notFoundContent={hospitalDropdown.loading ? <Spin size="small" /> : 'Type to search'}
        />
        <Select
          allowClear
          placeholder="Status"
          style={{ width: 180 }}
          value={statusFilter}
          onChange={handleStatusChange}
          options={[
            { label: 'Draft', value: 'DRAFT' },
            { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
            { label: 'Approved', value: 'APPROVED' },
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Expired', value: 'EXPIRED' },
            { label: 'Terminated', value: 'TERMINATED' },
            { label: 'Rejected', value: 'REJECTED' },
            { label: 'Superseded', value: 'SUPERSEDED' },
          ]}
        />
        <FilterPresetsMenu
          controller={presetsCtrl}
          getCurrentFilters={() => currentFilters()}
          onApply={applyPreset}
          hint="Saves search, vendor, hospital, status, and sort."
        />
        <Tooltip title="Choose & reorder columns">
          <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>
            Columns
          </Button>
        </Tooltip>
        <Button type="text" onClick={clearAllFilters}>
          Clear filters
        </Button>
      </FilterBar>
      <div style={{ padding: '0 24px 16px' }}>
        <Table
          loading={contractsLoading}
          columns={contractColumns}
          components={contractTableComponents}
          dataSource={contracts.map((c) => ({ ...c, key: c.id }))}
          pagination={pagination}
          onChange={handleTableChange}
          size="middle"
          locale={{ emptyText: 'No contracts found.' }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => {
              navigate(`/contracts/${record.id}`);
            },
          })}
        />
      </div>
    </>
  );

  const tabItems = [
    {
      key: 'contracts',
      label: (
        <Space>
          <FileTextOutlined />
          Contracts
        </Space>
      ),
      children: contractsTab,
    },
    {
      key: 'feeSchedules',
      label: (
        <Space>
          <DollarOutlined />
          Fee Schedules
        </Space>
      ),
      children: (
        <div style={{ padding: '0 24px 16px' }}>
          <Spin spinning={feeSchedulesLoading}>
            {feeSchedules.length === 0 && !feeSchedulesLoading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#888' }}>
                No fee schedules found.
              </div>
            ) : (
              <Collapse
                accordion={false}
                items={feeSchedulePanels}
                onChange={(keys) => {
                  const key = Array.isArray(keys) ? keys[keys.length - 1] : keys;
                  if (key) fetchFeeScheduleItems(key as string);
                }}
              />
            )}
          </Spin>
        </div>
      ),
    },
  ];

  const activeContracts = contracts.filter((c) => !isExpired(c.endDate));
  const expiredContracts = contracts.filter((c) => isExpired(c.endDate));

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center">
            <FileTextOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div>
              <Title level={3} style={{ margin: 0 }}>
                Contract &amp; Pricing
              </Title>
              <Text type="secondary">Manage vendor contracts and fee schedules</Text>
            </div>
          </Space>
        </Col>
        <Col>
          <Space>
            {activeTab === 'contracts' && (
              <Tooltip title="Refresh">
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => fetchContracts(currentFilters())}
                />
              </Tooltip>
            )}
            {activeTab === 'contracts' && canCreateContract && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openWizard}
              >
                Add Contract
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value">{pagination.total ?? contracts.length}</div>
            <div className="stat-label">Total Contracts</div>
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value" style={{ color: '#52c41a' }}>
              {activeContracts.length}
            </div>
            <div className="stat-label">Active (page)</div>
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value" style={{ color: '#ff4d4f' }}>
              {expiredContracts.length}
            </div>
            <div className="stat-label">Expired (page)</div>
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value">{feeSchedules.length}</div>
            <div className="stat-label">Fee Schedules</div>
          </StatCard>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: '0 0 8px 0' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ padding: '0 24px' }}
          tabBarStyle={{ marginBottom: 16 }}
        />
      </Card>

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

      <Drawer
        title="Contract Details"
        open={contractDrawerOpen}
        onClose={() => {
          setContractDrawerOpen(false);
          setSelectedContract(null);
          setDrawerFileList([]);
        }}
        width={520}
      >
        {selectedContract && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Contract Name">
                <Text strong>{selectedContract.name || '—'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Vendor">
                {selectedContract.vendor || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Hospital">
                {selectedContract.hospital || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Start Date">
                {selectedContract.startDate
                  ? dayjs(selectedContract.startDate).format('MM/DD/YYYY')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="End Date">
                <Space>
                  {selectedContract.endDate
                    ? dayjs(selectedContract.endDate).format('MM/DD/YYYY')
                    : '—'}
                  {isExpired(selectedContract.endDate) ? (
                    <Tag color="error" icon={<WarningOutlined />}>
                      Expired
                    </Tag>
                  ) : (
                    <Tag color="success">Active</Tag>
                  )}
                </Space>
              </Descriptions.Item>
              {selectedContract.fileUrl && (
                <Descriptions.Item label="Contract File">
                  <Button
                    type="link"
                    icon={<FilePdfOutlined />}
                    onClick={() => downloadContractFile(selectedContract.fileUrl!, selectedContract.fileName)}
                    style={{ padding: 0 }}
                  >
                    {selectedContract.fileName || 'Download'}
                  </Button>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* File upload — attach or replace a contract PDF on an existing contract.
                Only shown to users who own the contract (mirrors backend assertContractAccess). */}
            {canEditContract(selectedContract) && (
              <>
                <Divider>Contract File</Divider>
                <Space direction="vertical" style={{ width: '100%' }}>
                  {!selectedContract.fileUrl && (
                    <Text type="secondary" style={{ fontSize: 12 }}>No file attached yet.</Text>
                  )}
                  <Upload
                    accept=".pdf,.doc,.docx"
                    fileList={drawerFileList}
                    beforeUpload={(file) => { setDrawerFileList([file as any]); return false; }}
                    onRemove={() => setDrawerFileList([])}
                    maxCount={1}
                  >
                    <Button icon={<UploadOutlined />}>
                      {selectedContract.fileUrl ? 'Replace File' : 'Attach File'}
                    </Button>
                  </Upload>
                  {drawerFileList.length > 0 && (
                    <Button type="primary" loading={drawerUploadLoading} onClick={saveDrawerFile}>
                      Save File
                    </Button>
                  )}
                </Space>
              </>
            )}

            <Divider>Associated Fee Schedules</Divider>
            {feeSchedules.filter((fs) => fs.vendorId === selectedContract.vendorId).length === 0 ? (
              <Text type="secondary">No fee schedules linked to this vendor.</Text>
            ) : (
              feeSchedules
                .filter((fs) => fs.vendorId === selectedContract.vendorId)
                .map((fs) => (
                  <Card key={fs.id} size="small" style={{ marginBottom: 8 }}>
                    <Text strong>{fs.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {fs.startDate} – {fs.endDate}
                    </Text>
                  </Card>
                ))
            )}
          </>
        )}
      </Drawer>

      <Modal
        title="Add Contract"
        open={addContractOpen}
        onOk={handleAddContract}
        onCancel={() => {
          setAddContractOpen(false);
          contractForm.resetFields();
          setContractFileList([]);
        }}
        okText="Add Contract"
        confirmLoading={addContractLoading}
        width={560}
        destroyOnClose
      >
        <Form form={contractForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="Contract Name"
            rules={[{ required: true, message: 'Please enter a contract name.' }]}
          >
            <Input placeholder="e.g., MedSupply Annual Agreement 2025" />
          </Form.Item>
          {/* Tenant fields — hospital and vendor inputs adapt by user type:
              - HOSPITAL caller: hospitalId is hidden + auto-bound; vendor picker shows their approved vendors
              - VENDOR caller:   vendorId is hidden + auto-bound; hospital picker shows their approved hospitals
              - ADMIN:            both fields are shown as free-text (existing behavior) */}
          {isAdmin ? (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="vendorId" label="Vendor ID" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="Vendor ID" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="hospitalId" label="Hospital ID" rules={[{ required: true, message: 'Required' }]}>
                  <Input placeholder="Hospital ID" />
                </Form.Item>
              </Col>
            </Row>
          ) : isHospital ? (
            <>
              <Form.Item name="hospitalId" hidden>
                <Input />
              </Form.Item>
              <Form.Item
                name="vendorId"
                label="Vendor"
                rules={[{ required: true, message: 'Please select a vendor.' }]}
                extra="Only your hospital's contracted vendors are listed."
              >
                <Select
                  placeholder={partnerOptionsLoading ? 'Loading vendors…' : 'Select a contracted vendor…'}
                  loading={partnerOptionsLoading}
                  showSearch
                  optionFilterProp="label"
                  notFoundContent={partnerOptionsLoading ? 'Loading…' : 'No approved vendors found'}
                  options={partnerOptions}
                />
              </Form.Item>
            </>
          ) : isVendor ? (
            <>
              <Form.Item name="vendorId" hidden>
                <Input />
              </Form.Item>
              <Form.Item
                name="hospitalId"
                label="Hospital"
                rules={[{ required: true, message: 'Please select a hospital.' }]}
                extra="Only hospitals you have an approved relationship with are listed."
              >
                <Select
                  placeholder={partnerOptionsLoading ? 'Loading hospitals…' : 'Select a contracted hospital…'}
                  loading={partnerOptionsLoading}
                  showSearch
                  optionFilterProp="label"
                  notFoundContent={partnerOptionsLoading ? 'Loading…' : 'No approved hospitals found'}
                  options={partnerOptions}
                />
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="dateRange"
            label="Contract Period"
            rules={[{ required: true, message: 'Please select start and end dates.' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="file" label="Contract File (optional)">
            <Upload
              accept=".pdf,.doc,.docx"
              fileList={contractFileList}
              beforeUpload={(file) => {
                setContractFileList([file as any]);
                return false;
              }}
              onRemove={() => setContractFileList([])}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Select File</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default ContractPricing;
