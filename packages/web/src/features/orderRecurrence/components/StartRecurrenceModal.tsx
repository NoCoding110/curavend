/**
 * Modal launched from an order detail page to convert that order into a
 * recurring template. Encapsulates the create-plan form.
 */
import React, { useState } from 'react';
import { Modal, Form, Select, InputNumber, DatePicker, Switch, Space, Typography, Tag, message } from 'antd';
import dayjs from 'dayjs';
import { orderRecurrenceApi, type RecurrenceFrequencyUnit } from '../../../api/orderRecurrence';

const { Text } = Typography;

interface Props {
  orderId: string;
  orderIdentifier?: string | null;
  open: boolean;
  onClose: () => void;
  onCreated?: (planId: string) => void;
}

const StartRecurrenceModal: React.FC<Props> = ({ orderId, orderIdentifier, open, onClose, onCreated }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }
    setSubmitting(true);
    try {
      const plan = await orderRecurrenceApi.create(orderId, {
        frequencyUnit: values.frequencyUnit as RecurrenceFrequencyUnit,
        frequencyValue: Number(values.frequencyValue),
        anchorDay: values.anchorDay ?? undefined,
        startDate: dayjs(values.startDate).format('YYYY-MM-DD'),
        endDate: values.endDate ? dayjs(values.endDate).format('YYYY-MM-DD') : undefined,
        totalOccurrences: values.totalOccurrences ?? undefined,
        leadTimeDays: values.leadTimeDays ?? 3,
        requireReauthEvery: values.requireReauthEvery ?? undefined,
      });
      message.success('Recurring schedule created');
      onClose();
      form.resetFields();
      onCreated?.(plan.id);
    } catch (err: any) {
      message.error(`Create failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <span>Convert to recurring order</span>
          {orderIdentifier && <Tag>{orderIdentifier}</Tag>}
        </Space>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Create schedule"
      okButtonProps={{ loading: submitting }}
      width={620}
    >
      <Text type="secondary">
        Each scheduled occurrence will spawn a new order with this template's items + patient info.
      </Text>
      <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ frequencyUnit: 'WEEKS', frequencyValue: 4, leadTimeDays: 3 }}>
        <Space.Compact block>
          <Form.Item name="frequencyValue" label="Every" rules={[{ required: true }]} style={{ flex: 1 }}>
            <InputNumber min={1} max={365} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="frequencyUnit" label="Unit" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select options={[
              { value: 'DAYS', label: 'days' },
              { value: 'WEEKS', label: 'weeks' },
              { value: 'MONTHS', label: 'months' },
              { value: 'QUARTERS', label: 'quarters' },
            ]} />
          </Form.Item>
        </Space.Compact>
        <Space.Compact block>
          <Form.Item name="startDate" label="Start date" rules={[{ required: true }]} style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="endDate" label="End date (optional)" style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Space.Compact>
        <Space.Compact block>
          <Form.Item name="totalOccurrences" label="Cap (optional)" tooltip="Stops after N occurrences. Blank = open-ended." style={{ flex: 1 }}>
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="leadTimeDays" label="Lead time (days)" tooltip="Spawn the child order this many days before each scheduled date." style={{ flex: 1 }}>
            <InputNumber min={0} max={60} style={{ width: '100%' }} />
          </Form.Item>
        </Space.Compact>
        <Form.Item name="requireReauthEvery" label="Reauth every N occurrences" tooltip="Auto-pause after this many occurrences to force a re-approval (e.g., insurance reauth).">
          <InputNumber min={1} max={50} style={{ width: '100%' }} placeholder="never" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StartRecurrenceModal;
