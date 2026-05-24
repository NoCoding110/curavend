/**
 * Admin: Invoice match auto-resolution rules.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Form, Input, InputNumber, Row, Select, Space,
  Switch, Table, Tag, Typography, message,
} from 'antd';
import { DollarOutlined, PlusOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post, put, del } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface Rule {
  id: string;
  hospitalId: string;
  vendorId: string | null;
  tolerancePct: number;
  toleranceMaxUsd: number;
  isActive: number;
  notes: string | null;
}

const InvoiceMatchRulesPage: React.FC = () => {
  const [rows, setRows] = useState<Rule[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Rule[] }>('/invoice-match-rules');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    (async () => {
      try { const r = await get<any>('/vendors?limit=500'); setVendors(r.items ?? r ?? []); }
      catch { /* noop */ }
    })();
  }, []);

  const openNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ tolerancePct: 2.0, toleranceMaxUsd: 50, isActive: true });
    setDrawerOpen(true);
  };
  const openEdit = (r: Rule) => {
    setEditing(r);
    form.setFieldsValue({ ...r, isActive: r.isActive === 1 });
    setDrawerOpen(true);
  };
  const save = async () => {
    try {
      const v = await form.validateFields();
      if (editing) { await put(`/invoice-match-rules/${editing.id}`, v); message.success('Updated'); }
      else { await post('/invoice-match-rules', v); message.success('Created'); }
      setDrawerOpen(false);
      void load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const remove = async (id: string) => {
    await del(`/invoice-match-rules/${id}`);
    message.success('Deleted');
    void load();
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><DollarOutlined /> Invoice Match Auto-Resolution Rules</Space>
          </Title>
          <Text type="secondary">
            Invoices within ±N% and ±$N of the PO total auto-resolve. Vendor-specific rules beat global ones.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New rule</Button>
          </Space>
        </Col>
      </Row>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Defaults: ±2% and ±$50. Tighten for vendors you trust, loosen for known-noisy invoicers." />

      <Card size="small">
        <Table<Rule>
          rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            {
              title: 'Vendor scope', dataIndex: 'vendorId', width: 220,
              render: (v: string | null) => v ? (vendors.find((x) => x.id === v)?.name ?? v.slice(0, 8)) : <Tag>ALL VENDORS</Tag>,
            },
            { title: '% tolerance', dataIndex: 'tolerancePct', width: 120, align: 'right' as const, render: (v) => `${v}%` },
            { title: '$ cap', dataIndex: 'toleranceMaxUsd', width: 110, align: 'right' as const, render: (v) => `$${v.toLocaleString()}` },
            { title: 'Active', dataIndex: 'isActive', width: 90, render: (v) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
            { title: 'Notes', dataIndex: 'notes', ellipsis: true },
            {
              title: 'Actions', width: 140,
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
                  <Button size="small" danger onClick={() => remove(r.id)}>Delete</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={editing ? 'Edit rule' : 'New rule'}
        width={460} open={drawerOpen} onClose={() => setDrawerOpen(false)}
        extra={<Button type="primary" onClick={save}>{editing ? 'Save' : 'Create'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="vendorId" label="Vendor (leave blank for ALL vendors)">
            <Select allowClear showSearch optionFilterProp="label"
              options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
          </Form.Item>
          <Form.Item name="tolerancePct" label="% tolerance" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="toleranceMaxUsd" label="$ absolute cap" rules={[{ required: true }]}>
            <InputNumber min={0} step={10} style={{ width: '100%' }} addonBefore="$" />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrap>
  );
};

export default InvoiceMatchRulesPage;
