/**
 * VendorSkuCatalog — Phase C: vendor admin CRUD page for the HCPC ↔ vendor
 * SKU mapping catalog. Vendor users auto-scoped to their own vendor; admins
 * can pick a vendor via the dropdown.
 */

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
  SearchOutlined,
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

interface VendorItemSku {
  id: string;
  vendorId: string;
  hcpcCode: string;
  vendorSku: string;
  description: string | null;
  manufacturerName: string | null;
  manufacturerItemNumber: string | null;
  unitsPerPack: number;
  packsPerCase: number;
  unitOfMeasurement: string | null;
  listPriceCents: number | null;
  isActive: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VendorOption {
  id: string;
  name: string;
}

const VendorSkuCatalog: React.FC = () => {
  const { isAdmin, isVendor, isSuperVendor, userData } = useUserRoles();
  const canManage = isAdmin || isVendor || isSuperVendor;

  const [items, setItems] = useState<VendorItemSku[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(
    isVendor ? (userData as any)?.vendorId ?? null : null,
  );
  const [searchHcpc, setSearchHcpc] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<VendorItemSku | null>(null);
  const [form] = Form.useForm();

  // ─── Load vendors (admin only) ──────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin && !isSuperVendor) return;
    (async () => {
      try {
        const data = await get<any>('/vendors');
        const list = Array.isArray(data) ? data : data?.items ?? [];
        setVendors(list.map((v: any) => ({ id: v.id, name: v.name })));
      } catch {
        /* non-critical */
      }
    })();
  }, [isAdmin, isSuperVendor]);

  // ─── Load SKU rows ─────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {};
      if (selectedVendorId) params.vendorId = selectedVendorId;
      if (searchHcpc) params.hcpcCode = searchHcpc.toUpperCase();
      if (!activeOnly) params.activeOnly = 0;
      const res = await get<{ items: VendorItemSku[] }>(
        '/vendor-item-skus',
        params,
      );
      setItems(res.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load SKU catalog');
    } finally {
      setLoading(false);
    }
  }, [canManage, selectedVendorId, searchHcpc, activeOnly]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ─── CRUD ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      unitsPerPack: 1,
      packsPerCase: 1,
      unitOfMeasurement: 'EA',
      isActive: true,
    });
    if (isAdmin || isSuperVendor) {
      if (selectedVendorId) form.setFieldsValue({ vendorId: selectedVendorId });
    }
    setDrawerOpen(true);
  };

  const openEdit = (row: VendorItemSku) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      vendorId: row.vendorId,
      hcpcCode: row.hcpcCode,
      vendorSku: row.vendorSku,
      description: row.description,
      manufacturerName: row.manufacturerName,
      manufacturerItemNumber: row.manufacturerItemNumber,
      unitsPerPack: row.unitsPerPack,
      packsPerCase: row.packsPerCase,
      unitOfMeasurement: row.unitOfMeasurement,
      listPriceDollars:
        row.listPriceCents != null ? row.listPriceCents / 100 : undefined,
      isActive: row.isActive === 1,
      notes: row.notes,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      const payload: any = {
        hcpcCode: v.hcpcCode?.toUpperCase(),
        vendorSku: v.vendorSku,
        description: v.description ?? null,
        manufacturerName: v.manufacturerName ?? null,
        manufacturerItemNumber: v.manufacturerItemNumber ?? null,
        unitsPerPack: v.unitsPerPack ?? 1,
        packsPerCase: v.packsPerCase ?? 1,
        unitOfMeasurement: v.unitOfMeasurement ?? null,
        listPriceCents:
          v.listPriceDollars != null
            ? Math.round(Number(v.listPriceDollars) * 100)
            : null,
        isActive: v.isActive !== false,
        notes: v.notes ?? null,
      };
      if (isAdmin || isSuperVendor) payload.vendorId = v.vendorId;

      if (editing) {
        await put(`/vendor-item-skus/${editing.id}`, payload);
        message.success('SKU updated');
      } else {
        await post('/vendor-item-skus', payload);
        message.success('SKU created');
      }
      setDrawerOpen(false);
      fetchItems();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation
      message.error(
        err?.response?.data?.error || 'Failed to save SKU mapping',
      );
    }
  };

  const handleDelete = async (id: string, hard = false) => {
    try {
      await del(`/vendor-item-skus/${id}${hard ? '?hard=1' : ''}`);
      message.success(hard ? 'SKU permanently deleted' : 'SKU deactivated');
      fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const columns: ColumnsType<VendorItemSku> = useMemo(
    () => [
      {
        title: 'HCPC',
        dataIndex: 'hcpcCode',
        key: 'hcpcCode',
        width: 100,
        render: (c: string) => <code>{c}</code>,
      },
      {
        title: 'Vendor SKU',
        dataIndex: 'vendorSku',
        key: 'vendorSku',
        width: 200,
        render: (sku: string) => <Text strong>{sku}</Text>,
      },
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: 'Pack',
        key: 'pack',
        width: 160,
        render: (_: any, r: VendorItemSku) => (
          <Tag>
            {r.unitsPerPack} {r.unitOfMeasurement || 'units'}/pack
            {r.packsPerCase > 1 ? ` · ${r.packsPerCase}/case` : ''}
          </Tag>
        ),
      },
      {
        title: 'List Price',
        dataIndex: 'listPriceCents',
        key: 'listPriceCents',
        width: 110,
        render: (c: number | null) =>
          c == null ? (
            <Text type="secondary">—</Text>
          ) : (
            <Text>${(c / 100).toFixed(2)}</Text>
          ),
      },
      {
        title: 'Status',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 90,
        render: (a: number) =>
          a === 1 ? (
            <Tag color="success">Active</Tag>
          ) : (
            <Tag>Inactive</Tag>
          ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 140,
        render: (_: any, r: VendorItemSku) => (
          <Space>
            <Button
              icon={<EditOutlined />}
              size="small"
              type="link"
              onClick={() => openEdit(r)}
            >
              Edit
            </Button>
            <Popconfirm
              title="Deactivate this SKU?"
              description="Routing will stop using it. (Use Edit → Active toggle to re-enable.)"
              onConfirm={() => handleDelete(r.id, false)}
              okText="Deactivate"
              cancelText="Cancel"
            >
              <Button
                icon={<DeleteOutlined />}
                size="small"
                type="link"
                danger
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [],
  );

  if (!canManage) {
    return (
      <PageWrapper>
        <Alert
          type="warning"
          message="You don't have access to vendor SKU management."
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Header>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            SKU Catalog
          </Title>
          <Text type="secondary">
            Map HCPC codes to your vendor SKUs with pack/case math. Routing
            uses these to compute pack quantities.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchItems}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add SKU
          </Button>
        </Space>
      </Header>

      <Card size="small" style={{ marginBottom: 12 }} bodyStyle={{ padding: 12 }}>
        <Space wrap size={12}>
          {(isAdmin || isSuperVendor) && (
            <Select
              showSearch
              allowClear
              placeholder="Filter by vendor"
              size="small"
              style={{ minWidth: 240 }}
              value={selectedVendorId ?? undefined}
              optionFilterProp="label"
              onChange={(v) => setSelectedVendorId(v ?? null)}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            />
          )}
          <Input
            allowClear
            placeholder="Search HCPC"
            size="small"
            prefix={<SearchOutlined />}
            value={searchHcpc}
            onChange={(e) => setSearchHcpc(e.target.value)}
            style={{ width: 200 }}
          />
          <Space size={6}>
            <Switch
              size="small"
              checked={activeOnly}
              onChange={setActiveOnly}
            />
            <span style={{ fontSize: 12 }}>Active only</span>
          </Space>
        </Space>
      </Card>

      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 12 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Card>
        <Table
          rowKey="id"
          dataSource={items}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 25, showSizeChanger: true }}
          size="middle"
        />
      </Card>

      <Drawer
        title={editing ? 'Edit SKU mapping' : 'Add SKU mapping'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={handleSave}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {(isAdmin || isSuperVendor) && (
            <Form.Item
              name="vendorId"
              label="Vendor"
              rules={[{ required: true, message: 'Vendor is required' }]}
            >
              <Select
                showSearch
                placeholder="Select vendor"
                optionFilterProp="label"
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                disabled={!!editing}
              />
            </Form.Item>
          )}
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item
                name="hcpcCode"
                label="HCPC code"
                rules={[{ required: true, message: 'HCPC required' }]}
              >
                <Input placeholder="e.g. L1832" maxLength={10} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                name="vendorSku"
                label="Vendor SKU"
                rules={[{ required: true, message: 'SKU required' }]}
              >
                <Input placeholder="e.g. MS-L1832-BOX10" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input placeholder="Sterile dressing 4×4" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="manufacturerName" label="Manufacturer">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="manufacturerItemNumber" label="MFR Item #">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item
                name="unitsPerPack"
                label="Units / pack"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="packsPerCase" label="Packs / case">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unitOfMeasurement" label="Unit (UoM)">
                <Select
                  options={[
                    { value: 'EA', label: 'EA (each)' },
                    { value: 'BOX', label: 'BOX' },
                    { value: 'CASE', label: 'CASE' },
                    { value: 'PAIR', label: 'PAIR' },
                    { value: 'SET', label: 'SET' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="listPriceDollars" label="List price ($)">
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrapper>
  );
};

export default VendorSkuCatalog;
