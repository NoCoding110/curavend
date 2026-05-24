/**
 * Three-way match exceptions queue.
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Input,
  Form,
} from 'antd';
import { ReloadOutlined, CheckOutlined, CloseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { matchingApi, MATCH_STATUSES, type ThreeWayMatch } from '../../../api/receiving';
import { get } from '../../../api/client';
import { usePermissions } from '../../../hooks/usePermissions';

interface InvoiceOption {
  id: string;
  invoiceNumber?: string;
  vendorName?: string;
  totalAmount?: number;
  amountCents?: number;
}

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const statusColor: Record<string, string> = {
  PERFECT: 'green',
  QTY_VARIANCE: 'orange',
  PRICE_VARIANCE: 'red',
  NO_RECEIPT: 'gold',
  NO_PO: 'magenta',
  CONDITION_BAD: 'red',
  AMBIGUOUS: 'purple',
};

export const MatchExceptionsPage: React.FC = () => {
  const { canWrite } = usePermissions();
  const [rows, setRows] = useState<ThreeWayMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [runOpen, setRunOpen] = useState(false);
  const [runForm] = Form.useForm();
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [resolveModal, setResolveModal] = useState<{
    open: boolean;
    match: ThreeWayMatch | null;
    resolution: 'ACCEPTED' | 'DISPUTED' | 'OVERRIDDEN';
    notes: string;
  }>({ open: false, match: null, resolution: 'ACCEPTED', notes: '' });

  // Load most-recent invoices for dropdown
  useEffect(() => {
    (async () => {
      setLoadingInvoices(true);
      try {
        const r = await get<{ items: InvoiceOption[] } | InvoiceOption[]>('/invoices');
        const items = Array.isArray(r) ? r : r.items ?? [];
        setInvoiceOptions(items.slice(0, 200));
      } catch (err) { /* noop */ }
      finally { setLoadingInvoices(false); }
    })();
  }, []);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await matchingApi.exceptions(filter ? { matchStatus: filter } : undefined);
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  const runMatch = async () => {
    try {
      const v = await runForm.validateFields();
      const r = await matchingApi.run(v.invoiceId);
      const totals = Object.entries(r.byStatus).map(([s, n]) => `${s}=${n}`).join(', ');
      message.success(`Matched ${r.total} lines. ${totals}`);
      setRunOpen(false);
      void fetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const resolve = (match: ThreeWayMatch, resolution: 'ACCEPTED' | 'DISPUTED' | 'OVERRIDDEN') => {
    setResolveModal({ open: true, match, resolution, notes: '' });
  };
  const confirmResolve = async () => {
    if (!resolveModal.match) return;
    try {
      await matchingApi.resolve(resolveModal.match.id, {
        resolution: resolveModal.resolution,
        notes: resolveModal.notes,
      });
      message.success(`Marked ${resolveModal.resolution}`);
      setResolveModal({ open: false, match: null, resolution: 'ACCEPTED', notes: '' });
      void fetch();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  return (
    <PageWrap>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>3-Way Match Exceptions</Title>
          <Text type="secondary">Invoice lines that don't reconcile against PO + receipt within tolerance.</Text>
        </div>
        <Space>
          <Select
            style={{ width: 200 }}
            value={filter}
            onChange={setFilter}
            options={[{ value: '', label: 'All exceptions' }, ...MATCH_STATUSES.filter((s) => s !== 'PERFECT').map((s) => ({ value: s, label: s }))]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void fetch()}>Refresh</Button>
          {canWrite('goods-receipts') && (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { runForm.resetFields(); setRunOpen(true); }}>
              Run match
            </Button>
          )}
        </Space>
      </Space>

      <Card size="small">
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={[
            { title: 'HCPC', dataIndex: 'hcpcCode', width: 90 },
            { title: 'Status', dataIndex: 'matchStatus', width: 130, render: (s: string) => <Tag color={statusColor[s]}>{s}</Tag> },
            {
              title: 'Invoice',
              children: [
                { title: 'Qty', dataIndex: 'invoiceQuantity', width: 70 },
                { title: 'Unit $', dataIndex: 'invoiceUnitPriceUsd', width: 90, render: (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`) },
              ],
            },
            {
              title: 'PO',
              children: [
                { title: 'Qty', dataIndex: 'poQuantity', width: 70 },
                { title: 'Unit $', dataIndex: 'poUnitPriceUsd', width: 90, render: (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`) },
              ],
            },
            {
              title: 'Received',
              children: [
                { title: 'Qty', dataIndex: 'receivedQuantity', width: 70 },
                { title: 'Cond', dataIndex: 'receivedCondition', width: 90, render: (v: string | null) => v ? <Tag color={v === 'GOOD' ? 'green' : 'red'}>{v}</Tag> : '—' },
              ],
            },
            {
              title: 'Variance',
              children: [
                { title: 'Qty', dataIndex: 'qtyVariance', width: 70 },
                { title: 'Price %', dataIndex: 'priceVariancePct', width: 90, render: (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(1)}%` },
              ],
            },
            {
              title: 'Resolution',
              dataIndex: 'resolution',
              width: 110,
              render: (r: string | null) => r ? <Tag color={r === 'ACCEPTED' ? 'green' : r === 'DISPUTED' ? 'red' : 'blue'}>{r}</Tag> : <Text type="secondary">Pending</Text>,
            },
            {
              title: '',
              width: 170,
              render: (_, r: ThreeWayMatch) =>
                r.resolution || !canWrite('goods-receipts') ? null : (
                  <Space>
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => resolve(r, 'ACCEPTED')}>Accept</Button>
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => resolve(r, 'DISPUTED')}>Dispute</Button>
                  </Space>
                ),
            },
          ]}
          pagination={{ pageSize: 25 }}
        />
      </Card>

      <Modal
        title="Run 3-way match on invoice"
        open={runOpen}
        onCancel={() => setRunOpen(false)}
        onOk={runMatch}
        okText="Run"
      >
        <Form form={runForm} layout="vertical">
          <Form.Item name="invoiceId" label="Invoice" rules={[{ required: true, message: 'Pick an invoice' }]}>
            <Select
              showSearch
              loading={loadingInvoices}
              placeholder="Search by invoice # or vendor"
              optionFilterProp="label"
              options={invoiceOptions.map((i) => ({
                value: i.id,
                label: `${i.invoiceNumber ?? i.id.slice(0, 8)}${i.vendorName ? ` — ${i.vendorName}` : ''}${
                  i.amountCents ? ` — $${(i.amountCents / 100).toFixed(2)}` : i.totalAmount ? ` — $${i.totalAmount.toFixed(2)}` : ''
                }`,
              }))}
            />
          </Form.Item>
          <Text type="secondary">
            The matcher compares each invoice line against the source order's PO line and any goods receipt lines.
            Tolerance: qty exact, price ±2%.
          </Text>
        </Form>
      </Modal>

      <Modal
        title={`${resolveModal.resolution} this match?`}
        open={resolveModal.open}
        onCancel={() => setResolveModal({ ...resolveModal, open: false })}
        onOk={confirmResolve}
        okText={resolveModal.resolution}
        okButtonProps={{ danger: resolveModal.resolution === 'DISPUTED' }}
      >
        {resolveModal.match && (
          <>
            <p>
              <Text type="secondary">HCPC:</Text> <strong>{resolveModal.match.hcpcCode}</strong>{' '}
              <Text type="secondary">— Status:</Text>{' '}
              <Tag color={statusColor[resolveModal.match.matchStatus]}>{resolveModal.match.matchStatus}</Tag>
            </p>
            <Input.TextArea
              rows={4}
              autoFocus
              placeholder="Optional notes (audit trail)"
              value={resolveModal.notes}
              onChange={(e) => setResolveModal((s) => ({ ...s, notes: e.target.value }))}
            />
          </>
        )}
      </Modal>
    </PageWrap>
  );
};

export default MatchExceptionsPage;
