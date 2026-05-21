/**
 * VendorStockConnectors — Phase D: admin / vendor / super-vendor page to
 * configure stock-feed connectors. Hospital users do NOT see this page.
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
  InputNumber,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { del, get, post, put } from '../../../api/client';
import { useUserRoles } from '../../../hooks/useUserRoles';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

interface Connector {
  id: string;
  vendorId: string;
  connectorType: 'HTTP_POLL' | 'WEBHOOK' | 'EDI_846' | 'MANUAL';
  endpointUrl: string | null;
  authSecretRef: string | null;
  pollIntervalMinutes: number;
  isActive: number;
  lastPolledAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  config: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VendorOption {
  id: string;
  name: string;
}

const VendorStockConnectors: React.FC = () => {
  const { isAdmin, isVendor, isSuperVendor, userData } = useUserRoles();
  const canManage = isAdmin || isVendor || isSuperVendor;

  const [items, setItems] = useState<Connector[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Connector | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isAdmin && !isSuperVendor) return;
    (async () => {
      try {
        const data = await get<any>('/vendors');
        const list = Array.isArray(data) ? data : data?.items ?? [];
        setVendors(list.map((v: any) => ({ id: v.id, name: v.name })));
      } catch {
        /* non-critical */
      }
    })();
  }, [isAdmin, isSuperVendor]);

  const fetchItems = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    try {
      const res = await get<{ items: Connector[] }>(
        '/vendor-stock-connectors',
      );
      setItems(res.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      connectorType: 'HTTP_POLL',
      pollIntervalMinutes: 15,
      isActive: true,
    });
    if ((isAdmin || isSuperVendor) && vendors[0]) {
      form.setFieldsValue({ vendorId: vendors[0].id });
    }
    setDrawerOpen(true);
  };

  const openEdit = (row: Connector) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      vendorId: row.vendorId,
      connectorType: row.connectorType,
      endpointUrl: row.endpointUrl,
      authSecretRef: row.authSecretRef,
      pollIntervalMinutes: row.pollIntervalMinutes,
      isActive: row.isActive === 1,
      configJson: row.config,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      let configObj: any = null;
      if (v.configJson) {
        try {
          configObj = JSON.parse(v.configJson);
        } catch {
          message.error('Config must be valid JSON');
          return;
        }
      }
      const payload: any = {
        connectorType: v.connectorType,
        endpointUrl: v.endpointUrl ?? null,
        authSecretRef: v.authSecretRef ?? null,
        pollIntervalMinutes: v.pollIntervalMinutes ?? 15,
        isActive: v.isActive !== false,
        config: configObj,
      };
      if (isAdmin || isSuperVendor) payload.vendorId = v.vendorId;

      if (editing) {
        await put(`/vendor-stock-connectors/${editing.id}`, payload);
        message.success('Connector updated');
      } else {
        await post('/vendor-stock-connectors', payload);
        message.success('Connector created');
      }
      setDrawerOpen(false);
      fetchItems();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await del(`/vendor-stock-connectors/${id}`);
      message.success('Connector deactivated');
      fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const handleTestPoll = async (row: Connector) => {
    try {
      const res = await post<any>(
        `/vendor-stock-connectors/${row.id}/test-poll`,
        {},
      );
      message[res?.status === 'OK' ? 'success' : 'warning'](
        `Test poll: ${res?.status} — wrote ${res?.rowsWritten ?? 0} rows in ${res?.durationMs}ms${res?.errorSummary ? ` · ${res.errorSummary}` : ''}`,
      );
      fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Poll failed');
    }
  };

  const handleRunAll = async () => {
    try {
      const res = await post<any>('/vendor-stock-connectors/run-all-now', {});
      message.success(
        `Ran ${res.attempted} connector(s): ok=${res.ok}, failed=${res.failed}`,
      );
      fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Run-all failed');
    }
  };

  const formatTs = (ts: string | null) =>
    ts ? new Date(ts).toLocaleString() : '—';

  const columns: ColumnsType<Connector> = useMemo(
    () => [
      {
        title: 'Vendor',
        dataIndex: 'vendorId',
        key: 'vendorId',
        render: (vid: string) => {
          const v = vendors.find((x) => x.id === vid);
          return <Text strong>{v?.name || vid}</Text>;
        },
      },
      {
        title: 'Type',
        dataIndex: 'connectorType',
        key: 'connectorType',
        width: 130,
        render: (t: string) => <Tag color="blue">{t}</Tag>,
      },
      {
        title: 'Endpoint',
        dataIndex: 'endpointUrl',
        key: 'endpointUrl',
        ellipsis: true,
        render: (u: string | null) =>
          u ? (
            <Text code style={{ fontSize: 11 }}>
              {u}
            </Text>
          ) : (
            <Text type="secondary">—</Text>
          ),
      },
      {
        title: 'Interval',
        dataIndex: 'pollIntervalMinutes',
        key: 'pollIntervalMinutes',
        width: 90,
        render: (m: number) => `${m}m`,
      },
      {
        title: 'Last success',
        dataIndex: 'lastSuccessAt',
        key: 'lastSuccessAt',
        width: 180,
        render: (ts: string | null, row: Connector) => (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{formatTs(ts)}</Text>
            {row.lastError && (
              <Text
                type="danger"
                ellipsis
                style={{ fontSize: 11, maxWidth: 180 }}
              >
                ⚠ {row.lastError}
              </Text>
            )}
          </Space>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 90,
        render: (a: number) =>
          a === 1 ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 220,
        render: (_: any, r: Connector) => (
          <Space size={4}>
            {r.connectorType === 'HTTP_POLL' && r.isActive === 1 && (
              <Button
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleTestPoll(r)}
              >
                Test
              </Button>
            )}
            <Button
              size="small"
              type="link"
              icon={<EditOutlined />}
              onClick={() => openEdit(r)}
            >
              Edit
            </Button>
            <Popconfirm
              title="Deactivate this connector?"
              onConfirm={() => handleDelete(r.id)}
            >
              <Button
                size="small"
                type="link"
                icon={<DeleteOutlined />}
                danger
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [vendors],
  );

  if (!canManage) {
    return (
      <PageWrapper>
        <Alert
          type="warning"
          message="You don't have access to stock-feed configuration."
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Space
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Stock Feeds
          </Title>
          <Text type="secondary">
            Configure how vendor inventory is pulled into Curavend. Routing
            uses fresh stock signals to demote low-stock branches.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchItems}>
            Refresh
          </Button>
          {isAdmin && (
            <Button
              icon={<ThunderboltOutlined />}
              onClick={handleRunAll}
            >
              Run all polls now
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add connector
          </Button>
        </Space>
      </Space>

      {error && (
        <Alert
          type="error"
          message={error}
          style={{ marginBottom: 12 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      <Card>
        <Table
          rowKey="id"
          dataSource={items}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 25 }}
          size="middle"
        />
      </Card>

      <Drawer
        title={editing ? 'Edit connector' : 'Add stock-feed connector'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={handleSave}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {(isAdmin || isSuperVendor) && (
            <Form.Item
              name="vendorId"
              label="Vendor"
              rules={[{ required: true, message: 'Vendor is required' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                disabled={!!editing}
              />
            </Form.Item>
          )}
          <Form.Item
            name="connectorType"
            label="Connector type"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'HTTP_POLL', label: 'HTTP polling (15-min cron pulls a JSON URL)' },
                { value: 'WEBHOOK', label: 'Webhook (vendor pushes to Curavend with HMAC signature)' },
                { value: 'MANUAL', label: 'Manual upload' },
                { value: 'EDI_846', label: 'EDI 846 (stub — future)' },
              ]}
            />
          </Form.Item>
          <Form.Item
            shouldUpdate={(p, n) => p.connectorType !== n.connectorType}
            noStyle
          >
            {() => {
              const t = form.getFieldValue('connectorType');
              if (t === 'HTTP_POLL') {
                return (
                  <>
                    <Form.Item
                      name="endpointUrl"
                      label="Endpoint URL"
                      rules={[{ required: true, type: 'url' as const }]}
                    >
                      <Input placeholder="https://vendor.example.com/api/stock" />
                    </Form.Item>
                    <Form.Item
                      name="authSecretRef"
                      label="Auth secret name (wrangler secret key)"
                      tooltip="Name of the worker secret holding the bearer token. The secret value is never stored in DB."
                    >
                      <Input placeholder="VENDOR_001_STOCK_TOKEN" />
                    </Form.Item>
                    <Form.Item
                      name="pollIntervalMinutes"
                      label="Poll interval (minutes)"
                    >
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                );
              }
              if (t === 'WEBHOOK') {
                return (
                  <Form.Item
                    name="authSecretRef"
                    label="HMAC secret name (wrangler secret key)"
                    rules={[{ required: true }]}
                    tooltip="Name of the worker secret used to verify X-Curavend-Signature on incoming webhooks."
                  >
                    <Input placeholder="VENDOR_001_WEBHOOK_SECRET" />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
          <Form.Item
            name="configJson"
            label="Config (JSON)"
            tooltip="Optional per-connector field-path overrides, e.g. {&quot;sku&quot;:&quot;item.sku&quot;}"
          >
            <Input.TextArea rows={4} placeholder='{"sku":"item.sku","qty":"available.units"}' />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrapper>
  );
};

export default VendorStockConnectors;
