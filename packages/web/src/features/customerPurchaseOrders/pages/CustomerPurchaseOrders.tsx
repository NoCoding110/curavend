/**
 * Customer Purchase Orders — buyer-side PO list + create modal.
 *
 * Hospitals raise a PO with a fixed authorized spend; orders are billed
 * against the PO until the authorized amount is exhausted.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Tag,
  Tooltip,
  message,
  Popconfirm,
  Drawer,
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  StopOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { customerPurchaseOrdersApi, type CustomerPurchaseOrder, type CustomerPurchaseOrderDetail, type CustomerPoStatus } from '../../../api/customerPurchaseOrders';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

const PageWrap = styled.div`
  padding: 24px;
`;

const STATUS_COLOR: Record<CustomerPoStatus, string> = {
  OPEN: 'green',
  EXHAUSTED: 'gold',
  EXPIRED: 'volcano',
  CANCELLED: 'default',
};

const CustomerPurchaseOrdersPage: React.FC = () => {
  const { isAdmin, isHospital } = useUserRoles();
  const navigate = useNavigate();
  const [items, setItems] = useState<CustomerPurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CustomerPoStatus | undefined>();
  const [form] = Form.useForm();

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CustomerPurchaseOrderDetail | null>(null);

  const canCreate = isAdmin || isHospital;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await customerPurchaseOrdersApi.list({ status: statusFilter, limit: 100 });
      setItems(resp.items);
      setTotal(resp.total);
    } catch (err: any) {
      message.error(`Failed to load POs: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    try {
      const d = await customerPurchaseOrdersApi.get(id);
      setDetail(d);
    } catch (err: any) {
      message.error(`Could not load PO: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  const handleCreate = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setCreating(true);
    try {
      await customerPurchaseOrdersApi.create({
        poNumber: values.poNumber.trim(),
        poDate: dayjs(values.poDate).format('YYYY-MM-DD'),
        authorizedAmount: values.authorizedAmount != null ? Number(values.authorizedAmount) : undefined,
        expiresAt: values.expiresAt ? dayjs(values.expiresAt).format('YYYY-MM-DD') : undefined,
        notes: values.notes || undefined,
      });
      message.success('Customer PO created');
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (err: any) {
      message.error(`Create failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = async (id: string, status: 'EXHAUSTED' | 'CANCELLED') => {
    try {
      await customerPurchaseOrdersApi.close(id, status);
      message.success(`Marked as ${status}`);
      await load();
    } catch (err: any) {
      message.error(`Close failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Customer Purchase Orders</Title>
            <Text type="secondary">Track buyer-side POs and their authorized spend</Text>
          </div>
          <Space>
            <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={load} /></Tooltip>
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                New PO
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Text type="secondary">Filter:</Text>
          {(['OPEN', 'EXHAUSTED', 'EXPIRED', 'CANCELLED'] as CustomerPoStatus[]).map((s) => (
            <Tag.CheckableTag
              key={s}
              checked={statusFilter === s}
              onChange={(c) => setStatusFilter(c ? s : undefined)}
              style={{ border: '1px solid #e0e0e0' }}
            >
              {s}
            </Tag.CheckableTag>
          ))}
          {statusFilter && <Button size="small" onClick={() => setStatusFilter(undefined)}>Clear</Button>}
        </Space>
        <Table<CustomerPurchaseOrder>
          loading={loading}
          dataSource={items}
          rowKey="id"
          pagination={{ pageSize: 20, total, showSizeChanger: false }}
          columns={[
            { title: 'PO Number', dataIndex: 'poNumber', width: 160, render: (v) => <Text strong>{v}</Text> },
            { title: 'PO Date', dataIndex: 'poDate', width: 110, render: (v) => v },
            {
              title: 'Status', dataIndex: 'status', width: 120,
              render: (v: CustomerPoStatus) => <Tag color={STATUS_COLOR[v]}>{v}</Tag>,
            },
            {
              title: 'Authorized', dataIndex: 'authorizedAmount', width: 130, align: 'right',
              render: (v) => v != null ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <Text type="secondary">no cap</Text>,
            },
            {
              title: 'Spent', dataIndex: 'spentAmount', width: 120, align: 'right',
              render: (v) => `$${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            },
            {
              title: 'Remaining', width: 130, align: 'right',
              render: (_, r) => r.authorizedAmount != null
                ? `$${(r.authorizedAmount - (r.spentAmount ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : <Text type="secondary">—</Text>,
            },
            {
              title: 'Expires', dataIndex: 'expiresAt', width: 110,
              render: (v) => v ? <span style={{ color: dayjs(v).isBefore(dayjs(), 'day') ? '#cf1322' : undefined }}>{v}</span> : <Text type="secondary">—</Text>,
            },
            {
              title: 'Notes', dataIndex: 'notes',
              render: (v) => v ? <Text ellipsis={{ tooltip: v }}>{v}</Text> : <Text type="secondary">—</Text>,
            },
            {
              title: '', width: 130,
              render: (_, r) => (
                <Space size="small">
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>View</Button>
                  {r.status === 'OPEN' && (
                    <Popconfirm title="Close this PO?" onConfirm={() => handleClose(r.id, 'CANCELLED')}>
                      <Button size="small" danger icon={<StopOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
          locale={{ emptyText: 'No customer POs yet.' }}
        />
      </Card>

      {/* Create modal */}
      <Modal
        title="New Customer Purchase Order"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okButtonProps={{ loading: creating }}
        okText="Create"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="poNumber" label="PO Number" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. PO-44521" />
          </Form.Item>
          <Form.Item name="poDate" label="PO Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="authorizedAmount" label="Authorized amount ($)" tooltip="Max spend across orders billed to this PO. Leave blank for no cap.">
            <InputNumber style={{ width: '100%' }} min={0} step={100} />
          </Form.Item>
          <Form.Item name="expiresAt" label="Expires" tooltip="Orders cannot be billed to this PO after this date.">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        title={detail ? `PO ${detail.poNumber}` : 'PO Details'}
        width={640}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[detail.status]}>{detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="PO Date">{detail.poDate}</Descriptions.Item>
              <Descriptions.Item label="Authorized">{detail.authorizedAmount != null ? `$${Number(detail.authorizedAmount).toFixed(2)}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Spent">${Number(detail.spentAmount ?? 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="Remaining">
                {detail.authorizedAmount != null ? `$${(detail.authorizedAmount - (detail.spentAmount ?? 0)).toFixed(2)}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Expires">{detail.expiresAt ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Notes">{detail.notes ?? '—'}</Descriptions.Item>
            </Descriptions>
            <div>
              <Text strong>Linked orders ({detail.linkedOrders.length})</Text>
              <Table
                size="small"
                pagination={false}
                dataSource={detail.linkedOrders}
                rowKey="id"
                columns={[
                  {
                    title: 'Order #', dataIndex: 'identifier', width: 200,
                    render: (v, r) => <a onClick={() => navigate(`/provider-orders/${r.id}`)}>{v}</a>,
                  },
                  { title: 'Status', dataIndex: 'status', width: 110 },
                  { title: 'Substatus', dataIndex: 'orderSubStatus' },
                  {
                    title: 'Created', dataIndex: 'createdAt', width: 160,
                    render: (v) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '',
                  },
                ]}
              />
            </div>
          </Space>
        ) : <Text type="secondary">Loading…</Text>}
      </Drawer>
    </PageWrap>
  );
};

export default CustomerPurchaseOrdersPage;
