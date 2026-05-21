import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button, Card, Col, Descriptions, Drawer, Form, Input, message,
  Popconfirm, Row, Space, Table, Tag, Typography, Tooltip,
} from 'antd';
import type { ColumnsType, ColumnType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import {
  EditOutlined, PlusOutlined, DeleteOutlined, SearchOutlined, SettingOutlined, ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { get, post, put, del } from '../../../api/client';
import { useListColumns, type ListColumnDef } from '../../../hooks/useListColumns';
import { useFilterPresets } from '../../../hooks/useFilterPresets';
import { ColumnCustomizerDrawer } from '../../../components/list/ColumnCustomizerDrawer';
import { FilterPresetsMenu } from '../../../components/list/FilterPresetsMenu';
import type { FilterPreset } from '../../../api/filterPresets';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const PageWrapper = styled.div`padding: 24px;`;
const FilterBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

type ColumnKey = 'name' | 'email' | 'contact' | 'city' | 'state' | 'orders' | 'actions';

const ALL_COLUMNS: ListColumnDef<ColumnKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'contact', label: 'Contact' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'orders', label: 'Orders' },
  { key: 'actions', label: 'Actions', alwaysVisible: true, pinEnd: true },
];
const DEFAULT_VISIBLE: ColumnKey[] = ['name', 'email', 'contact', 'city', 'state', 'orders', 'actions'];

const VendorsPage: React.FC = () => {
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  // ── Filters ─────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [stateFilter, setStateFilter] = useState<string | undefined>();
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Columns / presets ───────────────────────────────────
  const cols = useListColumns<ColumnKey>({
    storageKey: 'curavend_vendors_columns_v1',
    allColumns: ALL_COLUMNS,
    defaultVisible: DEFAULT_VISIBLE,
  });
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const presetsCtrl = useFilterPresets('vendors');

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
  });

  interface FetchParams {
    page?: number; pageSize?: number;
    search?: string; state?: string;
    sortBy?: string; sortOrder?: 'asc' | 'desc';
  }

  const load = useCallback(async (p: FetchParams = {}) => {
    setLoading(true);
    try {
      const page = p.page ?? 1;
      const pageSize = p.pageSize ?? (pagination.pageSize as number);
      const query: Record<string, any> = { limit: pageSize, offset: (page - 1) * pageSize };
      if (p.search) query.search = p.search;
      if (p.state) query.state = p.state;
      if (p.sortBy) { query.sortBy = p.sortBy; query.sortOrder = p.sortOrder ?? 'asc'; }
      const d = await get<any>('/vendors', query);
      const items = d?.items ?? (Array.isArray(d) ? d : []);
      const total = d?.total ?? items.length;
      setVendors(items);
      setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
    } catch {
      message.error('Failed to load vendors');
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
    else load({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetsCtrl.defaultApplied]);

  const currentFilters = () => ({
    search: searchText || undefined,
    state: stateFilter,
    sortBy,
    sortOrder,
  });

  const handleSearch = (v: string) => {
    setSearchText(v);
    presetsCtrl.setActivePresetId(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      load({ ...currentFilters(), search: v || undefined, page: 1 });
    }, 400);
  };

  const handleStateChange = (v: string | undefined) => {
    setStateFilter(v);
    presetsCtrl.setActivePresetId(null);
    load({ ...currentFilters(), state: v, page: 1 });
  };

  const handleTableChange = (
    pag: TablePaginationConfig,
    _f: Record<string, FilterValue | null>,
    sorter: SorterResult<any> | SorterResult<any>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const nb = s?.order ? (s.field as string) : undefined;
    const no: 'asc' | 'desc' | undefined =
      s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined;
    setSortBy(nb);
    setSortOrder(no);
    load({
      ...currentFilters(),
      sortBy: nb,
      sortOrder: no,
      page: pag.current ?? 1,
      pageSize: pag.pageSize ?? 20,
    });
  };

  const clearAllFilters = () => {
    setSearchText('');
    setStateFilter(undefined);
    setSortBy(undefined);
    setSortOrder(undefined);
    presetsCtrl.setActivePresetId(null);
    load({ page: 1 });
  };

  const applyPreset = (preset: FilterPreset) => {
    const f = preset.filters || {};
    setSearchText(f.search ?? '');
    setStateFilter(f.state ?? undefined);
    setSortBy(f.sortBy ?? undefined);
    setSortOrder(f.sortOrder ?? undefined);
    presetsCtrl.setActivePresetId(preset.id);
    load({ search: f.search, state: f.state, sortBy: f.sortBy, sortOrder: f.sortOrder, page: 1 });
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (vendor: any) => {
    setEditing(vendor);
    form.setFieldsValue({
      name: vendor.name, email: vendor.email, contact: vendor.contact,
      contactPerson: vendor.contactPerson, city: vendor.city, state: vendor.state,
      zip: vendor.zip, streetAddress: vendor.streetAddress, website: vendor.website, ein: vendor.ein,
    });
    setDrawerOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await put(`/vendors/${editing.id}`, values);
        message.success('Vendor updated');
      } else {
        await post('/vendors', values);
        message.success('Vendor created');
      }
      setDrawerOpen(false);
      load(currentFilters());
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await del(`/vendors/${id}`);
      message.success('Vendor deleted');
      load(currentFilters());
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const viewDetail = (vendor: any) => { setSelected(vendor); setDetailOpen(true); };

  // ── Columns ────────────────────────────────────────────
  const columnDefs: Record<ColumnKey, ColumnType<any>> = {
    name: { title: 'Name', dataIndex: 'name', key: 'name', sorter: true, sortOrder: sortBy === 'name' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null },
    email: { title: 'Email', dataIndex: 'email', key: 'email', sorter: true, sortOrder: sortBy === 'email' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null },
    contact: { title: 'Contact', dataIndex: 'contact', key: 'contact', render: (v) => v || '—' },
    city: { title: 'City', dataIndex: 'city', key: 'city', sorter: true, sortOrder: sortBy === 'city' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    state: { title: 'State', dataIndex: 'state', key: 'state', sorter: true, sortOrder: sortBy === 'state' ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null, render: (v) => v || '—' },
    orders: {
      title: 'Orders', key: 'orders',
      render: (_, r) => (
        <Space size={4}>
          <Tag color="blue">{r.inProcessOrders ?? 0} active</Tag>
          <Tag color="green">{r.completedOrders ?? 0} done</Tag>
        </Space>
      ),
    },
    actions: {
      title: 'Actions', key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={(e) => { e.stopPropagation(); viewDetail(r); }}>View</Button>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(r); }}>Edit</Button>
          <Popconfirm title="Delete this vendor?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  };

  const baseColumns: ColumnsType<any> = useMemo(
    () => cols.finalKeys.map((k) => columnDefs[k]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols.finalKeys, sortBy, sortOrder],
  );
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={3} style={{ margin: 0 }}>Manage Vendors</Title></Col>
        <Col>
          <Space>
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={() => load(currentFilters())} />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Vendor</Button>
          </Space>
        </Col>
      </Row>

      <Card>
        <FilterBar>
          <Input
            placeholder="Search vendors…"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 240 }}
            allowClear
            onClear={() => handleSearch('')}
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
            controller={presetsCtrl}
            getCurrentFilters={() => currentFilters()}
            onApply={applyPreset}
            hint="Saves search, state, and sort."
          />
          <Tooltip title="Choose & reorder columns">
            <Button icon={<SettingOutlined />} onClick={() => setColumnsDrawerOpen(true)}>Columns</Button>
          </Tooltip>
          <Button type="text" onClick={clearAllFilters}>Clear filters</Button>
        </FilterBar>

        <Table
          loading={loading}
          rowKey="id"
          dataSource={vendors}
          columns={columns}
          components={tableComponents}
          pagination={pagination}
          onChange={handleTableChange}
          onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => viewDetail(r) })}
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

      {/* Create / Edit Drawer */}
      <Drawer
        title={editing ? `Edit Vendor: ${editing.name}` : 'Add Vendor'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={save}>Save</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Vendor Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="contact" label="Phone"><Input /></Form.Item>
          <Form.Item name="contactPerson" label="Contact Person"><Input /></Form.Item>
          <Form.Item name="streetAddress" label="Street Address"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="state" label="State"><Input maxLength={2} /></Form.Item></Col>
            <Col span={6}><Form.Item name="zip" label="ZIP"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="website" label="Website"><Input /></Form.Item>
          <Form.Item name="ein" label="EIN"><Input /></Form.Item>
        </Form>
      </Drawer>

      {/* Detail Drawer */}
      <Drawer
        title={`Vendor: ${selected?.name}`}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={<Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(selected); }}>Edit</Button>}
      >
        {selected && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="ID">{selected.id}</Descriptions.Item>
            <Descriptions.Item label="Name">{selected.name}</Descriptions.Item>
            <Descriptions.Item label="Email">{selected.email}</Descriptions.Item>
            <Descriptions.Item label="Phone">{selected.contact || '—'}</Descriptions.Item>
            <Descriptions.Item label="Contact Person">{selected.contactPerson || '—'}</Descriptions.Item>
            <Descriptions.Item label="Address">
              {[selected.streetAddress, selected.city, selected.state, selected.zip].filter(Boolean).join(', ') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Website">{selected.website || '—'}</Descriptions.Item>
            <Descriptions.Item label="EIN">{selected.ein || '—'}</Descriptions.Item>
            <Descriptions.Item label="Accreditation">{selected.accreditingBody || '—'}</Descriptions.Item>
            <Descriptions.Item label="State License">{selected.stateLevelLicenseNumber || '—'}</Descriptions.Item>
            <Descriptions.Item label="Active Orders"><Tag color="blue">{selected.inProcessOrders ?? 0}</Tag></Descriptions.Item>
            <Descriptions.Item label="Completed Orders"><Tag color="green">{selected.completedOrders ?? 0}</Tag></Descriptions.Item>
            <Descriptions.Item label="Created">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </PageWrapper>
  );
};

export default VendorsPage;
