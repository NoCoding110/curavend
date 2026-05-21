import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Alert,
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Table,
  Tag,
  Modal,
  Form,
  Select,
  message,
  Popconfirm,
  Spin,
  InputNumber,
  Drawer,
  Descriptions,
  Divider,
  Input,
  Tooltip,
} from 'antd';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import {
  PlusOutlined,
  TeamOutlined,
  DeleteOutlined,
  EyeOutlined,
  SearchOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { useSelector } from 'react-redux';
import { get, post, del } from '../../../api/client';
import type { RootState } from '../../../store/store';
import { useListColumns, type ListColumnDef } from '../../../hooks/useListColumns';
import { useFilterPresets } from '../../../hooks/useFilterPresets';
import { useAsyncDropdown } from '../../../hooks/useAsyncDropdown';
import { ColumnCustomizerDrawer } from '../../../components/list/ColumnCustomizerDrawer';
import { FilterPresetsMenu } from '../../../components/list/FilterPresetsMenu';
import type { FilterPreset } from '../../../api/filterPresets';
import { useResizableColumns } from '../../../components/table/useResizableColumns';
import VendorLocationsList, {
  type VendorLocationItem,
} from '../../vendors/components/VendorLocationsList';

const { Title } = Typography;
const { Option } = Select;

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

interface HospitalVendorRelationship {
  id: string;
  hospitalId: string;
  hospitalName: string;
  vendorId: string;
  vendorName: string;
  facilityId?: string | null;
  facilityName?: string | null;
  priority?: number | null;
  itemCategories?: string[] | null;
  contractRate: number | string;
  status: string;
  createdAt: string;
}

interface Hospital { id: string; name: string; }
interface Vendor { id: string; name: string; }
interface Facility {
  id: string;
  name: string;
  hospitalId: string;
  state?: string | null;
  zip?: string | null;
}

const ITEM_CATEGORY_OPTIONS = [
  { value: 'WOUND_CARE', label: 'Wound Care' },
  { value: 'ORTHOTICS', label: 'Orthotics' },
  { value: 'PROSTHETICS', label: 'Prosthetics' },
  { value: 'DME', label: 'DME' },
  { value: 'BIOLOGICS', label: 'Biologics' },
  { value: 'IMPLANTS', label: 'Implants' },
  { value: 'CONSUMABLES', label: 'Consumables' },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green', active: 'green', Active: 'green',
  INACTIVE: 'default', inactive: 'default', Inactive: 'default',
  PENDING: 'orange', pending: 'orange', Pending: 'orange',
};

const STATUS_OPTIONS = [
  { label: 'Active', value: 'Active' },
  { label: 'Inactive', value: 'Inactive' },
  { label: 'Pending', value: 'Pending' },
];

type ColumnKey =
  | 'hospitalName'
  | 'vendorName'
  | 'facilityName'
  | 'itemCategories'
  | 'priority'
  | 'contractRate'
  | 'status'
  | 'createdAt'
  | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'hospitalName', label: 'Hospital' },
  { key: 'vendorName', label: 'Vendor' },
  { key: 'facilityName', label: 'Facility' },
  { key: 'itemCategories', label: 'Item Categories' },
  { key: 'priority', label: 'Priority' },
  { key: 'contractRate', label: 'Contract Rate' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Date Added' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = [
  'hospitalName',
  'vendorName',
  'facilityName',
  'itemCategories',
  'priority',
  'contractRate',
  'status',
  'createdAt',
  'actions',
];

const ENTITY = 'hospital-vendors';

interface FetchParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  vendorId?: string;
  hospitalId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const HospitalVendors: React.FC = () => {
  const userData = useSelector((state: RootState) => state.auth.userData);
  const userType = (userData?.userType || '').toLowerCase();
  const isAdmin = userType === 'admin';
  const isVendor = userType === 'vendor';
  const isHospital = userType === 'hospital';

  const [relationships, setRelationships] = useState<HospitalVendorRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1, pageSize: 20, total: 0,
    showSizeChanger: true, pageSizeOptions: ['10', '20', '50'],
    showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
  });

  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Columns & presets
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_hospital_vendors_columns_v2',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const presetsCtrl = useFilterPresets(ENTITY);

  // Add modal
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();

  // Vendor detail drawer
  const [vendorDrawerOpen, setVendorDrawerOpen] = useState(false);
  const [vendorDetail, setVendorDetail] = useState<any>(null);
  const [vendorDetailLoading, setVendorDetailLoading] = useState(false);
  const [vendorLocationsList, setVendorLocationsList] = useState<VendorLocationItem[]>([]);
  const [vendorLocationsLoading, setVendorLocationsLoading] = useState(false);
  const [drawerFacilityState, setDrawerFacilityState] = useState<string | null>(null);

  // Add-modal auto-validation (coverage feedback)
  const watchedVendorId = Form.useWatch('vendorId', addForm);
  const watchedFacilityId = Form.useWatch('facilityId', addForm);
  const watchedCategories = Form.useWatch('itemCategories', addForm);
  const [coverageInfo, setCoverageInfo] = useState<any | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const fetchRelationships = useCallback(async (p: FetchParams = {}) => {
    setLoading(true);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? (pagination.pageSize as number) ?? 20;
      const query: Record<string, any> = { limit: pageSize, offset: (page - 1) * pageSize };
      if (p.search) query.search = p.search;
      if (p.status) query.status = p.status;
      if (p.vendorId) query.vendorId = p.vendorId;
      if (p.hospitalId) query.hospitalId = p.hospitalId;
      if (p.sortBy) { query.sortBy = p.sortBy; query.sortOrder = p.sortOrder ?? 'asc'; }

      const data = await get<any>('/hospital-vendors', query);
      const items: HospitalVendorRelationship[] = data?.items ?? (Array.isArray(data) ? data : []);
      const total = data?.total ?? items.length;
      setRelationships(items);
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load hospital-vendor relationships.');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize]);

  const currentFilters = (): FetchParams => ({
    search: searchText || undefined,
    status: statusFilter,
    sortBy,
    sortOrder,
  });

  useEffect(() => {
    if (!presetsCtrl.defaultApplied) return;
    const def = presetsCtrl.presets.find((p) => p.isDefault);
    if (def && !presetsCtrl.activePresetId) applyPreset(def);
    else fetchRelationships({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetsCtrl.defaultApplied]);

  const handleSearch = (v: string) => {
    setSearchText(v);
    presetsCtrl.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchRelationships({ ...currentFilters(), search: v || undefined, page: 1 });
    }, 400);
  };

  const handleStatusChange = (v?: string) => {
    setStatusFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchRelationships({ ...currentFilters(), status: v, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<HospitalVendorRelationship> | SorterResult<HospitalVendorRelationship>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nb = s?.order ? (s.field as string) : undefined;
    const no: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nb);
    setSortOrder(no);
    fetchRelationships({
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
    setStatusFilter(f.status ?? undefined);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presetsCtrl.setActivePresetId(preset.id);
    fetchRelationships({
      search: f.search, status: f.status,
      sortBy: f.sortBy, sortOrder: f.sortOrder, page: 1,
    });
  };

  const clearAllFilters = () => {
    setSearchText('');
    setStatusFilter(undefined);
    setSortBy(undefined);
    setSortOrder(undefined);
    presetsCtrl.setActivePresetId(null);
    fetchRelationships({ page: 1 });
  };

  const fetchSelectOptions = useCallback(async () => {
    setFormLoading(true);
    try {
      const [h, v] = await Promise.all([get<any>('/hospitals'), get<any>('/vendors')]);
      setHospitals(Array.isArray(h) ? h : (h?.items ?? []));
      setVendors(Array.isArray(v) ? v : (v?.items ?? []));
    } catch { /* non-critical */ } finally {
      setFormLoading(false);
    }
  }, []);

  const fetchFacilitiesForHospital = useCallback(async (hospitalId?: string) => {
    if (!hospitalId) {
      setFacilities([]);
      return;
    }
    setFacilitiesLoading(true);
    try {
      const data = await get<any>('/hospital-facilities', { hospitalId });
      const items: Facility[] = Array.isArray(data) ? data : (data?.items ?? []);
      setFacilities(items);
    } catch {
      setFacilities([]);
    } finally {
      setFacilitiesLoading(false);
    }
  }, []);

  const openAddModal = async () => {
    setAddModalOpen(true);
    await fetchSelectOptions();
    // Hospital users: auto-scope and pre-fetch their facilities
    if (isHospital && userData?.hospitalId) {
      fetchFacilitiesForHospital(userData.hospitalId);
    }
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      setModalLoading(true);
      const hospitalId = isHospital ? userData?.hospitalId : values.hospitalId;
      const vendorId = isVendor ? userData?.vendorId : values.vendorId;
      await post('/hospital-vendors', {
        hospitalId,
        vendorId,
        contractRate: values.contractRate,
        facilityId: values.facilityId || null,
        priority: typeof values.priority === 'number' ? values.priority : 100,
        itemCategories:
          Array.isArray(values.itemCategories) && values.itemCategories.length > 0
            ? values.itemCategories
            : null,
        providerId: userData?.providerId ?? userData?.id ?? '',
      });
      message.success('Relationship added successfully.');
      setAddModalOpen(false);
      addForm.resetFields();
      fetchRelationships(currentFilters());
    } catch (err: any) {
      if (err?.response) message.error(err?.response?.data?.message || 'Failed to add relationship.');
    } finally {
      setModalLoading(false);
    }
  };

  const openVendorDrawer = async (vendorId: string, facilityId?: string | null) => {
    setVendorDrawerOpen(true);
    setVendorDetail(null);
    setVendorDetailLoading(true);
    setVendorLocationsList([]);
    setDrawerFacilityState(null);

    // Fire vendor + locations + (optional) facility lookups in parallel.
    const tasks: Promise<any>[] = [
      get<any>(`/vendors/${vendorId}`).catch(() => null),
      (async () => {
        setVendorLocationsLoading(true);
        try {
          const data = await get<any>('/vendor-locations', {
            vendorId,
            isActive: 1,
          });
          return Array.isArray(data) ? data : (data?.items ?? []);
        } catch {
          return [];
        } finally {
          setVendorLocationsLoading(false);
        }
      })(),
    ];
    if (facilityId) {
      tasks.push(get<any>(`/hospital-facilities/${facilityId}`).catch(() => null));
    }

    try {
      const [vendorData, locations, facilityData] = await Promise.all(tasks);
      setVendorDetail(vendorData?.vendor ?? vendorData);
      setVendorLocationsList(locations || []);
      if (facilityData) {
        const f = facilityData?.facility ?? facilityData;
        setDrawerFacilityState(f?.state || null);
      }
    } catch {
      message.error('Failed to load vendor details.');
      setVendorDrawerOpen(false);
    } finally {
      setVendorDetailLoading(false);
    }
  };

  // ---- Add-modal coverage auto-validation ----
  // When both vendor + facility are picked, fetch /vendor-coverage so the user
  // sees a green/yellow info bar before submitting.
  useEffect(() => {
    if (!addModalOpen) return;
    const vId = watchedVendorId;
    const fId = watchedFacilityId;
    // Hospital users implicitly hold their own hospitalId so vendor selection
    // alone is enough to start querying coverage even before facility is set.
    if (!vId || !fId) {
      setCoverageInfo(null);
      return;
    }
    let cancelled = false;
    setCoverageLoading(true);
    setCoverageInfo(null);
    (async () => {
      try {
        const data = await get<any>('/vendor-coverage', {
          facilityId: fId,
          vendorId: vId,
        });
        if (cancelled) return;
        const entry = Array.isArray(data) ? data[0] : null;
        setCoverageInfo(entry || null);
      } catch {
        if (!cancelled) setCoverageInfo(null);
      } finally {
        if (!cancelled) setCoverageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addModalOpen, watchedVendorId, watchedFacilityId]);

  const facilityForWatch = useMemo(
    () => facilities.find((f) => f.id === watchedFacilityId) || null,
    [facilities, watchedFacilityId],
  );
  const facilityStateForWatch = (facilityForWatch as any)?.state || null;

  const handleRemove = async (id: string) => {
    try {
      await del(`/hospital-vendors/${id}`);
      message.success('Relationship removed successfully.');
      setRelationships((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to remove relationship.');
    }
  };

  const sortedOrder = (field: string): 'ascend' | 'descend' | null =>
    sortBy === field ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null;

  const columnDefs: Record<ColumnKey, ColumnType<HospitalVendorRelationship>> = {
    hospitalName: {
      title: 'Hospital',
      dataIndex: 'hospitalName',
      key: 'hospitalName',
      sorter: true,
      sortOrder: sortedOrder('hospitalName'),
      render: (v: string) => v || '—',
    },
    vendorName: {
      title: 'Vendor',
      dataIndex: 'vendorName',
      key: 'vendorName',
      sorter: true,
      sortOrder: sortedOrder('vendorName'),
      render: (v: string) => v || '—',
    },
    facilityName: {
      title: 'Facility',
      dataIndex: 'facilityName',
      key: 'facilityName',
      render: (v: string | null) =>
        v ? <Tag color="blue">{v}</Tag> : <Tag>All facilities</Tag>,
    },
    itemCategories: {
      title: 'Item Categories',
      dataIndex: 'itemCategories',
      key: 'itemCategories',
      render: (v: string[] | null) => {
        if (!Array.isArray(v) || v.length === 0) return <Tag>All items</Tag>;
        return (
          <Space wrap size={4}>
            {v.slice(0, 3).map((c) => (
              <Tag key={c} color="purple">{c.replace('_', ' ')}</Tag>
            ))}
            {v.length > 3 && <Tag>+{v.length - 3}</Tag>}
          </Space>
        );
      },
    },
    priority: {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      sorter: true,
      sortOrder: sortedOrder('priority'),
      render: (v: number | null) => (v == null ? 100 : v),
    },
    contractRate: {
      title: 'Contract Rate',
      dataIndex: 'contractRate',
      key: 'contractRate',
      sorter: true,
      sortOrder: sortedOrder('contractRate'),
      render: (rate: number | string) =>
        rate != null ? (typeof rate === 'number' ? `${rate}%` : rate) : '—',
    },
    status: {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      sortOrder: sortedOrder('status'),
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status] || 'default'}>{status || 'Unknown'}</Tag>
      ),
    },
    createdAt: {
      title: 'Date Added',
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: true,
      sortOrder: sortedOrder('createdAt'),
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
    },
    actions: {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_: unknown, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            size="small"
            onClick={(e) => { e.stopPropagation(); openVendorDrawer(record.vendorId, record.facilityId); }}
          >
            View
          </Button>
          <Popconfirm
            title="Remove relationship"
            description="Are you sure you want to remove this hospital-vendor relationship?"
            okText="Remove"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => handleRemove(record.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small"
              onClick={(e) => e.stopPropagation()}>
              Remove
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  };

  // Hide columns that don't make sense for the current user type
  const hiddenKeys = useMemo<ColumnKey[]>(() => {
    const hidden: ColumnKey[] = [];
    if (isHospital) hidden.push('hospitalName');
    if (isVendor) hidden.push('vendorName');
    return hidden;
  }, [isHospital, isVendor]);

  const baseColumns: ColumnsType<HospitalVendorRelationship> = useMemo(
    () => cols.finalKeys
      .filter((k) => !hiddenKeys.includes(k))
      .map((k) => columnDefs[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols.finalKeys, hiddenKeys, sortBy, sortOrder],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <TeamOutlined style={{ fontSize: 24 }} />
            <Title level={3} style={{ margin: 0 }}>Hospital Vendors</Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => fetchRelationships(currentFilters())} />
            </Tooltip>
            <Tooltip title="Choose & reorder columns">
              <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>
                Columns
              </Button>
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
              Add Relationship
            </Button>
          </Space>
        </Col>
      </Row>

      <Card>
        <FilterBar>
          <Input
            placeholder="Search vendor or hospital…"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 260 }}
            allowClear
            onClear={() => handleSearch('')}
          />

          <Select
            allowClear
            placeholder="Status"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={handleStatusChange}
            options={STATUS_OPTIONS}
          />

          <FilterPresetsMenu
            controller={presetsCtrl}
            getCurrentFilters={() => currentFilters()}
            onApply={applyPreset}
            hint="Saves search, status, and sort."
          />
          <Button type="text" onClick={clearAllFilters}>Clear filters</Button>
        </FilterBar>

        <Table
          columns={columns}
          components={tableComponents}
          dataSource={relationships}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          size="middle"
          locale={{ emptyText: 'No hospital-vendor relationships found.' }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => openVendorDrawer(record.vendorId, record.facilityId),
          })}
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
        hiddenKeys={hiddenKeys}
      />

      {/* Add Relationship Modal */}
      <Modal
        title="Add Hospital-Vendor Relationship"
        open={addModalOpen}
        onOk={handleAdd}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        okText="Add Relationship"
        confirmLoading={modalLoading}
        width={520}
      >
        {formLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="Loading options..." />
          </div>
        ) : (
          <Form form={addForm} layout="vertical" style={{ marginTop: 16 }} initialValues={{ priority: 100 }}>
            {!isHospital && (
              <Form.Item name="hospitalId" label="Hospital" rules={[{ required: true }]}>
                <Select placeholder="Select hospital" showSearch optionFilterProp="children"
                  filterOption={(input, option) =>
                    String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={(v) => {
                    addForm.setFieldValue('facilityId', undefined);
                    fetchFacilitiesForHospital(v);
                  }}>
                  {hospitals.map((h) => <Option key={h.id} value={h.id}>{h.name}</Option>)}
                </Select>
              </Form.Item>
            )}
            {!isVendor && (
              <Form.Item name="vendorId" label="Vendor" rules={[{ required: true }]}>
                <Select placeholder="Select vendor" showSearch optionFilterProp="children"
                  filterOption={(input, option) =>
                    String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }>
                  {vendors.map((v) => <Option key={v.id} value={v.id}>{v.name}</Option>)}
                </Select>
              </Form.Item>
            )}
            <Form.Item
              name="facilityId"
              label="Facility (optional)"
              tooltip="Scope this preference to a specific facility. Leave empty to apply hospital-wide."
              extra={
                !facilitiesLoading && facilities.length === 0 && (isHospital || addForm.getFieldValue('hospitalId'))
                  ? <span style={{ fontSize: 12, color: '#888' }}>No facilities found — <a href="/hospital-facilities" target="_blank" rel="noreferrer">add facilities first</a> or leave blank for hospital-wide.</span>
                  : !isHospital && !addForm.getFieldValue('hospitalId')
                    ? <span style={{ fontSize: 12, color: '#888' }}>Select a hospital above to load its facilities.</span>
                    : undefined
              }
            >
              <Select
                placeholder={facilitiesLoading ? 'Loading facilities…' : 'All facilities (hospital-wide)'}
                allowClear
                loading={facilitiesLoading}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {facilities.map((f) => (
                  <Option key={f.id} value={f.id}>{f.name}</Option>
                ))}
              </Select>
            </Form.Item>
            {/* Coverage auto-validation bar */}
            {(watchedVendorId && watchedFacilityId) && (
              <div style={{ marginBottom: 12 }}>
                {coverageLoading ? (
                  <Alert type="info" showIcon message="Checking vendor branch coverage…" />
                ) : coverageInfo ? (
                  (() => {
                    const summary = coverageInfo.summary || {};
                    const stateLabel =
                      facilityStateForWatch ||
                      (facilityForWatch as any)?.state ||
                      'this facility';
                    const servingLocs = (coverageInfo.locations || []).filter(
                      (l: any) => l.servesFacility,
                    );
                    if (summary.branchesServing > 0) {
                      const branchNames = servingLocs.map((l: any) => l.name).join(', ');
                      const matchedCats: string[] = (watchedCategories || []).filter(
                        (cat: string) =>
                          (summary.capabilityUnion || []).some((c: string) =>
                            c.toUpperCase() === cat.toUpperCase()
                              || c.replace('_', ' ').toUpperCase() === cat.replace('_', ' ').toUpperCase(),
                          ),
                      );
                      return (
                        <Alert
                          type="success"
                          showIcon
                          message={`${summary.branchesServing} branch${summary.branchesServing > 1 ? 'es' : ''} of ${vendors.find((v) => v.id === watchedVendorId)?.name ?? 'this vendor'} serve ${stateLabel}: ${branchNames}`}
                          description={
                            (watchedCategories && watchedCategories.length > 0)
                              ? matchedCats.length === watchedCategories.length
                                ? null
                                : matchedCats.length > 0
                                  ? `Some selected categories may not be supported (matched: ${matchedCats.join(', ') || 'none'}).`
                                  : `None of the selected categories overlap with branch capabilities (${(summary.capabilityUnion || []).join(', ') || 'none'}).`
                              : null
                          }
                        />
                      );
                    }
                    return (
                      <Alert
                        type="warning"
                        showIcon
                        message={`No branch of ${vendors.find((v) => v.id === watchedVendorId)?.name ?? 'this vendor'} currently serves ${stateLabel}.`}
                        description="STAT/CUSTOM_FIT orders to this facility may not auto-route. You can still link the vendor — orders will fail over to escalation."
                      />
                    );
                  })()
                ) : null}
              </div>
            )}

            <Form.Item
              name="itemCategories"
              label="Item categories (optional)"
              tooltip="Restrict this preference to specific item categories. Leave empty to apply to all items."
            >
              <Select
                mode="multiple"
                allowClear
                placeholder="All item categories"
                options={ITEM_CATEGORY_OPTIONS}
              />
            </Form.Item>
            <Form.Item
              name="priority"
              label="Priority"
              tooltip="Lower number = higher preference. Facility + category rules override hospital-wide."
            >
              <InputNumber min={1} max={999} style={{ width: '100%' }} placeholder="100" />
            </Form.Item>
            <Form.Item name="contractRate" label="Contract Rate (%)" rules={[{ required: true }]}>
              <InputNumber min={0} max={100} step={0.1} precision={2}
                style={{ width: '100%' }} placeholder="e.g., 85.5" addonAfter="%" />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Vendor Detail Drawer */}
      <Drawer
        title={vendorDetail?.name || 'Vendor Details'}
        open={vendorDrawerOpen}
        onClose={() => setVendorDrawerOpen(false)}
        width={480}
      >
        {vendorDetailLoading ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <Spin tip="Loading vendor details..." />
          </div>
        ) : vendorDetail ? (
          <Descriptions column={1} bordered size="small" labelStyle={{ width: 140 }}>
            <Descriptions.Item label="Vendor Name">{vendorDetail.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{vendorDetail.email || vendorDetail.billingEmail || '—'}</Descriptions.Item>
            <Descriptions.Item label="Phone">{vendorDetail.contact || vendorDetail.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Address">
              {[vendorDetail.streetAddress, vendorDetail.city, vendorDetail.state, vendorDetail.zip]
                .filter(Boolean).join(', ') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="EIN">{vendorDetail.ein || '—'}</Descriptions.Item>
            <Descriptions.Item label="Website">{vendorDetail.website || '—'}</Descriptions.Item>
            <Descriptions.Item label="Accreditation">{vendorDetail.accreditingBody || vendorDetail.accreditationNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="State License">{vendorDetail.stateLevelLicenseNumber || vendorDetail.stateLicenseNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Active Orders">
              <Tag color="blue">{vendorDetail.inProcessOrders ?? 0}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Completed Orders">
              <Tag color="green">{vendorDetail.completedOrders ?? 0}</Tag>
            </Descriptions.Item>
          </Descriptions>
        ) : null}

        {vendorDetail && (
          <>
            <Divider orientation="left" style={{ marginTop: 24 }}>
              Vendor Locations
              {drawerFacilityState ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontWeight: 'normal', fontSize: 13 }}>
                  · evaluated for {drawerFacilityState}
                </Typography.Text>
              ) : null}
            </Divider>
            {vendorLocationsLoading ? (
              <div style={{ textAlign: 'center', padding: 16 }}>
                <Spin tip="Loading locations…" />
              </div>
            ) : (
              <VendorLocationsList
                locations={vendorLocationsList}
                facilityState={drawerFacilityState}
                emptyText="This vendor has no active locations."
              />
            )}
          </>
        )}
      </Drawer>
    </PageWrapper>
  );
};

export default HospitalVendors;
