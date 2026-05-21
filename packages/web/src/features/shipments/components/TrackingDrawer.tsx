/**
 * Tracking entry drawer — opened from order detail. Lets vendor users enter
 * carrier + tracking number for the order's primary shipment and view any
 * existing shipments.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer,
  Space,
  Form,
  Input,
  Select,
  DatePicker,
  Switch,
  InputNumber,
  Button,
  Table,
  Tag,
  Typography,
  message,
  Empty,
  Divider,
} from 'antd';
import { TruckOutlined, LinkOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { shipmentsApi, type Shipment, type CarrierCode } from '../../../api/shipments';

const { Text } = Typography;

interface Props {
  orderId: string;
  orderIdentifier?: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

const TrackingDrawer: React.FC<Props> = ({ orderId, orderIdentifier, open, onClose, onUpdated }) => {
  const [form] = Form.useForm();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [carriers, setCarriers] = useState<Array<{ code: string; name: string }>>([]);

  const load = useCallback(async () => {
    if (!orderId || !open) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        shipmentsApi.listForOrder(orderId),
        shipmentsApi.listCarriers(),
      ]);
      setShipments(s.items ?? []);
      setCarriers(c.items ?? []);
    } catch (err: any) {
      message.error(`Load failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [orderId, open]);

  useEffect(() => { void load(); }, [load]);

  const handleSubmit = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }
    setSubmitting(true);
    try {
      await shipmentsApi.setTracking(orderId, {
        carrierCode: values.carrierCode,
        carrierServiceLevel: values.carrierServiceLevel,
        trackingNumber: values.trackingNumber.trim(),
        shipmentDate: values.shipmentDate ? dayjs(values.shipmentDate).format('YYYY-MM-DD') : undefined,
        expectedDeliveryDate: values.expectedDeliveryDate ? dayjs(values.expectedDeliveryDate).format('YYYY-MM-DD') : undefined,
        signatureRequired: !!values.signatureRequired,
        insuredValueCents: values.insuredValueCents != null ? Math.round(Number(values.insuredValueCents) * 100) : undefined,
      });
      message.success('Tracking saved');
      form.resetFields();
      await load();
      onUpdated?.();
    } catch (err: any) {
      message.error(`Save failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <Space>
          <TruckOutlined />
          <span>Tracking</span>
          {orderIdentifier && <Tag>{orderIdentifier}</Tag>}
        </Space>
      }
      width={620}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong>Existing shipments ({shipments.length})</Text>
          <Table
            size="small"
            loading={loading}
            dataSource={shipments}
            rowKey="id"
            pagination={false}
            style={{ marginTop: 8 }}
            columns={[
              { title: '#', dataIndex: 'shipmentSequence', width: 40 },
              { title: 'Carrier', dataIndex: 'carrierCode', width: 90 },
              {
                title: 'Tracking',
                render: (_, r) => r.trackingUrl ? (
                  <a href={r.trackingUrl} target="_blank" rel="noreferrer"><LinkOutlined /> {r.trackingNumber}</a>
                ) : <span>{r.trackingNumber ?? '—'}</span>,
              },
              { title: 'Shipped', dataIndex: 'shipmentDate', width: 100 },
              { title: 'Expected', dataIndex: 'expectedDeliveryDate', width: 110 },
              { title: 'Status', dataIndex: 'latestStatus', width: 100, render: (v) => v ?? <Text type="secondary">—</Text> },
            ]}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No shipments yet" /> }}
          />
        </div>

        <Divider style={{ margin: '8px 0' }} />

        <div>
          <Text strong>Add / update tracking</Text>
          <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
            <Space.Compact block>
              <Form.Item name="carrierCode" label="Carrier" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Select options={carriers.map((c) => ({ value: c.code, label: c.name }))} placeholder="Pick carrier" />
              </Form.Item>
              <Form.Item name="carrierServiceLevel" label="Service" style={{ flex: 1 }}>
                <Select allowClear options={[
                  { value: 'GROUND', label: 'Ground' },
                  { value: 'OVERNIGHT', label: 'Overnight' },
                  { value: 'TWO_DAY', label: 'Two-day' },
                  { value: 'PRIORITY', label: 'Priority' },
                  { value: 'STANDARD', label: 'Standard' },
                ]} />
              </Form.Item>
            </Space.Compact>
            <Form.Item name="trackingNumber" label="Tracking number" rules={[{ required: true }]}>
              <Input placeholder="e.g. 1Z999AA1012345678" />
            </Form.Item>
            <Space.Compact block>
              <Form.Item name="shipmentDate" label="Ship date" style={{ flex: 1 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="expectedDeliveryDate" label="Expected delivery" style={{ flex: 1 }}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Space.Compact>
            <Space.Compact block>
              <Form.Item name="signatureRequired" label="Signature required" valuePropName="checked" style={{ flex: 1 }}>
                <Switch />
              </Form.Item>
              <Form.Item name="insuredValueCents" label="Insured value ($)" style={{ flex: 1 }}>
                <InputNumber style={{ width: '100%' }} min={0} step={1} />
              </Form.Item>
            </Space.Compact>
            <Button type="primary" onClick={handleSubmit} loading={submitting} block>
              Save tracking
            </Button>
          </Form>
        </div>
      </Space>
    </Drawer>
  );
};

export default TrackingDrawer;
