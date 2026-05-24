/**
 * Lab stock-movement audit log.
 *
 * Append-only log of every RECEIVE / ISSUE / ADJUST / EXPIRE / TRANSFER_* /
 * QUARANTINE / RECALL event. Filters by site, consumable, movement type,
 * date range. Powers regulatory traceability (CLIA, ISO 15189, CAP).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Tooltip,
} from 'antd';
import { ReloadOutlined, HistoryOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import styled from 'styled-components';
import { get } from '../../../api/client';
import { labInventoryApi, type LabConsumable } from '../../../api/labInventory';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const PageWrap = styled.div`padding: 24px;`;

const MOVEMENT_TYPES = [
  'RECEIVE','ISSUE','ADJUST','EXPIRE','TRANSFER_OUT','TRANSFER_IN','QUARANTINE','RECALL',
] as const;

const TYPE_COLOR: Record<string, string> = {
  RECEIVE: 'green',
  ISSUE: 'blue',
  ADJUST: 'gold',
  EXPIRE: 'red',
  TRANSFER_OUT: 'orange',
  TRANSFER_IN: 'cyan',
  QUARANTINE: 'magenta',
  RECALL: 'red',
};

interface KitSite { id: string; name: string }
interface Movement {
  id: string;
  lotId: string;
  consumableId: string;
  siteId: string;
  movementType: string;
  quantity: number;
  quantityAfter: number;
  relatedOrderId: string | null;
  relatedLabOrderId: string | null;
  relatedTransferId: string | null;
  reason: string | null;
  performedByUserId: string | null;
  occurredAt: string;
}

export const LabAuditLogPage: React.FC = () => {
  const [sites, setSites] = useState<KitSite[]>([]);
  const [consumables, setConsumables] = useState<LabConsumable[]>([]);
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{
    siteId?: string;
    consumableId?: string;
    movementType?: string;
    range?: [dayjs.Dayjs, dayjs.Dayjs];
  }>({
    range: [dayjs().subtract(30, 'day'), dayjs()],
  });

  // Lookups
  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([
          get<{ items: KitSite[] } | KitSite[]>('/labs/kit-sites'),
          labInventoryApi.listConsumables({ isActive: '1' }),
        ]);
        setSites(Array.isArray(s) ? s : s.items ?? []);
        setConsumables(c.items ?? []);
      } catch { /* noop */ }
    })();
  }, []);

  const fetch = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter.siteId) params.siteId = filter.siteId;
      if (filter.consumableId) params.consumableId = filter.consumableId;
      if (filter.movementType) params.movementType = filter.movementType;
      if (filter.range) {
        params.fromDate = filter.range[0].startOf('day').toISOString();
        params.toDate = filter.range[1].endOf('day').toISOString();
      }
      const r = await get<{ items: Movement[] }>(
        '/lab-movements' + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''),
      );
      setRows(r.items ?? []);
    } catch (err) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter.siteId, filter.consumableId, filter.movementType, filter.range]);

  const consumableMap = useMemo(
    () => new Map(consumables.map((c) => [c.id, c])),
    [consumables],
  );
  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  // CSV export
  const downloadCsv = () => {
    const headers = ['Timestamp', 'Type', 'Site', 'Consumable', 'Lot', 'Qty', 'After', 'Reason', 'User'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const c = consumableMap.get(r.consumableId);
      lines.push(
        [
          new Date(r.occurredAt).toISOString(),
          r.movementType,
          (siteMap.get(r.siteId) ?? r.siteId).replace(/,/g, ' '),
          (c?.itemCode ?? r.consumableId).replace(/,/g, ' '),
          r.lotId.slice(0, 8),
          r.quantity,
          r.quantityAfter,
          (r.reason ?? '').replace(/,/g, ' ').replace(/\n/g, ' '),
          r.performedByUserId ?? '',
        ].join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab-audit-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><HistoryOutlined /> Stock Movement Audit</Space>
          </Title>
          <Text type="secondary">
            Append-only log of every stock change. Filter, search, export for regulatory traceability (CLIA, ISO 15189, CAP).
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={downloadCsv} disabled={rows.length === 0}>
              Export CSV
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void fetch()}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={12} align="middle">
          <Col xs={24} md={5}>
            <Select
              placeholder="All sites"
              allowClear
              style={{ width: '100%' }}
              value={filter.siteId}
              onChange={(v) => setFilter((f) => ({ ...f, siteId: v }))}
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={6}>
            <Select
              placeholder="All consumables"
              allowClear
              style={{ width: '100%' }}
              value={filter.consumableId}
              onChange={(v) => setFilter((f) => ({ ...f, consumableId: v }))}
              options={consumables.map((c) => ({ value: c.id, label: `${c.itemCode} — ${c.description}` }))}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              placeholder="All types"
              allowClear
              style={{ width: '100%' }}
              value={filter.movementType}
              onChange={(v) => setFilter((f) => ({ ...f, movementType: v }))}
              options={MOVEMENT_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))}
            />
          </Col>
          <Col xs={24} md={9}>
            <RangePicker
              style={{ width: '100%' }}
              value={filter.range}
              onChange={(v) => setFilter((f) => ({ ...f, range: v as any }))}
            />
          </Col>
        </Row>
      </Card>

      <Card size="small">
        {rows.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No movements in this window" />
        ) : (
          <Table<Movement>
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={rows}
            pagination={{ pageSize: 50, showSizeChanger: true }}
            columns={[
              {
                title: 'When', dataIndex: 'occurredAt', width: 160,
                render: (v) => (
                  <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm:ss')}>
                    {dayjs(v).format('MMM D h:mm A')}
                  </Tooltip>
                ),
              },
              {
                title: 'Type', dataIndex: 'movementType', width: 130,
                render: (t: string) => <Tag color={TYPE_COLOR[t] ?? 'default'}>{t.replace('_', ' ')}</Tag>,
              },
              {
                title: 'Site', dataIndex: 'siteId', width: 160, ellipsis: true,
                render: (sid: string) => siteMap.get(sid) ?? sid.slice(0, 8),
              },
              {
                title: 'Consumable', dataIndex: 'consumableId', ellipsis: true,
                render: (cid: string) => {
                  const c = consumableMap.get(cid);
                  return c ? <span><strong>{c.itemCode}</strong> {c.description}</span> : cid.slice(0, 8);
                },
              },
              { title: 'Lot', dataIndex: 'lotId', width: 90, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> },
              {
                title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' as const,
                render: (q: number) => <strong style={{ color: q > 0 ? '#52c41a' : q < 0 ? '#cf1322' : undefined }}>{q > 0 ? '+' + q : q}</strong>,
              },
              { title: 'After', dataIndex: 'quantityAfter', width: 70, align: 'right' as const },
              { title: 'Reason', dataIndex: 'reason', ellipsis: true },
              {
                title: 'Related', width: 110,
                render: (_: any, r) => (
                  <Space size={2}>
                    {r.relatedLabOrderId && <Tag>Lab</Tag>}
                    {r.relatedOrderId && <Tag color="blue">Order</Tag>}
                    {r.relatedTransferId && <Tag color="cyan">Transfer</Tag>}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>
    </PageWrap>
  );
};

export default LabAuditLogPage;
