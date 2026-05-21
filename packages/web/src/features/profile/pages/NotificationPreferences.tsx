import React, { useEffect, useState } from 'react';
import { Button, Card, Form, message, Switch, Typography, Divider, Spin } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { get, put } from '../../../api/client';

const { Title, Text } = Typography;

interface Prefs {
  orderCreated: boolean;
  orderStatusChanged: boolean;
  invoiceGenerated: boolean;
  invoicePaid: boolean;
  chatMessage: boolean;
  systemAlerts: boolean;
}

const DEFAULT_PREFS: Prefs = {
  orderCreated: true,
  orderStatusChanged: true,
  invoiceGenerated: true,
  invoicePaid: true,
  chatMessage: true,
  systemAlerts: true,
};

const PREF_LABELS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key: 'orderCreated', label: 'New Order', desc: 'Notify when a new supply order is created' },
  { key: 'orderStatusChanged', label: 'Order Status Change', desc: 'Notify on every status transition' },
  { key: 'invoiceGenerated', label: 'Invoice Generated', desc: 'Notify when an invoice is automatically created' },
  { key: 'invoicePaid', label: 'Invoice Paid', desc: 'Notify when a payment is recorded against an invoice' },
  { key: 'chatMessage', label: 'Chat Message', desc: 'Notify when a new chat message arrives' },
  { key: 'systemAlerts', label: 'System Alerts', desc: 'Contract expiry, credential renewals, and platform notices' },
];

const NotificationPreferences: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const userId = sessionStorage.getItem('userId') ?? '';

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    get(`/api/users/${userId}/notification-settings`)
      .then((res: any) => {
        const prefs = res?.preferences ?? DEFAULT_PREFS;
        form.setFieldsValue(prefs);
      })
      .catch(() => form.setFieldsValue(DEFAULT_PREFS))
      .finally(() => setLoading(false));
  }, [userId, form]);

  const handleSave = async (values: Prefs) => {
    if (!userId) return;
    setSaving(true);
    try {
      await put(`/api/users/${userId}/notification-settings`, { preferences: values });
      message.success('Notification preferences saved');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', marginTop: 60 }} />;

  return (
    <div style={{ maxWidth: 560, margin: '32px auto', padding: '0 16px' }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <BellOutlined style={{ fontSize: 22, color: '#1BAEE5' }} />
          <Title level={4} style={{ margin: 0 }}>Notification Preferences</Title>
        </div>
        <Text type="secondary">Choose which events trigger in-app and email notifications.</Text>
        <Divider />
        <Form form={form} onFinish={handleSave} layout="vertical">
          {PREF_LABELS.map(({ key, label, desc }) => (
            <Form.Item
              key={key}
              name={key}
              valuePropName="checked"
              style={{ marginBottom: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>{label}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{desc}</Text>
                </div>
                <Switch />
              </div>
            </Form.Item>
          ))}
          <Divider />
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save Preferences
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default NotificationPreferences;
