import React, { useEffect, useState } from 'react';
import {
  Button, Card, Col, Descriptions, Drawer, Form, Input, message,
  Popconfirm, Row, Space, Table, Tag, Typography,
} from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post, put, del } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const HospitalsPage: React.FC = () => {
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const d = await get<any>('/hospitals');
      setHospitals(d.items ?? (Array.isArray(d) ? d : []));
    } catch {
      message.error('Failed to load hospitals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (hospital: any) => {
    setEditing(hospital);
    form.setFieldsValue({
      name: hospital.name,
      email: hospital.email,
      contact: hospital.contact,
      contactPerson: hospital.contactPerson,
      city: hospital.city,
      state: hospital.state,
      zip: hospital.zip,
      streetAddress: hospital.streetAddress,
    });
    setDrawerOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await put(`/hospitals/${editing.id}`, values);
        message.success('Hospital updated');
      } else {
        await post('/hospitals', values);
        message.success('Hospital created');
      }
      setDrawerOpen(false);
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await del(`/hospitals/${id}`);
      message.success('Hospital deleted');
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const viewDetail = (hospital: any) => {
    setSelected(hospital);
    setDetailOpen(true);
  };

  const baseColumns = [
    { title: 'Name', dataIndex: 'name', sorter: (a: any, b: any) => a.name.localeCompare(b.name) },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Contact', dataIndex: 'contact' },
    { title: 'City', dataIndex: 'city' },
    { title: 'State', dataIndex: 'state' },
    {
      title: 'Orders', key: 'orders',
      render: (_: any, r: any) => (
        <Space size={4}>
          <Tag color="blue">{r.inProcessOrders ?? 0} active</Tag>
          <Tag color="green">{r.completedOrders ?? 0} done</Tag>
        </Space>
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => viewDetail(r)}>View</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          <Popconfirm title="Delete this hospital?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col><Title level={3} style={{ margin: 0 }}>Manage Hospitals</Title></Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Hospital</Button>
        </Col>
      </Row>

      <Card>
        <Table
          loading={loading}
          rowKey="id"
          dataSource={hospitals}
          columns={columns}
          components={tableComponents}
          pagination={{ pageSize: 20 }}
          onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => viewDetail(r) })}
        />
      </Card>

      {/* Create / Edit Drawer */}
      <Drawer
        title={editing ? `Edit Hospital: ${editing.name}` : 'Add Hospital'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={save}>Save</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Hospital Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="contactPerson" label="Contact Person">
            <Input />
          </Form.Item>
          <Form.Item name="streetAddress" label="Street Address">
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="city" label="City">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="state" label="State">
                <Input maxLength={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="zip" label="ZIP">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* Detail Drawer */}
      <Drawer
        title={`Hospital: ${selected?.name}`}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={<Button icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(selected); }}>Edit</Button>}
      >
        {selected && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="ID">{selected.id}</Descriptions.Item>
            <Descriptions.Item label="Name">{selected.name}</Descriptions.Item>
            <Descriptions.Item label="Email">{selected.email}</Descriptions.Item>
            <Descriptions.Item label="Phone">{selected.contact || '—'}</Descriptions.Item>
            <Descriptions.Item label="Contact Person">{selected.contactPerson || '—'}</Descriptions.Item>
            <Descriptions.Item label="Address">
              {[selected.streetAddress, selected.city, selected.state, selected.zip].filter(Boolean).join(', ') || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Provider ID">{selected.providerId || '—'}</Descriptions.Item>
            <Descriptions.Item label="Active Orders">
              <Tag color="blue">{selected.inProcessOrders ?? 0}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Completed Orders">
              <Tag color="green">{selected.completedOrders ?? 0}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Created">{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </PageWrapper>
  );
};

export default HospitalsPage;
