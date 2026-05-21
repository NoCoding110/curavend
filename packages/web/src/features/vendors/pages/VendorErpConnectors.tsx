/**
 * VendorErpConnectors — Phase E: admin / vendor / super-vendor page to
 * configure outbound ERP push connectors. Hospital users do NOT see this page.
 *
 * Each connector represents one delivery destination (Fishbowl, NetSuite, …).
 * Fires automatically when an order's substatus matches `triggerEvent`.
 *
 * Field-map editor uses a plain JSON textarea for v1 — Monaco is overkill
 * for what's typically <30 lines of mapping config.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { del, get, post, put } from '../../../api/client';
import { useUserRoles } from '../../../hooks/useUserRoles';

const { Title, Text, Paragraph } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

interface ErpConnector {
  id: string;
  vendorId: string;
  connectorType: 'HTTP_POST' | 'WEBHOOK_POST' | 'EDI_850' | 'MANUAL';
  endpointUrl: string | null;
  authSecretRef: string | null;
  triggerEvent: string;
  config: string | null;
  isActive: number;
  lastPushedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VendorOption {
  id: string;
  name: string;
}

const TRIGGER_EVENTS = [
  'NEW_ORDER',
  'VENDOR_ASSIGNED',
  'VENDOR_CONFIRMED_RECEIPT',
  'PATIENT_VISITED_AND_ASSESSED',
  'DELIVERED',
  'PROOF_UPLOADED',
  'ORDER_COMPLETED',
];

const TYPE_COLOR: Record<string, string> = {
  HTTP_POST: 'blue',
  WEBHOOK_POST: 'cyan',
  EDI_850: 'gold',
  MANUAL: 'default',
};

const STARTER_FIELD_MAP = `{
  "fieldMap": {
    "salesOrder.customerNumber":  "vendor.erpAccountNumber",
    "salesOrder.poNumber":        "order.purchaseOrderNumber",
    "salesOrder.facilityName":    "hospital.name",
    "salesOrder.shipToZip":       "facility.zip",
    "salesOrder.notes":           "literal:Created by Curavend",
    "salesOrder.lines[].sku":     "items[].vendorSku",
    "salesOrder.lines[].qty":     "items[].packQuantity",
    "salesOrder.lines[].hcpc":    "items[].hcpcCode"
  }
}`;

const VendorErpConnectors: React.FC = () => {
  const { isAdmin, isVendor, isSuperVendor } = useUserRoles();
  const canManage = isAdmin || isVendor || isSuperVendor;

  const [items, setItems] = useState<ErpConnector[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ErpConnector | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isAdmin && !isSuperVendor) return;
    (async () => {
      try {
        const data = await get<any>('/vendors');
        const list = Array.isArray(data) ? data : data?.items ?? [];
        setVendors(list.map((v: any) => ({ id: v.id, name: v.name })));
      } catch { /* non-critical */ }
    })();
  }, [isAdmin, isSuperVendor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ items: ErpConnector[] }>('/vendor-erp-connectors');
      setItems(data.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vendorName = useCallback(
    (vid: string) => vendors.find((v) => v.id === vid)?.name ?? vid.slice(0, 8) + '…',
    [vendors],
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      connectorType: 'HTTP_POST',
      triggerEvent: 'VENDOR_CONFIRMED_RECEIPT',
      isActive: true,
      config: STARTER_FIELD_MAP,
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: ErpConnector) => {
    setEditing(row);
    form.setFieldsValue({
      vendorId: row.vendorId,
      connectorType: row.connectorType,
      triggerEvent: row.triggerEvent,
      endpointUrl: row.endpointUrl ?? '',
      authSecretRef: row.authSecretRef ?? '',
      isActive: !!row.isActive,
      config: row.config ?? '',
    });
    setDrawerOpen(true);
  };

  const submit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch { return; }

    // Validate config JSON before round-trip
    if (values.config) {
      try { JSON.parse(values.config); }
      catch { message.error('Config is not valid JSON'); return; }
    }

    const body = {
      vendorId: values.vendorId,
      connectorType: values.connectorType,
      triggerEvent: values.triggerEvent,
      endpointUrl: values.endpointUrl || null,
      authSecretRef: values.authSecretRef || null,
      isActive: !!values.isActive,
      config: values.config || null,
    };

    try {
      if (editing) {
        await put(`/vendor-erp-connectors/${editing.id}`, body);
        message.success('Connector updated');
      } else {
        await post('/vendor-erp-connectors', body);
        message.success('Connector created');
      }
      setDrawerOpen(false);
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Save failed');
    }
  };

  const remove = async (row: ErpConnector) => {
    try {
      await del(`/vendor-erp-connectors/${row.id}`);
      message.success('Deleted');
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const testPush = async (row: ErpConnector) => {
    try {
      const res = await post<any>(`/vendor-erp-connectors/${row.id}/test-push`, {});
      const status = res?.result?.finalStatus;
      if (status === 'OK') {
        message.success(`Test push succeeded after ${res.result.attempts} attempt(s)`);
      } else if (status === 'SKIPPED') {
        message.info('Connector type is MANUAL/EDI_850 — no live push attempted');
      } else {
        message.error(`Test push failed: ${res?.result?.error ?? 'see push log'}`);
      }
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Test push failed');
    }
  };

  const columns: ColumnsType<ErpConnector> = useMemo(
    () => [
      {
        title: 'Vendor',
        dataIndex: 'vendorId',
        render: (v: string) => vendorName(v),
      },
      {
        title: 'Type',
        dataIndex: 'connectorType',
        width: 140,
        render: (v: string) => <Tag color={TYPE_COLOR[v] ?? 'default'}>{v}</Tag>,
      },
      {
        title: 'Trigger',
        dataIndex: 'triggerEvent',
        width: 200,
        render: (v: string) => <Tag>{v}</Tag>,
      },
      {
        title: 'Endpoint',
        dataIndex: 'endpointUrl',
        ellipsis: true,
        render: (v: string | null) => v ? <Text code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
      },
      {
        title: 'Active',
        dataIndex: 'isActive',
        width: 80,
        render: (v: number) => v ? <Tag color="green">YES</Tag> : <Tag>OFF</Tag>,
      },
      {
        title: 'Last Success',
        dataIndex: 'lastSuccessAt',
        width: 160,
        render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <Text type="secondary">never</Text>,
      },
      {
        title: 'Last Error',
        dataIndex: 'lastError',
        ellipsis: true,
        render: (v: string | null) => v ? <Tooltip title={v}><Text type="danger" style={{ fontSize: 12 }}>{v.slice(0, 60)}…</Text></Tooltip> : <Text type="secondary">—</Text>,
      },
      {
        title: 'Actions',
        width: 240,
        render: (_, row) => (
          <Space>
            <Tooltip title="Trigger a synthetic push attempt against the most recent order">
              <Button
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => testPush(row)}
              >
                Test
              </Button>
            </Tooltip>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              Edit
            </Button>
            <Popconfirm title="Delete this connector?" onConfirm={() => remove(row)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [vendorName],
  );

  if (!canManage) {
    return (
      <PageWrapper>
        <Alert
          type="warning"
          message="ERP connector configuration is restricted to vendor administrators."
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Title level={3}>
        <ApiOutlined /> ERP Push Connectors
      </Title>
      <Paragraph type="secondary">
        Push finalized orders to your ERP automatically (Fishbowl, NetSuite,
        SAP, QuickBooks, …). Each connector fires when an order's substatus
        matches its trigger event.
      </Paragraph>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New Connector
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          size="small"
          pagination={{ pageSize: 25 }}
        />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Edit ERP Connector' : 'New ERP Connector'}
        width={620}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={submit}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {(isAdmin || isSuperVendor) && (
            <Form.Item name="vendorId" label="Vendor" rules={[{ required: true }]}>
              <Select
                placeholder="Pick a vendor"
                showSearch
                options={vendors.map((v) => ({ label: v.name, value: v.id }))}
                filterOption={(input, opt) =>
                  String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          )}

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="connectorType" label="Type" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'HTTP POST', value: 'HTTP_POST' },
                    { label: 'Webhook POST (HMAC)', value: 'WEBHOOK_POST' },
                    { label: 'EDI 850 (stubbed)', value: 'EDI_850' },
                    { label: 'Manual / CSV', value: 'MANUAL' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="triggerEvent" label="Trigger Event" rules={[{ required: true }]}>
                <Select options={TRIGGER_EVENTS.map((t) => ({ label: t, value: t }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="endpointUrl" label="Endpoint URL">
            <Input placeholder="https://erp.example.com/api/sales-orders" />
          </Form.Item>

          <Form.Item
            name="authSecretRef"
            label="Auth Secret Name"
            tooltip="Name of a Wrangler secret containing the bearer token / HMAC signing key. Set with `wrangler secret put <NAME>`."
          >
            <Input placeholder="ERP_FISHBOWL_TOKEN" />
          </Form.Item>

          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item
            name="config"
            label="Field Map (JSON)"
            tooltip="Defines how Curavend's order shape becomes the vendor's request body. Use 'literal:VAL' for fixed strings; use [].path for array mapping (e.g. items[].vendorSku → salesOrder.lines[].sku)."
            rules={[
              {
                validator: (_, value: string) => {
                  if (!value) return Promise.resolve();
                  try { JSON.parse(value); return Promise.resolve(); }
                  catch { return Promise.reject(new Error('Invalid JSON')); }
                },
              },
            ]}
          >
            <Input.TextArea rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrapper>
  );
};

export default VendorErpConnectors;
