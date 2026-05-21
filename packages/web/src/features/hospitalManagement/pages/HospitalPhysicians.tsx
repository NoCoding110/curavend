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
  UserOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  SettingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { useSelector } from 'react-redux';
import { get, post, put } from '../../../api/client';
import type { RootState } from '../../../store/store';
import PermissionsMatrix from '../components/PermissionsMatrix';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { usePermissions } from '../../../hooks/usePermissions';
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

interface Physician {
  id: string;
  name: string;
  email: string;
  npiNumber: string | null;
  specialty: string | null;
  licenseNumber: string | null;
  userStatus: string;
}

type ColumnKey =
  | 'name'
  | 'email'
  | 'npiNumber'
  | 'specialty'
  | 'licenseNumber'
  | 'userStatus'
  | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'npiNumber', label: 'NPI' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'licenseNumber', label: 'License #' },
  { key: 'userStatus', label: 'Status' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = ['name', 'email', 'npiNumber', 'specialty', 'userStatus', 'actions'];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const HospitalPhysicians: React.FC = () => {
  const userData = useSelector((state: RootState) => state.auth.userData);
  const { isFacilityAccountManager } = useUserRoles();
  const { can } = usePermissions();
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  // ── Filters ─────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [specialtyFilter, setSpecialtyFilter] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Columns / presets ───────────────────────────────────
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_physicians_columns_v1',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const presetsCtrl = useFilterPresets('physicians');

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
    userStatus?: string;
    specialty?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }

  const fetchPhysicians = useCallback(async (p: FetchParams = {}) => {
    setLoading(true);
    setError(null);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? (pagination.pageSize as number);
      const query: Record<string, any> = { role: 'PHYSICIAN', page, limit: pageSize };
      if (p.search) query.search = p.search;
      if (p.userStatus) query.userStatus = p.userStatus;
      if (p.sortBy) { query.sortBy = p.sortBy; query.sortOrder = p.sortOrder ?? 'asc'; }

      const data = await get<any>('/users', query);
      let items: Physician[] = data?.users ?? data?.items ?? (Array.isArray(data) ? data : []);
      if (p.specialty) {
        const needle = p.specialty.toLowerCase();
        items = items.filter((x) => (x.specialty || '').toLowerCase().includes(needle));
      }
      const total: number = data?.pagination?.total ?? data?.total ?? items.length;
      setPhysicians(items);
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load physicians.');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize]);

  useEffect(() => {
    presetsCtrl.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!presetsCtrl.defaultApplied) return;
    const def = presetsCtrl.presets.find((p) => p.isDefault);
    if (def && !presetsCtrl.activePresetId) applyPreset(def);
    else fetchPhysicians({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetsCtrl.defaultApplied]);

  // ── Handlers ────────────────────────────────────────────
  const currentFilters = () => ({
    search: searchText || undefined,
    userStatus: statusFilter,
    specialty: specialtyFilter,
    sortBy,
    sortOrder,
  });

  const handleSearch = (value: string) => {
    setSearchText(value);
    presetsCtrl.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchPhysicians({ ...currentFilters(), search: value || undefined, page: 1 });
    }, 400);
  };

  const handleStatusChange = (v: string | undefined) => {
    setStatusFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchPhysicians({ ...currentFilters(), userStatus: v, page: 1 });
  };

  const handleSpecialtyChange = (v: string | undefined) => {
    setSpecialtyFilter(v);
    presetsCtrl.setActivePresetId(null);
    fetchPhysicians({ ...currentFilters(), specialty: v, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<Physician> | SorterResult<Physician>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextSortBy = s?.order ? (s.field as string) : undefined;
    const nextSortOrder: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    fetchPhysicians({
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
    setSpecialtyFilter(undefined);
    setSortBy(undefined);
    setSortOrder(undefined);
    presetsCtrl.setActivePresetId(null);
    fetchPhysicians({ page: 1 });
  };

  const applyPreset = (preset: FilterPreset) => {
    const f = preset.filters || {};
    setSearchText(f.search ?? '');
    setStatusFilter(f.userStatus ?? undefined);
    setSpecialtyFilter(f.specialty ?? undefined);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presetsCtrl.setActivePresetId(preset.id);
    fetchPhysicians({
      search: f.search,
      userStatus: f.userStatus,
      specialty: f.specialty,
      sortBy: f.sortBy,
      sortOrder: f.sortOrder,
      page: 1,
    });
  };

  // ── CRUD ────────────────────────────────────────────────
  const openAdd = () => { setEditingId(null); form.resetFields(); setModalOpen(true); };
  const openEdit = (record: Physician) => { setEditingId(record.id); form.setFieldsValue(record); setModalOpen(true); };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      if (editingId) {
        await put(`/users/${editingId}`, values);
        message.success('Physician updated.');
      } else {
        await post('/users', {
          ...values,
          userType: 'HOSPITAL',
          role: 'PHYSICIAN',
          hospitalId: userData?.hospitalId,
        });
        message.success('Physician added. A welcome email with login credentials has been sent.');
      }
      setModalOpen(false);
      form.resetFields();
      fetchPhysicians(currentFilters());
    } catch (err: any) {
      if (err?.response) {
        message.error(err?.response?.data?.message || 'Failed to save physician.');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await put(`/users/${id}/status`, { userStatus: 'INACTIVE' });
      message.success('Physician deactivated.');
      fetchPhysicians(currentFilters());
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to deactivate physician.');
    }
  };

  // ── Columns ────────────────────────────────────────────
  const columnDefs: Record<ColumnKey, ColumnType<Physician>> = {
    name: { title: 'Name', dataIndex: 'name', key: 'name', sorter: true, sortOrder: sortBy === 'name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null },
    email: { title: 'Email', dataIndex: 'email', key: 'email', sorter: true, sortOrder: sortBy === 'email' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null },
    npiNumber: { title: 'NPI', dataIndex: 'npiNumber', key: 'npiNumber', render: (v) => v || '—' },
    specialty: { title: 'Specialty', dataIndex: 'specialty', key: 'specialty', sorter: true, sortOrder: sortBy === 'specialty' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    licenseNumber: { title: 'License #', dataIndex: 'licenseNumber', key: 'licenseNumber', render: (v) => v || '—' },
    userStatus: {
      title: 'Status',
      dataIndex: 'userStatus',
      key: 'userStatus',
      sorter: true,
      sortOrder: sortBy === 'userStatus' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
      render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v}</Tag>,
    },
    actions: {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          {can('physicians', 'WRITE') && (
            <Button type="link" icon={<EditOutlined />} size="small" onClick={() => openEdit(record)}>Edit</Button>
          )}
          {record.userStatus === 'ACTIVE' && can('physicians', 'FULL') && (
            <Popconfirm title="Deactivate physician?" okText="Yes" okButtonProps={{ danger: true }} cancelText="No" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small">Deactivate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  };

  const baseColumns: ColumnsType<Physician> = useMemo(
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
            <UserOutlined style={{ fontSize: 24 }} />
            <Title level={3} style={{ margin: 0 }}>Physicians</Title>
          </Space>
        </Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => fetchPhysicians(currentFilters())} />
            </Tooltip>
            {can('physicians', 'WRITE') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>Add Physician</Button>
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
            placeholder="Search physicians…"
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
            placeholder="Specialty"
            value={specialtyFilter ?? ''}
            onChange={(e) => setSpecialtyFilter(e.target.value || undefined)}
            onPressEnter={() => handleSpecialtyChange(specialtyFilter)}
            onBlur={() => handleSpecialtyChange(specialtyFilter)}
            style={{ width: 160 }}
            allowClear
          />
          <FilterPresetsMenu
            controller={presetsCtrl}
            getCurrentFilters={() => currentFilters()}
            onApply={applyPreset}
            hint="Saves search, status, specialty, and sort."
          />
          <Tooltip title="Choose & reorder columns">
            <Button icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>Columns</Button>
          </Tooltip>
          <Button type="text" onClick={clearAllFilters}>Clear filters</Button>
        </FilterBar>

        <Table<Physician>
          columns={columns}
          components={tableComponents}
          dataSource={physicians}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          size="middle"
          locale={{ emptyText: 'No physicians found.' }}
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
        title={editingId ? 'Edit Physician' : 'Add Physician'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText={editingId ? 'Save' : 'Add Physician'}
        confirmLoading={modalLoading}
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Dr. Jane Smith" />
          </Form.Item>
          {!editingId && (
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
              <Input placeholder="physician@hospital.com" />
            </Form.Item>
          )}
          <Form.Item name="npiNumber" label="NPI Number">
            <Input placeholder="10-digit NPI" maxLength={10} />
          </Form.Item>
          <Form.Item name="specialty" label="Specialty">
            <Input placeholder="e.g. Orthopedics" />
          </Form.Item>
          <Form.Item name="licenseNumber" label="License Number">
            <Input placeholder="State medical license" />
          </Form.Item>
          <Form.Item name="contact" label="Contact / Phone">
            <Input placeholder="(555) 000-0000" />
          </Form.Item>
        </Form>

        {editingId && isFacilityAccountManager && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
            <Title level={5} style={{ marginBottom: 12 }}>Permissions</Title>
            <PermissionsMatrix userId={editingId} />
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
};

export default HospitalPhysicians;
