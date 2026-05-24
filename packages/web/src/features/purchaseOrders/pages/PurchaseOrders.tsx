import React, { useEffect, useState } from 'react';
import { Button, Card, Dropdown, Space, Table, Tag, Typography, message, Modal, Form, Input, InputNumber } from 'antd';
import { DownloadOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { get, post } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const PurchaseOrders: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const transmit = async (id: string, number: string, method?: string) => {
    try {
      const r = await post<{ state: string; method: string; error?: string }>(
        `/purchase-orders/${id}/transmit`,
        method ? { method } : {},
      );
      if (r.state === 'SENT') {
        message.success(`PO ${number} sent via ${r.method}`);
      } else {
        message.error(`PO ${number} transmission FAILED: ${r.error ?? 'unknown'}`);
      }
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Transmit failed');
    }
  };

  const baseColumns = [
    {
      title: 'PO Number',
      dataIndex: 'number',
      render: (v: string, r: any) => (
        <Link to={`/purchase-orders/${r.id}`}><strong>{v}</strong></Link>
      ),
    },
    { title: 'Status', dataIndex: 'status', render: (v: any) => <Tag>{v}</Tag> },
    {
      title: 'Transmission',
      dataIndex: 'transmissionState',
      width: 150,
      render: (v: any, r: any) => {
        const color =
          v === 'ACKED' ? 'green' :
          v === 'SENT' ? 'blue' :
          v === 'FAILED' ? 'red' :
          v === 'SENDING' ? 'gold' : 'default';
        return (
          <Space direction="vertical" size={0}>
            <Tag color={color}>{v ?? 'NOT_SENT'}</Tag>
            {r.transmissionMethod && <Text type="secondary" style={{ fontSize: 11 }}>via {r.transmissionMethod}</Text>}
          </Space>
        );
      },
    },
    { title: 'Vendor', dataIndex: 'vendorId' },
    {
      title: 'Total',
      dataIndex: 'totalUsd',
      align: 'right' as const,
      width: 100,
      render: (v: any) => v != null ? `$${Number(v).toLocaleString()}` : '—',
    },
    { title: 'Date', dataIndex: 'date', render: (v: any) => v ? new Date(v).toLocaleDateString() : '-' },
    {
      title: 'Actions',
      render: (_: any, r: any) => (
        <Space size={4}>
          <Dropdown.Button
            icon={<SendOutlined />}
            size="small"
            onClick={() => transmit(r.id, r.number)}
            menu={{
              items: [
                { key: 'EDI', label: 'Send via EDI 850' },
                { key: 'API', label: 'Send via API' },
                { key: 'PUNCHOUT', label: 'Send via cXML PunchOut' },
                { key: 'EMAIL', label: 'Send via Email' },
                { key: 'PORTAL', label: 'Mark as Portal-served' },
              ],
              onClick: ({ key }) => transmit(r.id, r.number, key),
            }}
          >
            Transmit
          </Dropdown.Button>
          <Button icon={<DownloadOutlined />} size="small" onClick={() => exportCsv(r.id, r.number)}>
            CSV
          </Button>
        </Space>
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
