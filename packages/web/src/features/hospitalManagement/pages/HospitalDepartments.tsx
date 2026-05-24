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
  Spin,
} from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
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
import { useListColumns, type ListColumnDef } from '../../../hooks/useListColumns';
import { useFilterPresets } from '../../../hooks/useFilterPresets';
import { useAsyncDropdown } from '../../../hooks/useAsyncDropdown';
import { ColumnCustomizerDrawer } from '../../../components/list/ColumnCustomizerDrawer';
import { FilterPresetsMenu } from '../../../components/list/FilterPresetsMenu';
import type { FilterPreset } from '../../../api/filterPresets';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const { Option } = Select;

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

interface Department {
  id: string;
  hospitalId: string;
  facilityId: string | null;
  facilityName: string | null;
  name: string;
  number: string | null;
  status: string;
}

interface Facility {
  id: string;
  name: string;
  number: string | null;
}

type ColumnKey = 'name' | 'number' | 'facilityName' | 'status' | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'Number' },
  { key: 'facilityName', label: 'Facility' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = ['name', 'number', 'facilityName', 'status', 'actions'];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const HospitalDepartments: React.FC = () => {
  const { can } = usePermissions();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Facility options for the Add/Edit modal (small list, eager)
  const [facilities, setFacilities] = useState<Facility[]>([]);

  // ── Filters ─────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [facilityFilter, setFacilityFilter] = useState<string | undefined>(undefined);
  const [selectedFacility, setSelectedFacility] = useState<{ id: string; name: string } | null>(null);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cascading facility dropdown (search)
  const facilityDD = useAsyncDropdown<Facility>({
    fetcher: async (q) => {
      const data = await get<any>('/hospital-facilities', { search: q, limit: 20 });
      return data?.items ?? [];
    },
    minChars: 2,
    debounceMs: 300,
  });

  // ── Columns / presets ───────────────────────────────────
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_departments_columns_v1',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const presetsCtrl = useFilterPresets('departments');

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
    facilityId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  const fetchDepartments = useCallback(async (p: FetchParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? (pagination.pageSize as number);
      const query: Record<string, any> = { limit: pageSize, offset: (page - 1) * pageSize };
      if (p.search) query.search = p.search;
      if (p.facilityId) query.facilityId = p.facilityId;
      if (p.sortBy) { query.sortBy = p.sortBy; query.sortOrder = p.sortOrder ?? 'asc'; }

      const data = await get<any>('/hospital-departments', query);
      let items: Department[] = Array.isArray(data) ? data : (data?.items ?? []);
      if (p.status) items = items.filter((d) => d.status === p.status);
      const total: number = data?.total ?? items.length;
      setDepartments(items);
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load departments.');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize]);

  const fetchFacilitiesForModal = useCallback(async () => {
    try {
      const data = await get<any>('/hospital-facilities', { limit: 100 });
      setFacilities(Array.isArray(data) ? data : (data?.items ?? []));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchFacilitiesForModal();
    presetsCtrl.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!presetsCtrl.defaultApplied) return;
    const def = presetsCtrl.presets.find((p) => p.isDefault);
    if (def && !presetsCtrl.activePresetId) applyPreset(def);
    else fetchDepartments({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetsCtrl.defaultApplied]);

  // ── Handlers ────────────────────────────────────────────
  const currentFilters = () => ({
    search: searchText || undefined,
    status: statusFilter,
    facilityId: facilityFilter,
    facilityName: selectedFacility?.name,
    sortBy,
    sortOrder,
  });

  const handleSearch = (value: string) => {
    setSearchText(value);
    presetsCtrl.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchDepartments({ ...currentFilters(), search: value || undefined, page: 1 });
    }, 400);
  };

  const handleStatusChange = (v: string | undefined) => {
    setStatusFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchDepartments({ ...currentFilters(), status: v, page: 1 });
  };

  const handleFacilityChange = (v: string | undefined) => {
    setFacilityFilter(v);
    presetsCtrl.setActivePresetId(null);
    if (v) {
      const match = facilityDD.options.find((f) => f.id === v);
      if (match) setSelectedFacility({ id: match.id, name: match.name });
    } else {
      setSelectedFacility(null);
    }
    fetchDepartments({ ...currentFilters(), facilityId: v, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<Department> | SorterResult<Department>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextSortBy = s?.order ? (s.field as string) : undefined;
    const nextSortOrder: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    fetchDepartments({
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
    setFacilityFilter(undefined);
    setSelectedFacility(null);
    setSortBy(undefined);
    setSortOrder(undefined);
    presetsCtrl.setActivePresetId(null);
    fetchDepartments({ page: 1 });
  };

  const applyPreset = (preset: FilterPreset) => {
    const f = preset.filters || {};
    setSearchText(f.search ?? '');
    setStatusFilter(f.status ?? undefined);
    setFacilityFilter(f.facilityId ?? undefined);
    setSelectedFacility(f.facilityId && f.facilityName ? { id: f.facilityId, name: f.facilityName } : null);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presetsCtrl.setActivePresetId(preset.id);
    fetchDepartments({
      search: f.search,
      status: f.status,
      facilityId: f.facilityId,
      sortBy: f.sortBy,
      sortOrder: f.sortOrder,
      page: 1,
    });
  };

  // ── CRUD ────────────────────────────────────────────────
  const openAdd = () => { setEditingId(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (record: Department) => { setEditingId(record.id); form.setFieldsValue(record); setModalOpen(true); };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      if (editingId) {
        await put(`/hospital-departments/${editingId}`, values);
        message.success('Department updated.');
      } else {
        await post('/hospital-departments', values);
        message.success('Department added.');
      }
      setModalOpen(false);
      form.resetFields();
      fetchDepartments(currentFilters());
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.message || 'Failed to save department.');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await del(`/hospital-departments/${id}`);
      message.success('Department deactivated.');
      fetchDepartments(currentFilters());
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to deactivate department.');
    }
  };

  // ── Columns ────────────────────────────────────────────
  const columnDefs: Record<ColumnKey, ColumnType<Department>> = {
    name: { title: 'Name', dataIndex: 'name', key: 'name', sorter: true, sortOrder: sortBy === 'name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null },
    number: { title: 'Number', dataIndex: 'number', key: 'number', sorter: true, sortOrder: sortBy === 'number' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    facilityName: { title: 'Facility', dataIndex: 'facilityName', key: 'facilityName', sorter: true, sortOrder: sortBy === 'facilityName' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
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
          {can('departments', 'WRITE') && (
            <Button type="link" icon={<EditOutlined />} size="small" onClick={() => openEdit(record)}>Edit</Button>
          )}
          {can('departments', 'FULL') && (
            <Popconfirm title="Deactivate department?" okText="Yes" okButtonProps={{ danger: true }} cancelText="No" onConfirm={() => handleDelete(record.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small">Remove</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  };

  const baseColumns: ColumnsType<Department> = useMemo(
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
            <AppstoreOutlined style={{ fontSize: 24 }} />
            <Title level={3} style={{ margin: 0 }}>Departments</Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => fetchDepartments(currentFilters())} />
            </Tooltip>
            {can('departments', 'WRITE') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Department</Button>
            )}
          </Space>
        </Col>
      </Row>

      {error && (
        <Alert message={error} type="error" showIcon closable style={{ marginBottom: 16 }} onClose={() => setError(null)} />
      )}

      <Card>
        <FilterBar>
          <Input
            placeholder="Search departments…"
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
          <Select
            placeholder="Search facilities…"
            value={facilityFilter}
            onChange={handleFacilityChange}
            onSearch={facilityDD.onSearch}
            allowClear
            showSearch
            filterOption={false}
            loading={facilityDD.loading}
            style={{ width: 200 }}
            notFoundContent={facilityDD.loading ? <Spin size="small" /> : <span>Type 2+ chars</span>}
          >
            {selectedFacility && !facilityDD.options.find((f) => f.id === selectedFacility.id) && (
              <Option key={selectedFacility.id} value={selectedFacility.id}>{selectedFacility.name}</Option>
            )}
            {facilityDD.options.map((f) => (
              <Option key={f.id} value={f.id}>{f.name}</Option>
            ))}
          </Select>
          <FilterPresetsMenu
            controller={presetsCtrl}
            getCurrentFilters={() => currentFilters()}
            onApply={applyPreset}
            hint="Saves search, status, facility, and sort."
          />
          <Tooltip title="Choose & reorder columns">
            <Button icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>Columns</Button>
          </Tooltip>
          <Button type="text" onClick={clearAllFilters}>Clear filters</Button>
        </FilterBar>

        <Table<Department>
          columns={columns}
          components={tableComponents}
          dataSource={departments}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          size="middle"
          locale={{ emptyText: 'No departments found.' }}
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
        title={editingId ? 'Edit Department' : 'Add Department'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText={editingId ? 'Save' : 'Add'}
        confirmLoading={modalLoading}
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Department Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Orthopedics" />
          </Form.Item>
          <Form.Item name="number" label="Department Code">
            <Input placeholder="e.g. DEPT-001" />
          </Form.Item>
          <Form.Item name="facilityId" label="Facility (optional)">
            <Select placeholder="Select facility" allowClear>
              {facilities.map((f) => (
                <Option key={f.id} value={f.id}>
                  {f.name}{f.number ? ` (${f.number})` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* Procurement metadata — used by the budget engine + GL ledger. */}
          <Form.Item
            name="costCenter"
            label="Cost Center"
            tooltip="Used to match budgets and roll up GL postings"
          >
            <Input placeholder="e.g. CC-5300-ORTHO" />
          </Form.Item>
          <Form.Item
            name="glCode"
            label="GL Account Code"
            tooltip="Default expense account for invoices charged to this department"
          >
            <Input placeholder="e.g. 5300-DME" />
          </Form.Item>
          <Form.Item
            name="serviceLine"
            label="Service Line"
            tooltip="e.g. Surgical, Cardiology, Oncology — used for spend roll-ups"
          >
            <Input placeholder="e.g. Surgical Services" />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default HospitalDepartments;
