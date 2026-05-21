import React, { useEffect, useState } from 'react';
import { Button, Card, Space, Table, Tag, Typography, message, Modal, Form, Input, InputNumber } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const PurchaseOrders: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const baseColumns = [
    { title: 'PO Number', dataIndex: 'number' },
    { title: 'Status', dataIndex: 'status', render: (v: any) => <Tag>{v}</Tag> },
    { title: 'Vendor', dataIndex: 'vendorId' },
    { title: 'Date', dataIndex: 'date', render: (v: any) => v ? new Date(v).toLocaleDateString() : '-' },
    {
      title: 'Actions',
      render: (_: any, r: any) => (
        <Button icon={<DownloadOutlined />} size="small" onClick={() => exportCsv(r.id, r.number)}>
          Export CSV
        </Button>
      ),
    },
  ];
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await get<any>('/purchase-orders');
      setRows(d.items ?? []);
    } catch (err) {
      message.error('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const values = await form.validateFields();
    try {
      await post('/purchase-orders', values);
      message.success('Purchase order created');
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Creation failed');
    }
  };

  const exportCsv = async (id: string, number: string) => {
    const resp = await fetch(`https://curavend-api.metabilityllc1.workers.dev/api/purchase-orders/${id}/export.csv`, {
      headers: { Authorization: `Bearer ${JSON.parse(sessionStorage.getItem('persist:root') ?? '{}').auth ? JSON.parse(JSON.parse(sessionStorage.getItem('persist:root') ?? '{}').auth).token : ''}` },
    });
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${number}.csv`;
    a.click();
  };

  return (
    <PageWrapper>
      <Space style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Purchase Orders</Title>
      </Space>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Create PO
          </Button>
        }
      >
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          columns={columns}
          components={tableComponents}
        />
      </Card>

      <Modal title="Create Purchase Order" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={create} okText="Create">
        <Form form={form} layout="vertical">
          <Form.Item name="vendorId" label="Vendor ID" rules={[{ required: true }]}>
            <Input placeholder="vend-001" />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="ORDER_COMPLETED">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default PurchaseOrders;
