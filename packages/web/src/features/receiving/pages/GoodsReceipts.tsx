/**
 * Goods Receipt Notes (GRN) — list + create/edit drawer.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Row,
  Col,
  DatePicker,
  Tabs,
  Divider,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  receivingApi,
  RECEIPT_CONDITIONS,
  GRN_STATUSES,
  type GoodsReceipt,
  type GoodsReceiptLine,
} from '../../../api/receiving';
import { get } from '../../../api/client';
import { useSearchParams } from 'react-router-dom';
import { usePermissions } from '../../../hooks/usePermissions';

interface OrderOption {
  id: string;
  identifier?: string;
  status?: string;
  vendorId?: string;
  vendorName?: string;
}

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const statusColor: Record<string, string> = { DRAFT: 'default', POSTED: 'green', CANCELLED: 'red' };

export const GoodsReceiptsPage: React.FC = () => {
  const { canWrite, canDelete } = usePermissions();
  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{ status: string }>({ status: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<(GoodsReceipt & { lines: GoodsReceiptLine[] }) | null>(null);
  const [createForm] = Form.useForm();
  const [draftLines, setDraftLines] = useState<any[]>([]);
  const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searchParams] = useSearchParams();

  // Load open orders for the create dropdown
  useEffect(() => {
    (async () => {
      setLoadingOrders(true);
      try {
        const r = await get<{ items: OrderOption[] } | OrderOption[]>('/orders');
        const items = Array.isArray(r) ? r : r.items ?? [];
        setOrderOptions(items.slice(0, 200));
      } catch (err) { /* noop */ }
      finally { setLoadingOrders(false); }
    })();
  }, []);

  // Auto-open create drawer if ?orderId= passed (deep link from order detail page)
  useEffect(() => {
    const oid = searchParams.get('orderId');
    if (oid) {
      createForm.resetFields();
      createForm.setFieldsValue({ orderId: oid, receivedAt: dayjs() });
      setDraftLines([]);
      setCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await receivingApi.listReceipts(filter.status ? { status: filter.status } : undefined);
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter.status]);

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ receivedAt: dayjs() });
    setDraftLines([]);
    setCreateOpen(true);
  };
  const addLine = () => setDraftLines((a) => [...a, { hcpcCode: '', quantityReceived: 1, condition: 'GOOD' }]);
  const updLine = (i: number, k: string, v: any) =>
    setDraftLines((a) => a.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const rmLine = (i: number) => setDraftLines((a) => a.filter((_, idx) => idx !== i));

  const submit = async () => {
    try {
      const v = await createForm.validateFields();
      const lines = draftLines
        .filter((l) => l.hcpcCode && l.quantityReceived != null)
        .map((l) => ({
          hcpcCode: String(l.hcpcCode).toUpperCase(),
          description: l.description,
          quantityReceived: Number(l.quantityReceived),
          quantityRejected: l.quantityRejected ? Number(l.quantityRejected) : 0,
          condition: l.condition ?? 'GOOD',
          lotNumber: l.lotNumber,
          expirationDate: l.expirationDate ? dayjs(l.expirationDate).format('YYYY-MM-DD') : undefined,
        }));
      if (!v.orderId && lines.length === 0) {
        message.warning('Add at least one line OR specify an orderId to auto-seed lines');
        return;
      }
      const r = await receivingApi.createReceipt({
        ...v,
        receivedAt: v.receivedAt ? dayjs(v.receivedAt).toISOString() : undefined,
        lines,
      });
      message.success(`Created ${r.receiptNumber}`);
      setCreateOpen(false);
      void fetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const r = await receivingApi.getReceipt(id);
      setDetail(r);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const refreshDetail = async () => {
    if (!detail) return;
    const r = await receivingApi.getReceipt(detail.id);
    setDetail(r);
    void fetch();
  };
  const postReceipt = async () => {
    if (!detail) return;
    try {
      await receivingApi.postReceipt(detail.id);
      message.success('Posted — receipt is now locked');
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const cancelReceipt = async () => {
    if (!detail) return;
    try {
      await receivingApi.cancelReceipt(detail.id);
      message.success('Cancelled');
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const columns: ColumnsType<GoodsReceipt> = [
    {
      title: 'GRN #',
      dataIndex: 'receiptNumber',
      width: 160,
      render: (v, r) => <a onClick={() => openDetail(r.id)}><strong>{v}</strong></a>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag>,
    },
    {
      title: 'Order',
      dataIndex: 'orderId',
      width: 250,
      ellipsis: true,
      render: (v) => v ? <Text code style={{ fontSize: 12 }}>{v.slice(0, 8)}…</Text> : '—',
    },
    {
      title: 'Received',
      dataIndex: 'receivedAt',
      width: 150,
      render: (v: string) => dayjs(v).format('MMM D, YYYY h:mm A'),
    },
    {
      title: 'Carrier',
      dataIndex: 'carrier',
      width: 120,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: 'Tracking',
      dataIndex: 'trackingNumber',
      width: 150,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
  ];

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Goods Receipts</Title>
          <Text type="secondary">Record what physically arrived against each order. Feeds 3-way invoice matching.</Text>
        </Col>
        <Col>
          <Space>
            <Select
              style={{ width: 140 }}
              value={filter.status}
              onChange={(s) => setFilter({ status: s })}
              options={[{ value: '', label: 'All statuses' }, ...GRN_STATUSES.map((s) => ({ value: s, label: s }))]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void fetch()}>Refresh</Button>
            {canWrite('goods-receipts') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New receipt</Button>
            )}
          </Space>
        </Col>
      </Row>

      <Card size="small">
        <Table size="small" rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 25 }} />
      </Card>

      <Drawer
        title="New Goods Receipt"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        width={780}
        extra={<Space><Button onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="primary" onClick={submit}>Create</Button></Space>}
      >
        <Form form={createForm} layout="vertical">
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="orderId" label="Order (optional)" tooltip="If selected, lines auto-seed from order items">
                <Select
                  allowClear
                  showSearch
                  loading={loadingOrders}
                  placeholder="Search by order # or vendor"
                  optionFilterProp="label"
                  options={orderOptions.map((o) => ({
                    value: o.id,
                    label: `${o.identifier ?? o.id.slice(0, 8)}${o.vendorName ? ` — ${o.vendorName}` : ''}${o.status ? ` (${o.status})` : ''}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}><Form.Item name="receivedAt" label="Received at" rules={[{ required: true }]}><DatePicker showTime style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="carrier" label="Carrier"><Input placeholder="FedEx / UPS / etc." /></Form.Item></Col>
            <Col span={8}><Form.Item name="trackingNumber" label="Tracking #"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="packingSlipNumber" label="Packing slip #"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          <Divider>Lines (leave empty to auto-seed from order)</Divider>
          <Space direction="vertical" style={{ width: '100%' }}>
            {draftLines.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No manual lines" />
            ) : (
              draftLines.map((l, idx) => (
                <Row key={idx} gutter={[6, 6]}>
                  <Col xs={24} sm={4}><Input placeholder="HCPC" value={l.hcpcCode} onChange={(e) => updLine(idx, 'hcpcCode', e.target.value)} /></Col>
                  <Col xs={24} sm={7}><Input placeholder="Description" value={l.description} onChange={(e) => updLine(idx, 'description', e.target.value)} /></Col>
                  <Col xs={6} sm={3}><InputNumber placeholder="Qty" min={0} style={{ width: '100%' }} value={l.quantityReceived} onChange={(v) => updLine(idx, 'quantityReceived', v)} /></Col>
                  <Col xs={6} sm={3}><InputNumber placeholder="Rej" min={0} style={{ width: '100%' }} value={l.quantityRejected} onChange={(v) => updLine(idx, 'quantityRejected', v)} /></Col>
                  <Col xs={8} sm={3}>
                    <Select
                      value={l.condition}
                      onChange={(v) => updLine(idx, 'condition', v)}
                      options={RECEIPT_CONDITIONS.map((c) => ({ value: c, label: c }))}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col xs={3} sm={3}><Input placeholder="Lot #" value={l.lotNumber} onChange={(e) => updLine(idx, 'lotNumber', e.target.value)} /></Col>
                  <Col xs={1} sm={1}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => rmLine(idx)} /></Col>
                </Row>
              ))
            )}
            <Button type="dashed" icon={<PlusOutlined />} block onClick={addLine}>Add manual line</Button>
          </Space>
        </Form>
      </Drawer>

      <Drawer title={detail?.receiptNumber ?? ''} open={!!detail} onClose={() => setDetail(null)} width={760}>
        {detail && (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color={statusColor[detail.status]}>{detail.status}</Tag>
              {detail.carrier && <Tag>{detail.carrier}</Tag>}
              {detail.trackingNumber && <Tag>Tracking: {detail.trackingNumber}</Tag>}
              <Tag>Received {dayjs(detail.receivedAt).format('MMM D, YYYY h:mm A')}</Tag>
            </Space>
            {detail.notes && <Paragraph type="secondary">{detail.notes}</Paragraph>}
            <Space style={{ marginBottom: 12 }}>
              {detail.status === 'DRAFT' && canDelete('goods-receipts') && (
                <Button type="primary" icon={<CheckOutlined />} onClick={postReceipt}>Post (lock)</Button>
              )}
              {detail.status === 'DRAFT' && canWrite('goods-receipts') && (
                <Popconfirm title="Cancel this receipt?" onConfirm={cancelReceipt}>
                  <Button danger icon={<CloseOutlined />}>Cancel</Button>
                </Popconfirm>
              )}
              {detail.status === 'POSTED' && (
                <Alert type="success" showIcon message="Receipt posted — feeds 3-way match" style={{ marginBottom: 0 }} />
              )}
            </Space>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detail.lines}
              columns={[
                { title: 'HCPC', dataIndex: 'hcpcCode', width: 90 },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Ordered', dataIndex: 'quantityOrdered', width: 90 },
                { title: 'Received', dataIndex: 'quantityReceived', width: 90 },
                { title: 'Rejected', dataIndex: 'quantityRejected', width: 90 },
                {
                  title: 'Condition',
                  dataIndex: 'condition',
                  width: 110,
                  render: (c: string) => (
                    <Tag color={c === 'GOOD' ? 'green' : c === 'DAMAGED' ? 'red' : 'orange'}>{c}</Tag>
                  ),
                },
                { title: 'Lot', dataIndex: 'lotNumber', width: 90 },
              ]}
            />
          </>
        )}
      </Drawer>
    </PageWrap>
  );
};

export default GoodsReceiptsPage;
