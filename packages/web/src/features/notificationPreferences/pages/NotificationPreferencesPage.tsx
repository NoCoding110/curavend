/**
 * Per-tenant notification preferences settings.
 *
 * Lets a hospital/vendor admin configure which events fire emails to which
 * recipients. Falls back to system defaults when no preference is set.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Select,
  Input,
  Space,
  Tag,
  message,
  Popconfirm,
  Alert,
  Switch,
} from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import {
  notificationPreferencesApi,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_RECIPIENT_TYPES,
  type NotificationPreference,
  type NotificationEventType,
  type NotificationChannel,
  type NotificationRecipientType,
} from '../../../api/notificationPreferences';
import { useUserRoles } from '../../../hooks/useUserRoles';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const CHANNEL_COLOR: Record<NotificationChannel, string> = {
  EMAIL: 'blue', SMS: 'gold', IN_APP: 'green', WEBHOOK: 'purple',
};

const NotificationPreferencesPage: React.FC = () => {
  const { isAdmin, isHospital, isVendor, userData } = useUserRoles();
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();

  const scope = useMemo(() => {
    if (isHospital && userData?.hospitalId) return { type: 'HOSPITAL', id: userData.hospitalId };
    if (isVendor && userData?.vendorId) return { type: 'VENDOR', id: userData.vendorId };
    return null;
  }, [isHospital, isVendor, userData?.hospitalId, userData?.vendorId]);

  const load = useCallback(async () => {
    if (!scope) return;
    setLoading(true);
    try {
      const resp = await notificationPreferencesApi.list({ scopeType: scope.type, scopeId: scope.id });
      setItems(resp.items ?? []);
    } catch (err: any) {
      message.error(`Load failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    if (!scope) return;
    let values: any;
    try { values = await form.validateFields(); } catch { return; }
    try {
      await notificationPreferencesApi.create({
        scopeType: scope.type,
        scopeId: scope.id,
        eventType: values.eventType,
        channel: values.channel,
        recipientType: values.recipientType,
        customEmail: values.customEmail || undefined,
        isActive: true,
      });
      message.success('Preference added');
      setAddOpen(false);
      form.resetFields();
      await load();
    } catch (err: any) {
      message.error(`Add failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  const toggleActive = async (row: NotificationPreference) => {
    try {
      await notificationPreferencesApi.update(row.id, { isActive: !row.isActive });
      await load();
    } catch (err: any) {
      message.error(`Toggle failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  const remove = async (row: NotificationPreference) => {
    try {
      await notificationPreferencesApi.delete(row.id);
      message.success('Deleted');
      await load();
    } catch (err: any) {
      message.error(`Delete failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  if (!scope) {
    return (
      <PageWrap>
        <Alert message="No scope" description="Only hospital and vendor users can configure notification preferences." type="warning" />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Notification Preferences</Title>
            <Text type="secondary">
              Configure which events fire emails to which recipients. {scope.type.toLowerCase()} scope: <code>{scope.id}</code>.
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Add preference
            </Button>
          </Space>
        </Space>
      </Card>

      <Alert
        message="Default behavior"
        description="If no preferences are configured for an event, the system fans out to PATIENT + CONTACT via EMAIL for order events, and to CONTACT only for invoice events."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Table<NotificationPreference>
          loading={loading}
          dataSource={items}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Event', dataIndex: 'eventType', render: (v) => <Text strong>{v}</Text> },
            {
              title: 'Channel', dataIndex: 'channel', width: 110,
              render: (v: NotificationChannel) => <Tag color={CHANNEL_COLOR[v]}>{v}</Tag>,
            },
            {
              title: 'Recipient', dataIndex: 'recipientType', width: 160,
              render: (v: NotificationRecipientType, r) => (
                <Space>
                  <Tag>{v}</Tag>
                  {v === 'CUSTOM' && r.customEmail && <Text type="secondary" style={{ fontSize: 11 }}>{r.customEmail}</Text>}
                </Space>
              ),
            },
            {
              title: 'Active', dataIndex: 'isActive', width: 90, align: 'center',
              render: (n: number, r) => <Switch checked={!!n} onChange={() => toggleActive(r)} size="small" />,
            },
            {
              title: '', width: 80,
              render: (_, r) => (
                <Popconfirm title="Delete this preference?" onConfirm={() => remove(r)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
            },
          ]}
          locale={{ emptyText: 'No custom preferences — system defaults apply.' }}
        />
      </Card>

      <Modal
        title="Add notification preference"
        open={addOpen}
        onCancel={() => { setAddOpen(false); form.resetFields(); }}
        onOk={handleAdd}
        okText="Add"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="eventType" label="Event type" rules={[{ required: true }]}>
            <Select
              options={NOTIFICATION_EVENT_TYPES.map((t) => ({ value: t, label: t }))}
              showSearch
            />
          </Form.Item>
          <Form.Item name="channel" label="Channel" rules={[{ required: true }]} initialValue="EMAIL">
            <Select options={NOTIFICATION_CHANNELS.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="recipientType" label="Recipient" rules={[{ required: true }]}>
            <Select options={NOTIFICATION_RECIPIENT_TYPES.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item
            name="customEmail"
            label="Custom email"
            tooltip="Required when recipient type = CUSTOM"
          >
            <Input placeholder="someone@hospital.org" />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrap>
  );
};

export default NotificationPreferencesPage;
