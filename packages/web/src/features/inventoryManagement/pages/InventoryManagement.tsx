import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Button, Typography, Space, Table, Tabs, Modal,
  Form, Input, message, Spin, Select, Tag, Popconfirm, Switch, Radio,
} from 'antd';
import {
  PlusOutlined, InboxOutlined, AppstoreOutlined,
  UnorderedListOutlined, DeleteOutlined, EditOutlined, UnorderedListOutlined as LotsIcon,
} from '@ant-design/icons';
import { InventoryLotsDrawer } from '../components/InventoryLotsDrawer';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import { useSelector } from 'react-redux';
import { get, post, put, del } from '../../../api/client';
import type { RootState } from '../../../store/store';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;

const PageWrapper = styled.div`padding: 24px;`;
const StatCard = styled(Card)`
  text-align: center;
  .stat-value { font-size: 28px; font-weight: 700; color: #1677ff; }
  .stat-label { font-size: 13px; color: #888; margin-top: 4px; }
`;

interface Catalog {
  id: string;
  vendorId: string;
  vendorName: string | null;
  vendorEmail: string | null;
  itemCount: number;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  inventoryId: string;
  hcpcCode: string;
  description: string | null;
  manufacturerName: string | null;
  manufacturerItemNumber: string | null;
  unitOfMeasurement: string | null;
  isCustomFit: number;
  itemType: 'LOT' | 'NON_LOT';
  lotCount?: number;
  totalOnHand?: number;
  createdAt: string;
}

/** Infer LOT vs NON_LOT from HCPC prefix (mirrors API + migration logic). */
function inferItemType(hcpc: string): 'LOT' | 'NON_LOT' {
  if (!hcpc) return 'NON_LOT';
  const code = hcpc.trim().toUpperCase();
  if (['L', 'C', 'K'].includes(code[0])) return 'LOT';
  if (code.startsWith('A42') || code.startsWith('Q4')) return 'LOT';
  return 'NON_LOT';
}

interface Vendor { id: string; name: string; }

const InventoryManagement: React.FC = () => {
  const userData = useSelector((state: RootState) => state.auth.userData);
  const isAdmin = userData?.userType === 'ADMIN';
  const isVendor = userData?.userType === 'VENDOR';

  const [activeTab, setActiveTab] = useState('catalogs');

  // Catalogs
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [addCatalogOpen, setAddCatalogOpen] = useState(false);
  const [addCatalogLoading, setAddCatalogLoading] = useState(false);
  const [catalogForm] = Form.useForm();

  // Vendor list for admin dropdown
  const [vendorList, setVendorList] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);

  // Items
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemLoading, setAddItemLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm] = Form.useForm();

  // Lots drawer
  const [lotsItem, setLotsItem] = useState<InventoryItem | null>(null);

  const fetchCatalogs = useCallback(async () => {
    setCatalogsLoading(true);
    try {
      const data = await get<{ items: Catalog[] }>('/inventory');
      setCatalogs(data.items || []);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load inventory catalogs.');
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  const fetchVendors = useCallback(async () => {
    if (!isAdmin) return;
    setVendorsLoading(true);
    try {
      const data = await get<{ items: Vendor[] }>('/vendors');
      setVendorList(data.items || []);
    } catch {
      // non-critical
    } finally {
      setVendorsLoading(false);
    }
  }, [isAdmin]);

  const fetchItems = useCallback(async (catalogId: string) => {
    setItemsLoading(true);
    try {
      const data = await get<{ items: InventoryItem[] }>(`/inventory/${catalogId}/items`);
      setItems(data.items || []);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load inventory items.');
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogs();
    fetchVendors();
  }, [fetchCatalogs, fetchVendors]);

  useEffect(() => {
    if (activeTab === 'items' && selectedCatalog) {
      fetchItems(selectedCatalog.id);
    }
  }, [activeTab, selectedCatalog, fetchItems]);

  const openCatalog = (catalog: Catalog) => {
    setSelectedCatalog(catalog);
    setItems([]);
    setActiveTab('items');
  };

  const handleAddCatalog = async () => {
    try {
      const values = await catalogForm.validateFields();
      setAddCatalogLoading(true);
      // Vendors auto-assign to themselves via API; admin must pick vendorId
      await post('/inventory', values);
      message.success('Catalog created successfully.');
      setAddCatalogOpen(false);
      catalogForm.resetFields();
      fetchCatalogs();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || 'Failed to create catalog.');
    } finally {
      setAddCatalogLoading(false);
    }
  };

  const handleDeleteCatalog = async (id: string) => {
    try {
      await del(`/inventory/${id}`);
      message.success('Catalog deleted.');
      if (selectedCatalog?.id === id) {
        setSelectedCatalog(null);
        setItems([]);
        setActiveTab('catalogs');
      }
      fetchCatalogs();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Delete failed.');
    }
  };

  const openAddItem = () => {
    setEditingItem(null);
    itemForm.resetFields();
    setAddItemOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    itemForm.setFieldsValue({
      hcpcCode: item.hcpcCode,
      description: item.description,
      manufacturerName: item.manufacturerName,
      manufacturerItemNumber: item.manufacturerItemNumber,
      unitOfMeasurement: item.unitOfMeasurement,
      isCustomFit: !!item.isCustomFit,
      itemType: item.itemType ?? inferItemType(item.hcpcCode),
    });
    setAddItemOpen(true);
  };

  const handleSaveItem = async () => {
    if (!selectedCatalog) return;
    try {
      const values = await itemForm.validateFields();
      setAddItemLoading(true);
      const payload = { ...values, isCustomFit: values.isCustomFit ? 1 : 0 };
      if (editingItem) {
        await put(`/inventory/${selectedCatalog.id}/items/${editingItem.id}`, payload);
        message.success('Item updated.');
      } else {
        await post(`/inventory/${selectedCatalog.id}/items`, payload);
        message.success('Item added.');
      }
      setAddItemOpen(false);
      itemForm.resetFields();
      setEditingItem(null);
      fetchItems(selectedCatalog.id);
      // Refresh catalogs to update item count
      fetchCatalogs();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || 'Failed to save item.');
    } finally {
      setAddItemLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!selectedCatalog) return;
    try {
      await del(`/inventory/${selectedCatalog.id}/items/${itemId}`);
      message.success('Item deleted.');
      fetchItems(selectedCatalog.id);
      fetchCatalogs();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Delete failed.');
    }
  };

  // Catalog columns
  const baseCatalogColumns: ColumnsType<Catalog> = [
    ...(!isVendor ? [{
      title: 'Vendor',
      key: 'vendor',
      render: (_: unknown, r: Catalog) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.vendorName || r.vendorId}</Text>
          {r.vendorEmail && <Text type="secondary" style={{ fontSize: 12 }}>{r.vendorEmail}</Text>}
        </Space>
      ),
    }] : []),
    {
      title: 'Catalog ID',
      dataIndex: 'id',
      render: (id: string) => <Text type="secondary" style={{ fontSize: 12 }}>{id}</Text>,
    },
    {
      title: '# Items',
      dataIndex: 'itemCount',
      align: 'center',
      width: 90,
      render: (count: number) => <Tag color={count > 0 ? 'blue' : 'default'}>{count ?? 0}</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 130,
      render: (val: string) => val ? new Date(val).toLocaleDateString() : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, r: Catalog) => (
        <Space>
          <Button size="small" type="link" onClick={() => openCatalog(r)}>
            View Items
          </Button>
          <Popconfirm
            title="Delete this catalog and all its items?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteCatalog(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const { columns: catalogColumns, components: catalogTableComponents } = useResizableColumns(baseCatalogColumns as any[]);

  // Item columns
  const baseItemColumns: ColumnsType<InventoryItem> = [
    { title: 'HCPC Code', dataIndex: 'hcpcCode', width: 120 },
    { title: 'Description', dataIndex: 'description', render: (v: string) => v || '—' },
    { title: 'Manufacturer', dataIndex: 'manufacturerName', render: (v: string) => v || '—' },
    { title: 'Item #', dataIndex: 'manufacturerItemNumber', render: (v: string) => v || '—' },
    { title: 'Unit', dataIndex: 'unitOfMeasurement', render: (v: string) => v || '—' },
    {
      title: 'Type',
      dataIndex: 'itemType',
      align: 'center',
      width: 100,
      render: (v: string) => v === 'LOT'
        ? <Tag color="purple">LOT</Tag>
        : <Tag color="blue">NON-LOT</Tag>,
    },
    {
      title: 'Stock',
      key: 'stock',
      align: 'center',
      width: 90,
      render: (_: unknown, r: InventoryItem) => {
        if (r.itemType !== 'LOT') return <Text type="secondary">—</Text>;
        return (
          <Space size={2} direction="vertical" style={{ lineHeight: 1.2 }}>
            <Text style={{ fontSize: 12 }}>{r.totalOnHand ?? 0} on hand</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.lotCount ?? 0} lot{r.lotCount !== 1 ? 's' : ''}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Custom Fit',
      dataIndex: 'isCustomFit',
      align: 'center',
      width: 100,
      render: (v: number) => v ? <Tag color="purple">Yes</Tag> : <Tag>No</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_: unknown, r: InventoryItem) => (
        <Space>
          {r.itemType === 'LOT' && (
            <Button
              size="small"
              icon={<LotsIcon />}
              onClick={(e) => { e.stopPropagation(); setLotsItem(r); }}
              title="Manage Lots"
            >
              Lots
            </Button>
          )}
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditItem(r)} />
          <Popconfirm
            title="Delete this item?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDeleteItem(r.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];
  const { columns: itemColumns, components: itemTableComponents } = useResizableColumns(baseItemColumns as any[]);

  const tabItems = [
    {
      key: 'catalogs',
      label: <Space><AppstoreOutlined />Vendor Catalogs</Space>,
      children: (
        <Spin spinning={catalogsLoading}>
          <Table
            columns={catalogColumns}
            components={catalogTableComponents}
            dataSource={catalogs.map((c) => ({ ...c, key: c.id }))}
            pagination={{ pageSize: 20 }}
            size="middle"
            locale={{ emptyText: 'No inventory catalogs found.' }}
            onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => openCatalog(r) })}
          />
        </Spin>
      ),
    },
    {
      key: 'items',
      label: <Space><UnorderedListOutlined />Items{selectedCatalog ? ` — ${selectedCatalog.vendorName || selectedCatalog.vendorId}` : ''}</Space>,
      children: (
        <div>
          <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
            <Col>
              {selectedCatalog ? (
                <Space>
                  <Text type="secondary">Catalog for:</Text>
                  <Text strong>{selectedCatalog.vendorName || selectedCatalog.vendorId}</Text>
                  <Button type="link" size="small" onClick={() => setActiveTab('catalogs')}>
                    ← All Catalogs
                  </Button>
                </Space>
              ) : (
                <Text type="secondary">Select a catalog from the Vendor Catalogs tab.</Text>
              )}
            </Col>
            <Col>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openAddItem}
                disabled={!selectedCatalog}
              >
                Add Item
              </Button>
            </Col>
          </Row>
          <Spin spinning={itemsLoading}>
            <Table
              columns={itemColumns}
              components={itemTableComponents}
              dataSource={items.map((item) => ({ ...item, key: item.id }))}
              pagination={{ pageSize: 20 }}
              size="middle"
              locale={{
                emptyText: selectedCatalog
                  ? 'No items in this catalog. Click "Add Item" to add one.'
                  : 'Select a catalog to view items.',
              }}
            />
          </Spin>
        </div>
      ),
    },
  ];

  const totalItems = catalogs.reduce((sum, c) => sum + (c.itemCount ?? 0), 0);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space align="center">
            <InboxOutlined style={{ fontSize: 28, color: '#1677ff' }} />
            <div>
              <Title level={3} style={{ margin: 0 }}>Inventory Management</Title>
              <Text type="secondary">
                {isAdmin
                  ? 'Manage product catalogs for all vendors'
                  : 'Manage your product catalog and HCPC items'}
              </Text>
            </div>
          </Space>
        </Col>
        <Col>
          {activeTab === 'catalogs' && (isAdmin || isVendor) && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                catalogForm.resetFields();
                setAddCatalogOpen(true);
              }}
            >
              {isAdmin ? 'Add Vendor Catalog' : 'Create My Catalog'}
            </Button>
          )}
          {activeTab === 'items' && selectedCatalog && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddItem}>
              Add Item
            </Button>
          )}
        </Col>
      </Row>

      {/* Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value">{catalogs.length}</div>
            <div className="stat-label">Total Catalogs</div>
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value">{totalItems}</div>
            <div className="stat-label">Total Items</div>
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value" style={{ fontSize: selectedCatalog ? 14 : 28, wordBreak: 'break-all' }}>
              {selectedCatalog ? selectedCatalog.id : '—'}
            </div>
            <div className="stat-label">Viewing Catalog</div>
          </StatCard>
        </Col>
        <Col xs={12} sm={6}>
          <StatCard size="small">
            <div className="stat-value">{selectedCatalog ? items.length : '—'}</div>
            <div className="stat-label">Items in View</div>
          </StatCard>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: '0 0 8px 0' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ padding: '0 24px' }}
          tabBarStyle={{ marginBottom: 0 }}
        />
      </Card>

      {/* Add Catalog Modal */}
      <Modal
        title={isAdmin ? 'Add Vendor Catalog' : 'Create Inventory Catalog'}
        open={addCatalogOpen}
        onOk={handleAddCatalog}
        onCancel={() => { setAddCatalogOpen(false); catalogForm.resetFields(); }}
        okText="Create Catalog"
        confirmLoading={addCatalogLoading}
        destroyOnClose
      >
        <Form form={catalogForm} layout="vertical" style={{ marginTop: 16 }}>
          {isAdmin && (
            <Form.Item
              name="vendorId"
              label="Vendor"
              rules={[{ required: true, message: 'Select a vendor to assign this catalog to.' }]}
              extra="Each vendor has one product catalog of HCPC items they can supply."
            >
              <Select
                placeholder="Select vendor"
                loading={vendorsLoading}
                showSearch
                optionFilterProp="label"
                options={vendorList.map((v) => ({ label: v.name, value: v.id }))}
              />
            </Form.Item>
          )}
          {!isAdmin && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              This catalog will be created for your vendor account and will contain the HCPC-coded items you can supply.
            </Text>
          )}
        </Form>
      </Modal>

      {/* Lots Drawer */}
      {lotsItem && selectedCatalog && (
        <InventoryLotsDrawer
          open={!!lotsItem}
          item={lotsItem}
          catalogId={selectedCatalog.id}
          onClose={() => setLotsItem(null)}
          onChanged={() => fetchItems(selectedCatalog.id)}
        />
      )}

      {/* Add / Edit Item Modal */}
      <Modal
        title={editingItem
          ? 'Edit Item'
          : `Add Item${selectedCatalog ? ` — ${selectedCatalog.vendorName || selectedCatalog.vendorId}` : ''}`}
        open={addItemOpen}
        onOk={handleSaveItem}
        onCancel={() => { setAddItemOpen(false); itemForm.resetFields(); setEditingItem(null); }}
        okText={editingItem ? 'Save Changes' : 'Add Item'}
        confirmLoading={addItemLoading}
        destroyOnClose
      >
        <Form form={itemForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="hcpcCode"
                label="HCPC Code"
                rules={[{ required: true, message: 'HCPC code is required.' }]}
              >
                <Input
                  placeholder="e.g., L1906"
                  onChange={(e) => {
                    const inferred = inferItemType(e.target.value);
                    itemForm.setFieldValue('itemType', inferred);
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="itemType"
                label="Item Type"
                initialValue="NON_LOT"
                extra="LOT items require a lot number per supply."
              >
                <Radio.Group buttonStyle="solid" size="small">
                  <Radio.Button value="NON_LOT">NON-LOT</Radio.Button>
                  <Radio.Button value="LOT">LOT</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input placeholder="Item description" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="manufacturerName" label="Manufacturer">
                <Input placeholder="e.g., Ottobock" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="manufacturerItemNumber" label="Item Number">
                <Input placeholder="Manufacturer's item #" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unitOfMeasurement" label="Unit of Measurement">
                <Input placeholder="e.g., EA, PR, BX" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isCustomFit" label="Custom Fit Required" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default InventoryManagement;
