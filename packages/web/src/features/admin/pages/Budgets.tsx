/**
 * Admin: Hospital budgets.
 *
 * One row per (hospital, fiscalYear, period, department or cost center).
 * Counters: committed (from submitted requisitions), consumed (from POs
 * sent), available = amount − committed − consumed. Over-budget rows show
 * a red flag.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Form, Input, InputNumber, Modal, Row,
  Select, Space, Table, Tag, Typography, message,
} from 'antd';
import {
  DollarOutlined, PlusOutlined, EditOutlined, ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { get, post, put, del } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const PERIODS = [
  'ANNUAL', 'Q1', 'Q2', 'Q3', 'Q4',
  'M01', 'M02', 'M03', 'M04', 'M05', 'M06',
  'M07', 'M08', 'M09', 'M10', 'M11', 'M12',
];

interface Budget {
  id: string;
  hospitalId: string;
  fiscalYear: number;
  period: string;
  departmentId: string | null;
  costCenter: string | null;
  category: string | null;
  amountUsd: number;
  committedUsd: number;
  consumedUsd: number;
  notes: string | null;
}

const BudgetsPage: React.FC = () => {
  const [rows, setRows] = useState<Budget[]>([]);
  const [depts, setDepts] = useState<{ id: string; name: string; costCenter?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [filter, setFilter] = useState<{ fiscalYear: number }>({
    fiscalYear: new Date().getFullYear(),
  });
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Budget[] }>(
        `/budgets?fiscalYear=${filter.fiscalYear}`,
      );
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    (async () => {
      try {
        const r = await get<{ items: any[] }>('/hospital-departments?limit=200');
        setDepts(r.items ?? []);
      } catch { /* noop */ }
    })();
  }, [filter.fiscalYear]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ fiscalYear: filter.fiscalYear, period: 'ANNUAL' });
    setDrawerOpen(true);
  };

  const openEdit = (b: Budget) => {
    setEditing(b);
    form.setFieldsValue(b);
    setDrawerOpen(true);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await put(`/budgets/${editing.id}`, values);
        message.success('Budget updated');
      } else {
        await post('/budgets', values);
        message.success('Budget created');
      }
      setDrawerOpen(false);
      void load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Save failed');
    }
  };

  const remove = (b: Budget) => {
    Modal.confirm({
      title: `Delete budget for ${b.period} ${b.fiscalYear}?`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      content: 'This cannot be undone. Encumbrance history is preserved.',
      onOk: async () => {
        await del(`/budgets/${b.id}`);
        message.success('Deleted');
        void load();
      },
    });
  };

  const deptName = (id: string | null) =>
    id ? (depts.find((d) => d.id === id)?.name ?? id.slice(0, 8)) : '—';

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><DollarOutlined /> Hospital Budgets</Space>
          </Title>
          <Text type="secondary">
            One budget per (department/cost-center × period). Counters auto-update from
            requisitions (committed) and POs (consumed).
          </Text>
        </Col>
        <Col>
          <Space>
            <InputNumber
              min={2020}
              max={2100}
              value={filter.fiscalYear}
              onChange={(v) => setFilter({ fiscalYear: Number(v) || new Date().getFullYear() })}
              addonBefore="FY"
              style={{ width: 140 }}
            />
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              New budget
            </Button>
          </Space>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="How it works"
        description="A requisition's estimated total bumps the matching budget's committed_usd on submit, and is released on reject/cancel. When a PO is transmitted, the encumbrance journal is posted to the GL ledger. Over-budget rows are flagged."
      />

      <Card size="small">
        <Table<Budget>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 50 }}
          columns={[
            { title: 'FY', dataIndex: 'fiscalYear', width: 70 },
            { title: 'Period', dataIndex: 'period', width: 90, render: (v) => <Tag>{v}</Tag> },
            {
              title: 'Scope',
              render: (_, r) => (
                <Space direction="vertical" size={0}>
                  <span>{deptName(r.departmentId)}</span>
                  {r.costCenter && <Text type="secondary" style={{ fontSize: 12 }}>CC {r.costCenter}</Text>}
                  {r.category && <Tag color="purple">{r.category}</Tag>}
                </Space>
              ),
            },
            {
              title: 'Amount',
              dataIndex: 'amountUsd',
              align: 'right' as const,
              render: (v: number) => `$${v.toLocaleString()}`,
              width: 120,
            },
            {
              title: 'Committed',
              dataIndex: 'committedUsd',
              align: 'right' as const,
              render: (v: number) => `$${v.toLocaleString()}`,
              width: 120,
            },
            {
              title: 'Consumed',
              dataIndex: 'consumedUsd',
              align: 'right' as const,
              render: (v: number) => `$${v.toLocaleString()}`,
              width: 120,
            },
            {
              title: 'Available',
              align: 'right' as const,
              width: 140,
              render: (_, r) => {
                const avail = r.amountUsd - r.committedUsd - r.consumedUsd;
                return (
                  <strong style={{ color: avail < 0 ? '#cf1322' : '#52c41a' }}>
                    {avail < 0 ? '−' : ''}${Math.abs(avail).toLocaleString()}
                  </strong>
                );
              },
            },
            {
              title: 'Burn',
              align: 'right' as const,
              width: 90,
              render: (_, r) => {
                const pct = r.amountUsd > 0
                  ? Math.round(((r.committedUsd + r.consumedUsd) / r.amountUsd) * 100)
                  : 0;
                const color = pct > 100 ? 'red' : pct > 80 ? 'orange' : 'green';
                return <Tag color={color}>{pct}%</Tag>;
              },
            },
            {
              title: 'Actions',
              width: 140,
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
                  <Button size="small" danger onClick={() => remove(r)}>Delete</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={editing ? 'Edit budget' : 'New budget'}
        width={500}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={<Button type="primary" onClick={submit}>{editing ? 'Save' : 'Create'}</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="fiscalYear" label="Fiscal year" rules={[{ required: true }]}>
            <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="period" label="Period" rules={[{ required: true }]}>
            <Select options={PERIODS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Form.Item name="departmentId" label="Department" tooltip="Scope to one department">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={depts.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item name="costCenter" label="Cost center" tooltip="Alternative to department">
            <Input placeholder="e.g. CC-5000-ICU" />
          </Form.Item>
          <Form.Item name="category" label="Category" tooltip="Optional spend category">
            <Input placeholder="e.g. DME, Lab, PPE" />
          </Form.Item>
          <Form.Item name="amountUsd" label="Amount (USD)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} addonBefore="$" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrap>
  );
};

export default BudgetsPage;
