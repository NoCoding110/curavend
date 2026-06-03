import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
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
  Input,
  Select,
  message,
  Popconfirm,
  Alert,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  BankOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { get, post, put, del } from '../../../api/client';
import { usePermissions } from '../../../hooks/usePermissions';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { useAdminHospitalSelect } from '../../../hooks/useAdminHospitalSelect';
import { useListColumns, type ListColumnDef } from '../../../hooks/useListColumns';
import { useFilterPresets } from '../../../hooks/useFilterPresets';
import { ColumnCustomizerDrawer } from '../../../components/list/ColumnCustomizerDrawer';
import { FilterPresetsMenu } from '../../../components/list/FilterPresetsMenu';
import type { FilterPreset } from '../../../api/filterPresets';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;
const FilterBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

interface Facility {
  id: string;
  hospitalId: string;
  name: string;
  number: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  status: string;
  createdAt?: string;
}

type ColumnKey =
  | 'name'
  | 'number'
  | 'address'
  | 'city'
  | 'state'
  | 'phone'
  | 'status'
  | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'Number' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = ['name', 'number', 'address', 'phone', 'status', 'actions'];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const HospitalFacilities: React.FC = () => {
  const { can } = usePermissions();
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  // ── Filters ─────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Columns / presets ───────────────────────────────────
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_facilities_columns_v1',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const presets = useFilterPresets('facilities');

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '25', '50'],
    showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
  });

  // ── Fetch ────────────────────────────────────────────────
  interface FetchParams {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    state?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  const fetchFacilities = useCallback(async (p: FetchParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? (pagination.pageSize as number);
      const query: Record<string, any> = { limit: pageSize, offset: (page - 1) * pageSize };
      if (p.search) query.search = p.search;
      if (p.sortBy) { query.sortBy = p.sortBy; query.sortOrder = p.sortOrder ?? 'asc'; }

      if (isAdmin && adminHospital.selectedId) {
        query.hospitalId = adminHospital.selectedId;
      } else if (isAdmin && !adminHospital.selectedId) {
        // No hospital selected yet — don't fetch
        setLoading(false);
        return;
      }

      const data = await get<any>('/hospital-facilities', query);
      let items: Facility[] = Array.isArray(data) ? data : (data?.items ?? []);
      // Apply status/state client-side since backend doesn't filter them
      if (p.status) items = items.filter((f) => f.status === p.status);
      if (p.state) items = items.filter((f) => (f.state || '').toUpperCase() === p.state!.toUpperCase());
      const total: number = data?.total ?? items.length;

      setFacilities(items);
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load facilities.');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize]);

  // Apply default preset on mount
  useEffect(() => {
    (async () => {
      await presets.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!presets.defaultApplied) return;
    const def = presets.presets.find((p) => p.isDefault);
    if (def && !presets.activePresetId) {
      applyPreset(def);
    } else {
      fetchFacilities({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets.defaultApplied]);

  useEffect(() => {
    if (isAdmin) {
      if (adminHospital.selectedId) fetchFacilities({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminHospital.selectedId]);

  // ── Handlers ────────────────────────────────────────────
  const currentFilters = () => ({
    search: searchText || undefined,
    status: statusFilter,
    state: stateFilter,
    sortBy,
    sortOrder,
  });

  const handleSearch = (value: string) => {
    setSearchText(value);
    presets.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchFacilities({ ...currentFilters(), search: value || undefined, page: 1 });
    }, 400);
  };

  const handleStatusChange = (v: string | undefined) => {
    setStatusFilter(v);
    presets.setActivePresetId(null);
    fetchFacilities({ ...currentFilters(), status: v, page: 1 });
  };

  const handleStateChange = (v: string | undefined) => {
    setStateFilter(v);
    presets.setActivePresetId(null);
    fetchFacilities({ ...currentFilters(), state: v, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<Facility> | SorterResult<Facility>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextSortBy = s?.order ? (s.field as string) : undefined;
    const nextSortOrder: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    fetchFacilities({
      ...currentFilters(),
      sortBy: nextSortBy,
      sortOrder: nextSortOrder,
      page: pag.current ?? 1,
      pageSize: pag.pageSize ?? 10,
    });
  };

  const clearAllFilters = () => {
    setSearchText('');
    setStatusFilter(undefined);
    setStateFilter(undefined);
    setSortBy(undefined);
    setSortOrder(undefined);
    presets.setActivePresetId(null);
    fetchFacilities({ page: 1 });
  };

  const applyPreset = (preset: FilterPreset) => {
    const f = preset.filters || {};
    setSearchText(f.search ?? '');
    setStatusFilter(f.status ?? undefined);
    setStateFilter(f.state ?? undefined);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presets.setActivePresetId(preset.id);
    fetchFacilities({
      search: f.search,
      status: f.status,
      state: f.state,
      sortBy: f.sortBy,
      sortOrder: f.sortOrder,
      page: 1,
    });
  };

  // ── CRUD ────────────────────────────────────────────────
  const openAdd = () => { setEditingId(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (record: Facility) => { setEditingId(record.id); form.setFieldsValue(record); setModalOpen(true); };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      if (editingId) {
        await put(`/hospital-facilities/${editingId}`, values);
        message.success('Facility updated.');
      } else {
        await post('/hospital-facilities', values);
        message.success('Facility added.');
      }
      setModalOpen(false);
      form.resetFields();
      fetchFacilities(currentFilters());
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.message || 'Failed to save facility.');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await del(`/hospital-facilities/${id}`);
      message.success('Facility deactivated.');
      fetchFacilities(currentFilters());
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to deactivate facility.');
    }
  };

  // ── Columns ────────────────────────────────────────────
  const columnDefs: Record<ColumnKey, ColumnType<Facility>> = {
    name: { title: 'Name', dataIndex: 'name', key: 'name', sorter: true, sortOrder: sortBy === 'name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null },
    number: { title: 'Number', dataIndex: 'number', key: 'number', sorter: true, sortOrder: sortBy === 'number' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    address: {
      title: 'Address',
      key: 'address',
      render: (_, r) => [r.streetAddress, r.city, r.state, r.zip].filter(Boolean).join(', ') || '—',
    },
    city: { title: 'City', dataIndex: 'city', key: 'city', sorter: true, sortOrder: sortBy === 'city' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    state: { title: 'State', dataIndex: 'state', key: 'state', sorter: true, sortOrder: sortBy === 'state' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    phone: { title: 'Phone', dataIndex: 'phone', key: 'phone', render: (v) => v || '—' },
    status: {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      sortOrder: sortBy === 'status' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v}</Tag>,
    },
    actions: {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          {can('facilities', 'WRITE') && (
            <Button type="link" icon={<EditOutlined />} size="small" onClick={() => openEdit(record)}>Edit</Button>
          )}
          {can('facilities', 'FULL') && (
            <Popconfirm title="Deactivate facility?" okText="Yes" okButtonProps={{ danger: true }} cancelText="No" onConfirm={() => handleDelete(record.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small">Remove</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  };

  const baseColumns: ColumnsType<Facility> = useMemo(
    () => cols.finalKeys.map((k) => columnDefs[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols.finalKeys, sortBy, sortOrder, can],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <BankOutlined style={{ fontSize: 24 }} />
            <Title level={3} style={{ margin: 0 }}>Facilities</Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => fetchFacilities(currentFilters())} />
            </Tooltip>
            {can('facilities', 'WRITE') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Facility</Button>
            )}
          </Space>
        </Col>
      </Row>

      {error && (
        <Alert message={error} type="error" showIcon closable style={{ marginBottom: 16 }} onClose={() => setError(null)} />
      )}

      <Card>
        <FilterBar>
          {isAdmin && (
            <Select
              placeholder="Select hospital…"
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 220, flexShrink: 0 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          )}
          <Input
            placeholder="Search facilities…"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 240 }}
            allowClear
            onClear={() => handleSearch('')}
          />
          <Select
            placeholder="Status"
            value={statusFilter}
            onChange={handleStatusChange}
            allowClear
            style={{ width: 140 }}
            options={STATUS_OPTIONS}
          />
          <Input
            placeholder="State (e.g. CA)"
            value={stateFilter ?? ''}
            onChange={(e) => setStateFilter(e.target.value || undefined)}
            onPressEnter={() => handleStateChange(stateFilter)}
            onBlur={() => handleStateChange(stateFilter)}
            style={{ width: 120 }}
            maxLength={2}
            allowClear
          />
          <FilterPresetsMenu
            controller={presets}
            getCurrentFilters={() => currentFilters()}
            onApply={applyPreset}
            hint="Saves search, status, state, and sort."
          />
          <Tooltip title="Choose & reorder columns">
            <Button icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>Columns</Button>
          </Tooltip>
          <Button type="text" onClick={clearAllFilters}>Clear filters</Button>
        </FilterBar>

        <Table<Facility>
          columns={columns}
          components={tableComponents}
          dataSource={facilities}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          size="middle"
          locale={{ emptyText: 'No facilities found.' }}
        />
      </Card>

      <ColumnCustomizerDrawer<ColumnKey>
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        allColumns={ALL_COLUMNS}
        visibleKeys={cols.visibleKeys}
        orderedKeys={cols.orderedKeys}
        onToggle={cols.toggle}
        onOrderChange={cols.setOrder}
        onReset={cols.resetDefaults}
        onShowAll={cols.showAll}
      />

      <Modal
        title={editingId ? 'Edit Facility' : 'Add Facility'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText={editingId ? 'Save' : 'Add'}
        confirmLoading={modalLoading}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Facility Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Main Campus" />
          </Form.Item>
          <Form.Item name="number" label="Facility Code / Number">
            <Input placeholder="e.g. FAC-001" />
          </Form.Item>
          <Form.Item name="streetAddress" label="Street Address">
            <Input placeholder="123 Main St" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item name="city" label="City"><Input /></Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="state" label="State"><Input maxLength={2} /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="zip" label="ZIP"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="phone" label="Phone"><Input placeholder="(555) 000-0000" /></Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default HospitalFacilities;
