/**
 * Purchase order detail — header, items, transmission state + log + retry.
 *
 * Three panels:
 *   - Header card: PO meta, vendor, requisition link, totals.
 *   - Items table: HCPC, description, qty, unit price, line total.
 *   - Transmission card: current state, last attempt, retry dropdown,
 *     full attempt log with method + endpoint + response.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Dropdown, Empty, Row, Space, Table, Tag,
  Tooltip, Typography, message,
} from 'antd';
import {
  ArrowLeftOutlined, ReloadOutlined, SendOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface PoItem {
  id: string;
  description: string | null;
  manufacturerNumber: string | null;
  productDescription: string | null;
  hcpcCode: string | null;
  quantity: number | null;
  unitPriceUsd: number | null;
  lineTotalUsd: number | null;
  requisitionItemId: string | null;
}
interface PoDetail {
  id: string;
  number: string;
  status: string;
  vendorId: string;
  hospitalId: string | null;
  requisitionId: string | null;
  totalUsd: number | null;
  currency: string | null;
  neededByDate: string | null;
  notes: string | null;
  transmissionMethod: string | null;
  transmissionState: string;
  transmittedAt: string | null;
  vendorAckAt: string | null;
  transmissionAttempts: number;
  transmissionError: string | null;
  date: string | null;
  createdAt: string;
  items: PoItem[];
}
interface TxLog {
  id: string;
  attemptNumber: number;
  method: string;
  state: string;
  endpoint: string | null;
  responseStatus: string | null;
  responseBodySample: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string | null;
}

const STATE_TAG: Record<string, { color: string; icon: React.ReactNode }> = {
  NOT_SENT: { color: 'default', icon: <ClockCircleOutlined /> },
  SENDING: { color: 'processing', icon: <ClockCircleOutlined /> },
  SENT: { color: 'blue', icon: <SendOutlined /> },
  ACKED: { color: 'green', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'red', icon: <ExclamationCircleOutlined /> },
};

const PurchaseOrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [po, setPo] = useState<PoDetail | null>(null);
  const [log, setLog] = useState<TxLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [d, l] = await Promise.all([
        get<PoDetail>(`/purchase-orders/${id}`),
        get<{ items: TxLog[] }>(`/purchase-orders/${id}/transmission-log`),
      ]);
      setPo(d);
      setLog(l.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [id]);

  const transmit = async (method?: string) => {
    if (!id) return;
    setBusy(true);
    try {
      const r = await post<{ state: string; method: string; error?: string }>(
        `/purchase-orders/${id}/transmit`,
        method ? { method } : {},
      );
      if (r.state === 'SENT') message.success(`Sent via ${r.method}`);
      else message.error(`Transmission FAILED: ${r.error ?? 'unknown'}`);
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Transmit failed');
    } finally { setBusy(false); }
  };

  const ack = async () => {
    if (!id) return;
    try {
      await post(`/purchase-orders/${id}/ack`, {});
      message.success('Marked as acknowledged');
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Ack failed');
    }
  };

  if (!po && !loading) return <PageWrap><Empty description="PO not found" /></PageWrap>;
  if (!po) return <PageWrap>Loading…</PageWrap>;

  const stateMeta = STATE_TAG[po.transmissionState] ?? STATE_TAG.NOT_SENT;

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/purchase-orders')}>
              Back
            </Button>
            <Title level={3} style={{ margin: 0 }}>PO {po.number}</Title>
            <Tag>{po.status}</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Dropdown.Button
              type="primary"
              icon={<SendOutlined />}
              loading={busy}
              onClick={() => transmit()}
              menu={{
                items: [
                  { key: 'EDI', label: 'Send via EDI 850' },
                  { key: 'API', label: 'Send via vendor API' },
                  { key: 'PUNCHOUT', label: 'Send via cXML PunchOut' },
                  { key: 'EMAIL', label: 'Send via Email' },
                  { key: 'PORTAL', label: 'Mark as Portal-served' },
                ],
                onClick: ({ key }) => transmit(key),
              }}
            >
              {po.transmissionState === 'FAILED' ? 'Retry transmit' : 'Transmit'}
            </Dropdown.Button>
            {po.transmissionState === 'SENT' && (
              <Button icon={<CheckCircleOutlined />} onClick={ack}>
                Mark ACKED
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={16}>
          <Card size="small" title="Purchase order">
            <Descriptions size="small" column={2} colon>
              <Descriptions.Item label="Vendor">
                <Text code>{po.vendorId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Total">
                {po.totalUsd != null
                  ? `${po.currency ?? 'USD'} ${po.totalUsd.toLocaleString()}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Issued">{po.date ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Needed by">{po.neededByDate ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Requisition" span={2}>
                {po.requisitionId
                  ? <Link to={`/requisitions?id=${po.requisitionId}`}><Text code>{po.requisitionId.slice(0, 8)}</Text></Link>
                  : '—'}
              </Descriptions.Item>
              {po.notes && <Descriptions.Item label="Notes" span={2}>{po.notes}</Descriptions.Item>}
            </Descriptions>
          </Card>
        </Col>
        <Col span={8}>
          <Card
            size="small"
            title={<Space>{stateMeta.icon} Transmission</Space>}
          >
            <Descriptions size="small" column={1} colon>
              <Descriptions.Item label="State">
                <Tag color={stateMeta.color}>{po.transmissionState}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Method">{po.transmissionMethod ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Attempts">{po.transmissionAttempts}</Descriptions.Item>
              <Descriptions.Item label="Last sent">
                {po.transmittedAt ? new Date(po.transmittedAt).toLocaleString() : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="ACK at">
                {po.vendorAckAt ? new Date(po.vendorAckAt).toLocaleString() : '—'}
              </Descriptions.Item>
            </Descriptions>
            {po.transmissionError && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 8 }}
                message="Last error"
                description={po.transmissionError}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card size="small" title={`Line items (${po.items.length})`} style={{ marginBottom: 12 }}>
        <Table<PoItem>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={po.items}
          columns={[
            { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
            { title: 'Description', dataIndex: 'description' },
            { title: 'Mfr#', dataIndex: 'manufacturerNumber', width: 120 },
            { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' as const },
            {
              title: 'Unit price',
              dataIndex: 'unitPriceUsd',
              width: 110,
              align: 'right' as const,
              render: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—',
            },
            {
              title: 'Line total',
              dataIndex: 'lineTotalUsd',
              width: 120,
              align: 'right' as const,
              render: (v) => v != null ? <strong>${Number(v).toFixed(2)}</strong> : '—',
            },
          ]}
        />
      </Card>

      <Card size="small" title={`Transmission log (${log.length} attempts)`}>
        {log.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No transmission attempts yet" />
        ) : (
          <Table<TxLog>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={log}
            columns={[
              { title: '#', dataIndex: 'attemptNumber', width: 50 },
              {
                title: 'When',
                dataIndex: 'startedAt',
                width: 170,
                render: (v) => new Date(v).toLocaleString(),
              },
              { title: 'Method', dataIndex: 'method', width: 100, render: (v) => <Tag>{v}</Tag> },
              {
                title: 'State',
                dataIndex: 'state',
                width: 100,
                render: (v) => <Tag color={STATE_TAG[v]?.color ?? 'default'}>{v}</Tag>,
              },
              {
                title: 'Endpoint',
                dataIndex: 'endpoint',
                ellipsis: true,
                render: (v) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—',
              },
              {
                title: 'HTTP',
                dataIndex: 'responseStatus',
                width: 70,
                render: (v) => v ?? '—',
              },
              {
                title: 'Duration',
                dataIndex: 'durationMs',
                width: 90,
                align: 'right' as const,
                render: (v) => v != null ? `${v}ms` : '—',
              },
              {
                title: 'Detail',
                ellipsis: true,
                render: (_, r) =>
                  r.errorMessage
                    ? <Tooltip title={r.errorMessage}><Text type="danger" style={{ fontSize: 12 }}>{r.errorMessage}</Text></Tooltip>
                    : r.responseBodySample
                      ? <Tooltip title={r.responseBodySample}><Text type="secondary" style={{ fontSize: 12 }}>{r.responseBodySample.slice(0, 60)}{r.responseBodySample.length > 60 ? '…' : ''}</Text></Tooltip>
                      : '—',
              },
            ]}
          />
        )}
      </Card>
    </PageWrap>
  );
};

export default PurchaseOrderDetail;
