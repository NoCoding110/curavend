import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { del, get, post, put } from '../../../api/client';
import { useUserRoles } from '../../../hooks/useUserRoles';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
`;

// ─── Types ─────────────────────────────────────────────────────────────────

interface VendorLocation {
  id: string;
  vendorId: string;
  name: string;
  locationType: 'WAREHOUSE' | 'FITTING_CENTER' | 'HEADQUARTERS' | 'DISTRIBUTION_HUB';
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: number;
  isActive: number;
  capabilities?: string | null; // JSON string
  serviceStates?: string | null; // JSON string
  serviceZipPrefixes?: string | null;
  maxDeliveryHours?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VendorOption {
  id: string;
  name: string;
}

const LOCATION_TYPES: Array<{ value: VendorLocation['locationType']; label: string }> = [
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'FITTING_CENTER', label: 'Fitting Center' },
  { value: 'HEADQUARTERS', label: 'Headquarters' },
  { value: 'DISTRIBUTION_HUB', label: 'Distribution Hub' },
];

const CAPABILITY_OPTIONS = [
  { value: 'CUSTOM_FIT', label: 'Custom Fit' },
  { value: 'STAT', label: 'STAT / Same-day' },
  { value: 'REFRIGERATED', label: 'Refrigerated' },
  { value: 'STERILE', label: 'Sterile Kit Prep' },
  { value: 'IMPLANT', label: 'Implant Handling' },
  { value: 'BIOLOGICS', label: 'Biologics' },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

function parseJsonArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
  } catch {
    /* ignore */
  }
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Component ─────────────────────────────────────────────────────────────

const VendorLocations: React.FC = () => {
  const { isVendor, isAdmin } = useUserRoles();
  const [rows, setRows] = useState<VendorLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<VendorLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Admin picks a vendor; vendor users are auto-scoped.
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | undefined>(
    undefined,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (isAdmin && selectedVendorId) params.vendorId = selectedVendorId;
      const data = await get<{ items: VendorLocation[] }>(
        '/vendor-locations',
        params,
      );
      setRows(data.items || []);
    } catch (err: any) {
      message.error(
        err?.response?.data?.message || 'Failed to load vendor locations.',
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedVendorId]);

  useEffect(() => {
    if (isAdmin) {
      get<{ items: VendorOption[] }>('/vendors').then((d) => {
        setVendors(d.items || []);
      }).catch(() => {/* non-critical */});
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      locationType: 'WAREHOUSE',
      isActive: true,
      isPrimary: false,
      maxDeliveryHours: 24,
      capabilities: [],
      serviceStates: [],
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: VendorLocation) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      locationType: row.locationType,
      streetAddress: row.streetAddress,
      city: row.city,
      state: row.state,
      zip: row.zip,
      phone: row.phone,
      email: row.email,
      isPrimary: !!row.isPrimary,
      isActive: !!row.isActive,
      capabilities: parseJsonArray(row.capabilities),
      serviceStates: parseJsonArray(row.serviceStates),
      serviceZipPrefixes: parseJsonArray(row.serviceZipPrefixes).join(', '),
      maxDeliveryHours: row.maxDeliveryHours ?? undefined,
      notes: row.notes,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: any = { ...values };
      // Normalize zip prefixes from comma string
      if (typeof payload.serviceZipPrefixes === 'string') {
        payload.serviceZipPrefixes = payload.serviceZipPrefixes
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }
      if (isAdmin && selectedVendorId && !editing) {
        payload.vendorId = selectedVendorId;
      }
      if (editing) {
        await put(`/vendor-locations/${editing.id}`, payload);
        message.success('Location updated.');
      } else {
        await post('/vendor-locations', payload);
        message.success('Location added.');
      }
      setDrawerOpen(false);
      form.resetFields();
      setEditing(null);
      load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(
        err?.response?.data?.message || 'Failed to save location.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: VendorLocation) => {
    try {
      await del(`/vendor-locations/${row.id}`);
      message.success('Location deleted.');
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Delete failed.');
    }
  };

  const columns: ColumnsType<VendorLocation> = useMemo(
    () => [
      {
        title: 'Name',
        dataIndex: 'name',
        key: 'name',
        render: (name: string, row) => (
          <Space direction="vertical" size={0}>
            <Text strong>{name}</Text>
            <Space size={4}>
              <Tag color="geekblue">{row.locationType.replace('_', ' ')}</Tag>
              {row.isPrimary === 1 && <Tag color="gold">Primary</Tag>}
              {row.isActive === 0 && <Tag color="red">Inactive</Tag>}
            </Space>
          </Space>
        ),
      },
      {
        title: 'Address',
        key: 'address',
        render: (_: unknown, row) => (
          <Space direction="vertical" size={0}>
            <Text>{row.streetAddress || '—'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {[row.city, row.state, row.zip].filter(Boolean).join(', ') || '—'}
            </Text>
          </Space>
        ),
      },
      {
        title: 'Capabilities',
        key: 'capabilities',
        render: (_: unknown, row) => {
          const caps = parseJsonArray(row.capabilities);
          if (!caps.length) return <Text type="secondary">—</Text>;
          return (
            <Space wrap size={4}>
              {caps.map((c) => (
                <Tag key={c} color="purple">
                  {c.replace('_', ' ')}
                </Tag>
              ))}
            </Space>
          );
        },
      },
      {
        title: 'Service states',
        key: 'serviceStates',
        render: (_: unknown, row) => {
          const arr = parseJsonArray(row.serviceStates);
          if (!arr.length) return <Text type="secondary">—</Text>;
          return (
            <Space wrap size={4}>
              {arr.slice(0, 6).map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
              {arr.length > 6 && <Tag>+{arr.length - 6}</Tag>}
            </Space>
          );
        },
      },
      {
        title: 'SLA (hrs)',
        dataIndex: 'maxDeliveryHours',
        key: 'maxDeliveryHours',
        width: 100,
        render: (v: number | null) => (v == null ? '—' : `${v}h`),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 140,
        render: (_: unknown, row) => (
          <Space>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(row)}
            >
              Edit
            </Button>
            <Popconfirm
              title="Delete this location?"
              description="Orders already routed here won't be affected, but future routing will skip it."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(row)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!isVendor && !isAdmin) {
    return (
      <PageWrapper>
        <Alert
          type="warning"
          message="Vendor Locations is only available to vendor and admin users."
        />
      </PageWrapper>
    );
  }

  const canAdd = isVendor || (isAdmin && !!selectedVendorId);

  return (
    <PageWrapper>
      <Header>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Vendor Locations
          </Title>
          <Text type="secondary">
            Branches, warehouses, and fitting centers. Each location's
            capabilities and service area drive which orders it can fulfill.
          </Text>
        </div>
        <Space wrap>
          {isAdmin && (
            <Select
              placeholder="Filter by vendor"
              value={selectedVendorId}
              onChange={(v) => setSelectedVendorId(v)}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 260 }}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            />
          )}
          <Button icon={<ReloadOutlined />} onClick={load}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openAdd}
            disabled={!canAdd}
          >
            Add Location
          </Button>
        </Space>
      </Header>

      {isAdmin && !selectedVendorId && (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="Select a vendor to filter / add locations."
        />
      )}

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>

      <Drawer
        title={editing ? `Edit: ${editing.name}` : 'Add Location'}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Location name"
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Atlanta Distribution Hub" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Type"
                name="locationType"
                rules={[{ required: true }]}
              >
                <Select options={LOCATION_TYPES} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Delivery SLA (hours)"
                name="maxDeliveryHours"
                tooltip="4 = STAT, 24 = next-day, 72 = 3-day"
              >
                <InputNumber min={1} max={240} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Street address" name="streetAddress">
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="City" name="city">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="State" name="state">
                <Select
                  showSearch
                  allowClear
                  options={US_STATES.map((s) => ({ value: s, label: s }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="ZIP" name="zip">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Phone" name="phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Email" name="email">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="Capabilities"
            name="capabilities"
            tooltip="Drives which orders this location can fulfill — e.g. custom-fit orthotics require CUSTOM_FIT."
          >
            <Select
              mode="multiple"
              options={CAPABILITY_OPTIONS}
              placeholder="Select capabilities"
            />
          </Form.Item>
          <Form.Item
            label="Service states"
            name="serviceStates"
            tooltip="States this location delivers to. Leave empty to serve only its own state."
          >
            <Select
              mode="multiple"
              showSearch
              options={US_STATES.map((s) => ({ value: s, label: s }))}
              placeholder="Select states"
            />
          </Form.Item>
          <Form.Item
            label="Service ZIP prefixes (optional)"
            name="serviceZipPrefixes"
            tooltip="Comma-separated 3-digit ZIP prefixes, e.g. 303, 305. Narrows service area within states."
          >
            <Input placeholder="303, 305, 330" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Primary"
                name="isPrimary"
                valuePropName="checked"
                tooltip="The vendor's default location; only one can be primary at a time."
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Active"
                name="isActive"
                valuePropName="checked"
                tooltip="Inactive locations don't receive routed orders."
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrapper>
  );
};

export default VendorLocations;
