/**
 * Per-order backorder panel. Auto-hides when no backorders exist.
 * Shown on order detail below DME Document Packet.
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
  Button,
  Modal,
  InputNumber,
  Input,
  message,
  DatePicker,
} from 'antd';
import { WarningOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { get, post, put } from '../../../api/client';

interface Backorder {
  id: string;
  orderId: string;
  hcpcCode: string | null;
  itemCode: string | null;
  description: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  status: 'OPEN' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';
  expectedFulfillmentDate: string | null;
  vendorReference: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'red',
  PARTIALLY_FULFILLED: 'orange',
  FULFILLED: 'green',
  CANCELLED: 'default',
};

export const BackordersPanel: React.FC<{ orderId: string }> = ({ orderId }) => {
  const [rows, setRows] = useState<Backorder[]>([]);
  const [loading, setLoading] = useState(false);
  const [fillModal, setFillModal] = useState<{ bo: Backorder; qty: number; notes: string } | null>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Backorder[] }>(`/backorders/order/${orderId}`);
      setRows(r.items ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId]);

  // Auto-hide when no backorders
  if (rows.length === 0 && !loading) return null;

  const open = rows.filter((r) => r.status === 'OPEN' || r.status === 'PARTIALLY_FULFILLED').length;
  const fulfilled = rows.filter((r) => r.status === 'FULFILLED').length;

  const fulfill = async () => {
    if (!fillModal) return;
    try {
      await post(`/backorders/${fillModal.bo.id}/fulfill`, {
        quantity: fillModal.qty,
        notes: fillModal.notes || undefined,
      });
      message.success('Backorder fill recorded');
      setFillModal(null);
      void fetch();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const cancelBo = (bo: Backorder) => {
    Modal.confirm({
      title: 'Cancel this backorder?',
      onOk: async () => {
        await post(`/backorders/${bo.id}/cancel`, {});
        message.success('Cancelled');
        void fetch();
      },
    });
  };

  const updateExpected = async (bo: Backorder, date: string | null) => {
    try {
      await put(`/backorders/${bo.id}`, { expectedFulfillmentDate: date });
      void fetch();
    } catch (err: any) {
      message.error('Failed to update');
    }
  };

  return (
    <>
      <Card
        size="small"
        title={
          <Space>
            <WarningOutlined style={{ color: open > 0 ? '#cf1322' : '#52c41a' }} />
            <span>Backorders</span>
            {open > 0 && <Tag color="red">{open} open</Tag>}
            {fulfilled > 0 && <Tag color="green">{fulfilled} fulfilled</Tag>}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Table<Backorder>
          size="small"
          rowKey="id"
          loading={loading}
          pagination={false}
          dataSource={rows}
          columns={[
            { title: 'HCPC / Code', dataIndex: 'hcpcCode', width: 110 },
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Ordered', dataIndex: 'quantityOrdered', width: 80, align: 'right' },
            { title: 'Received', dataIndex: 'quantityReceived', width: 80, align: 'right' },
            {
              title: 'Remaining', dataIndex: 'quantityRemaining', width: 90, align: 'right',
              render: (v: number) => <strong style={{ color: v > 0 ? '#cf1322' : '#52c41a' }}>{v}</strong>,
            },
            {
              title: 'Status', dataIndex: 'status', width: 130,
              render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s.replace('_', ' ')}</Tag>,
            },
            {
              title: 'Expected', dataIndex: 'expectedFulfillmentDate', width: 160,
              render: (v: string | null, r) => (
                <DatePicker
                  size="small"
                  value={v ? dayjs(v) : null}
                  onChange={(d) => updateExpected(r, d ? dayjs(d).format('YYYY-MM-DD') : null)}
                  disabled={r.status === 'FULFILLED' || r.status === 'CANCELLED'}
                />
              ),
            },
            { title: 'Vendor ref', dataIndex: 'vendorReference', width: 130 },
            {
              title: '', width: 180,
              render: (_, r) => r.status === 'OPEN' || r.status === 'PARTIALLY_FULFILLED' ? (
                <Space>
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                    onClick={() => setFillModal({ bo: r, qty: r.quantityRemaining, notes: '' })}>
                    Fill
                  </Button>
                  <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => cancelBo(r)} />
                </Space>
              ) : null,
            },
          ]}
        />
      </Card>

      <Modal
        title={fillModal ? `Record fill for ${fillModal.bo.hcpcCode}` : ''}
        open={!!fillModal}
        onCancel={() => setFillModal(null)}
        onOk={fulfill}
        okText="Record"
      >
        {fillModal && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text>Remaining: <strong>{fillModal.bo.quantityRemaining}</strong></Typography.Text>
            <InputNumber
              min={1}
              max={fillModal.bo.quantityRemaining}
              value={fillModal.qty}
              onChange={(v) => setFillModal({ ...fillModal, qty: Number(v) })}
              style={{ width: '100%' }}
              addonBefore="Quantity received"
            />
            <Input.TextArea
              rows={2}
              placeholder="Notes / vendor message"
              value={fillModal.notes}
              onChange={(e) => setFillModal({ ...fillModal, notes: e.target.value })}
            />
          </Space>
        )}
      </Modal>
    </>
  );
};

export default BackordersPanel;
