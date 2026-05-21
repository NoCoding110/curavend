import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, message, Typography, Space, Tag } from 'antd';
import { labsApi, type LabGroup } from '../../../api/labs';

const { Title } = Typography;

const LabGroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<LabGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await labsApi.listGroups();
      setGroups(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const submit = async (values: any) => {
    try {
      await labsApi.createGroup(values);
      message.success('Lab group created');
      setModalOpen(false);
      form.resetFields();
      refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Create failed');
    }
  };

  const remove = async (id: string) => {
    Modal.confirm({
      title: 'Delete this lab group?',
      okType: 'danger',
      onOk: async () => {
        try {
          await labsApi.deleteGroup(id);
          message.success('Deleted');
          refresh();
        } catch (err: any) {
          message.error(err.response?.data?.error || 'Delete failed');
        }
      },
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Lab Groups</Title>
        <Button type="primary" onClick={() => setModalOpen(true)}>+ New Group</Button>
      </Space>
      <Card>
        <Table
          loading={loading}
          dataSource={groups}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name', key: 'name' },
            {
              title: 'Type',
              dataIndex: 'groupType',
              key: 'groupType',
              render: (t: string) => <Tag>{t}</Tag>,
            },
            { title: 'Description', dataIndex: 'description', key: 'description' },
            {
              title: 'Created',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (s: string) => new Date(s).toLocaleDateString(),
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_, r) => (
                <Button danger type="text" onClick={() => remove(r.id)}>Delete</Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title="New Lab Group"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="e.g. LabCorp SingleSite" />
          </Form.Item>
          <Form.Item label="Group Type" name="groupType" rules={[{ required: true }]}>
            <Select options={[
              { value: 'SINGLE_SITE', label: 'Single Site' },
              { value: 'D2P', label: 'Direct-to-Patient (D2P)' },
            ]} />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LabGroupsPage;
