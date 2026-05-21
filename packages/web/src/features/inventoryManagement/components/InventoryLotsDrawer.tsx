/**
 * InventoryLotsDrawer — manage per-lot physical stock for a LOT-typed SKU.
 *
 * Shows a table of lots (lot number, qty on hand, expiration, notes) with
 * inline add / edit / delete. Opens as an Ant Design Drawer from the
 * InventoryManagement items table via the "Lots" action button.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer, Table, Button, Space, Form, Input, InputNumber,
  Popconfirm, Typography, message, Tag, DatePicker, Modal, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { get, post, put, del } from '../../../api/client';

const { Text } = Typography;

interface InventoryLot {
  id: string;
  inventoryItemId: string;
  lotNumber: string;
  quantityOnHand: number;
  expirationDate: string | null;
  manufacturerDate: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  item: {
    id: string;
    inventoryId: string;
    hcpcCode: string;
    description: string | null;
    lotCount?: number;
    totalOnHand?: number;
  };
  catalogId: string;
  onClose: () => void;
  /** Called after any mutation so the parent can refresh item list. */
  onChanged: () => void;
}

export const InventoryLotsDrawer: React.FC<Props> = ({
  open, item, catalogId, onClose, onChanged,
}) => {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [lotModalOpen, setLotModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<InventoryLot | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<{ items: InventoryLot[] }>(
        `/inventory/${catalogId}/items/${item.id}/lots`,
      );
      setLots(data.items || []);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load lots.');
    } finally {
      setLoading(false);
    }
  }, [catalogId, item.id]);

  useEffect(() => {
    if (open) fetchLots();
  }, [open, fetchLots]);

  const openAdd = () => {
    setEditingLot(null);
    form.resetFields();
    setLotModalOpen(true);
  };

  const openEdit = (lot: InventoryLot) => {
    setEditingLot(lot);
    form.setFieldsValue({
      lotNumber: lot.lotNumber,
      quantityOnHand: lot.quantityOnHand,
      expirationDate: lot.expirationDate ? dayjs(lot.expirationDate) : null,
      manufacturerDate: lot.manufacturerDate ? dayjs(lot.manufacturerDate) : null,
      receivedAt: lot.receivedAt ? dayjs(lot.receivedAt) : null,
      notes: lot.notes,
    });
    setLotModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        ...values,
        expirationDate: values.expirationDate ? values.expirationDate.format('YYYY-MM-DD') : null,
        manufacturerDate: values.manufacturerDate ? values.manufacturerDate.format('YYYY-MM-DD') : null,
        receivedAt: values.receivedAt ? values.receivedAt.format('YYYY-MM-DD') : null,
      };
      if (editingLot) {
        await put(`/inventory/${catalogId}/items/${item.id}/lots/${editingLot.id}`, payload);
        message.success('Lot updated.');
      } else {
        await post(`/inventory/${catalogId}/items/${item.id}/lots`, payload);
        message.success('Lot added.');
      }
      setLotModalOpen(false);
      form.resetFields();
      setEditingLot(null);
      fetchLots();
      onChanged();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || 'Failed to save lot.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (lot: InventoryLot) => {
    try {
      await del(`/inventory/${catalogId}/items/${item.id}/lots/${lot.id}`);
      message.success('Lot deleted.');
      fetchLots();
      onChanged();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Delete failed.');
    }
  };

  const columns = [
    {
      title: 'Lot Number',
      dataIndex: 'lotNumber',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Qty on Hand',
      dataIndex: 'quantityOnHand',
      align: 'center' as const,
      width: 100,
      render: (v: number) => (
        <Tag color={v > 0 ? 'green' : 'default'}>{v}</Tag>
      ),
    },
    {
      title: 'Expiration',
      dataIndex: 'expirationDate',
      width: 120,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">—</Text>;
        const expired = dayjs(v).isBefore(dayjs(), 'day');
        const soon = !expired && dayjs(v).diff(dayjs(), 'day') <= 30;
        return (
          <Text style={{ color: expired ? '#ff4d4f' : soon ? '#faad14' : undefined }}>
            {dayjs(v).format('MM/DD/YYYY')}
            {expired && <Text type="danger"> (Expired)</Text>}
            {soon && <Text style={{ color: '#faad14' }}> (Soon)</Text>}
          </Text>
        );
      },
    },
    {
      title: 'Received',
      dataIndex: 'receivedAt',
      width: 110,
      render: (v: string | null) => v ? dayjs(v).format('MM/DD/YYYY') : '—',
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      render: (v: string | null) => v || '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      render: (_: unknown, row: InventoryLot) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm
            title={
              row.quantityOnHand > 0
                ? `This lot has ${row.quantityOnHand} on hand. Zero it out before deleting.`
                : 'Delete this lot?'
            }
            okText={row.quantityOnHand > 0 ? 'OK' : 'Delete'}
            okButtonProps={{ danger: row.quantityOnHand === 0 }}
            showCancel={row.quantityOnHand === 0}
            onConfirm={() => row.quantityOnHand === 0 && handleDelete(row)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const totalOnHand = lots.reduce((s, l) => s + (l.quantityOnHand ?? 0), 0);

  return (
    <>
      <Drawer
        title={
          <Space direction="vertical" size={0}>
            <Text strong>Manage Lots — {item.hcpcCode}</Text>
            {item.description && <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>}
          </Space>
        }
        width={760}
        open={open}
        onClose={onClose}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            Add Lot
          </Button>
        }
        destroyOnClose
      >
        <Space style={{ marginBottom: 16 }}>
          <Tag color="blue">{lots.length} lot{lots.length !== 1 ? 's' : ''}</Tag>
          <Tag color="green">{totalOnHand} total on hand</Tag>
        </Space>
        <Table
          loading={loading}
          dataSource={lots.map((l) => ({ ...l, key: l.id }))}
          columns={columns}
          size="small"
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: 'No lots yet. Click "Add Lot" to add inventory.' }}
        />
      </Drawer>

      {/* Add / Edit Lot Modal */}
      <Modal
        title={editingLot ? `Edit Lot — ${editingLot.lotNumber}` : `Add Lot — ${item.hcpcCode}`}
        open={lotModalOpen}
        onOk={handleSave}
        onCancel={() => { setLotModalOpen(false); form.resetFields(); setEditingLot(null); }}
        okText={editingLot ? 'Save Changes' : 'Add Lot'}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="lotNumber"
                label="Lot Number"
                rules={[{ required: true, message: 'Lot number is required.' }]}
              >
                <Input
                  placeholder="e.g., LOT2024-001"
                  disabled={!!editingLot}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="quantityOnHand"
                label="Quantity on Hand"
                rules={[{ required: true, message: 'Required.' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="expirationDate" label="Expiration Date">
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="manufacturerDate" label="Manufacturer Date">
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="receivedAt" label="Received Date">
                <DatePicker style={{ width: '100%' }} format="MM/DD/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Optional notes about this lot" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default InventoryLotsDrawer;
