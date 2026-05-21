import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Typography, Space } from 'antd';
import { labsApi, type LabGroup, type LabKitSite } from '../../../api/labs';

const { Title } = Typography;

const LabKitSitesPage: React.FC = () => {
  const [sites, setSites] = useState<LabKitSite[]>([]);
  const [groups, setGroups] = useState<LabGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, g] = await Promise.all([labsApi.listKitSites(), labsApi.listGroups()]);
      setSites(s.data);
      setGroups(g.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (values: any) => {
    try {
      await labsApi.createKitSite(values);
      message.success('Kit site created');
      setModalOpen(false);
      form.resetFields();
      refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Create failed');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Kit Sites</Title>
        <Button type="primary" onClick={() => setModalOpen(true)}>+ New Site</Button>
      </Space>
      <Card>
        <Table
          loading={loading}
          dataSource={sites}
          rowKey="id"
          columns={[
            { title: 'Site Name', dataIndex: 'siteName', key: 'siteName' },
            { title: 'Site #', dataIndex: 'siteNumber', key: 'siteNumber' },
            { title: 'Address', key: 'addr', render: (_, r) => `${r.addressLine1}, ${r.city}, ${r.state} ${r.zip}` },
            { title: 'Contact', key: 'contact', render: (_, r) => r.contactName || '—' },
          ]}
        />
      </Card>
      <Modal
        title="New Kit Site"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="Lab Group" name="labGroupId" rules={[{ required: true }]}>
            <Select options={groups.map((g) => ({ value: g.id, label: g.name }))} />
          </Form.Item>
          <Form.Item label="Site Name" name="siteName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Site Number" name="siteNumber">
            <Input />
          </Form.Item>
          <Form.Item label="Address Line 1" name="addressLine1" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Address Line 2" name="addressLine2">
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item label="City" name="city" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Input />
            </Form.Item>
            <Form.Item label="State" name="state" rules={[{ required: true }]}>
              <Input maxLength={2} style={{ width: 80 }} />
            </Form.Item>
            <Form.Item label="ZIP" name="zip" rules={[{ required: true }]}>
              <Input maxLength={10} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item label="Contact Name" name="contactName">
            <Input />
          </Form.Item>
          <Form.Item label="Contact Phone" name="contactPhone">
            <Input />
          </Form.Item>
          <Form.Item label="Contact Email" name="contactEmail">
            <Input type="email" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LabKitSitesPage;
