/**
 * Lab Inventory dashboard. Two-pane layout:
 *   - LEFT: kit sites picker (each site = an inventory location)
 *   - RIGHT: per-site stock summary table with filters (OOS / below par / expiring)
 *
 * Header tabs: Stock summary · All lots · Expiring soon · Reorder candidates · Item master
 * Action buttons on lots: Receive · Issue · Transfer · Adjust · Quarantine · Recall · History
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  InboxOutlined,
  ExperimentOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SwapOutlined,
  EditOutlined,
  DeleteOutlined,
  HistoryOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  labInventoryApi,
  LAB_CONSUMABLE_CATEGORIES,
  HAZARD_CLASSES,
  type LabConsumable,
  type LabLot,
  type SiteSummaryRow,
  type StockMovement,
} from '../../../api/labInventory';
import { get } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;
const SiteCard = styled(Card)<{ $active?: boolean }>`
  margin-bottom: 8px;
  cursor: pointer;
  border-color: ${(p) => (p.$active ? '#1BAEE5' : undefined)};
  background: ${(p) => (p.$active ? '#E6F7FF' : undefined)};
  &:hover { border-color: #1BAEE5; }
`;

interface KitSite { id: string; name: string; address?: string }

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  QUARANTINED: 'orange',
  RECALLED: 'magenta',
  DEPLETED: 'default',
};

export const LabInventoryPage: React.FC = () => {
  const [sites, setSites] = useState<KitSite[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SiteSummaryRow[]>([]);
  const [lots, setLots] = useState<LabLot[]>([]);
  const [expiring, setExpiring] = useState<LabLot[]>([]);
  const [reorder, setReorder] = useState<SiteSummaryRow[]>([]);
  const [consumables, setConsumables] = useState<LabConsumable[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{ category: string; q: string }>({ category: '', q: '' });
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveForm] = Form.useForm();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm] = Form.useForm();
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [itemForm] = Form.useForm();
  const [historyDrawer, setHistoryDrawer] = useState<{ lotId: string; lotNumber: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<StockMovement[]>([]);

  // Load kit sites for the left pane
  useEffect(() => {
    (async () => {
      try {
        const r = await get<{ items: KitSite[] } | KitSite[]>('/labs/kit-sites');
        const items = Array.isArray(r) ? r : r.items ?? [];
        setSites(items);
        if (items.length && !siteId) setSiteId(items[0].id);
      } catch (err) { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load consumable catalog (for receive / issue / item-master tab)
  useEffect(() => {
    (async () => {
      try {
        const r = await labInventoryApi.listConsumables({ isActive: '1' });
        setConsumables(r.items ?? []);
      } catch { /* noop */ }
    })();
  }, []);

  // Reload data when siteId or category filter changes
  const reload = async () => {
    setLoading(true);
    try {
      const [s, l, e, rc] = await Promise.all([
        labInventoryApi.summary(siteId ? { siteId, category: filter.category || undefined } : { category: filter.category || undefined }),
        siteId ? labInventoryApi.listLots({ siteId }) : Promise.resolve({ items: [] }),
        labInventoryApi.expiring(30),
        labInventoryApi.reorderCandidates(siteId ? { siteId } : undefined),
      ]);
      setSummary(s.items ?? []);
      setLots(l.items ?? []);
      setExpiring(e.items ?? []);
      setReorder(rc.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [siteId, filter.category]);

  // ── Item master create ──────────────────────────────────────────────────
  const openCreateItem = () => {
    itemForm.resetFields();
    itemForm.setFieldsValue({ category: 'REAGENT', hazardClass: 'NONE', usageUom: 'each', requiresLotTracking: true });
    setCreateItemOpen(true);
  };
  const submitCreateItem = async () => {
    try {
      const v = await itemForm.validateFields();
      await labInventoryApi.createConsumable(v);
      message.success('Item added to catalog');
      setCreateItemOpen(false);
      const r = await labInventoryApi.listConsumables({ isActive: '1' });
      setConsumables(r.items ?? []);
      void reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  // ── Receive ─────────────────────────────────────────────────────────────
  const openReceive = (consumableId?: string) => {
    receiveForm.resetFields();
    receiveForm.setFieldsValue({ siteId, consumableId, quantity: 1 });
    setReceiveOpen(true);
  };
  const submitReceive = async () => {
    try {
      const v = await receiveForm.validateFields();
      await labInventoryApi.receiveLot({
        consumableId: v.consumableId,
        siteId: v.siteId,
        lotNumber: v.lotNumber,
        quantity: Number(v.quantity),
        expirationDate: v.expirationDate ? dayjs(v.expirationDate).format('YYYY-MM-DD') : undefined,
        unitPriceUsd: v.unitPriceUsd ? Number(v.unitPriceUsd) : undefined,
      });
      message.success('Lot received');
      setReceiveOpen(false);
      void reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  // ── Issue (FEFO) ────────────────────────────────────────────────────────
  const openIssue = (consumableId?: string) => {
    issueForm.resetFields();
    issueForm.setFieldsValue({ siteId, consumableId, quantity: 1 });
    setIssueOpen(true);
  };
  const submitIssue = async () => {
    try {
      const v = await issueForm.validateFields();
      const r = await labInventoryApi.issue({
        consumableId: v.consumableId,
        siteId: v.siteId,
        quantity: Number(v.quantity),
        reason: v.reason,
      });
      if (r.remaining > 0) {
        message.warning(`Issued ${Number(v.quantity) - r.remaining} of ${v.quantity} — ${r.remaining} short`);
      } else {
        message.success(`Issued ${v.quantity} (from ${r.issuedFromLots.length} lot${r.issuedFromLots.length !== 1 ? 's' : ''})`);
      }
      setIssueOpen(false);
      void reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  // ── History drawer ──────────────────────────────────────────────────────
  const openHistory = async (lot: LabLot) => {
    setHistoryDrawer({ lotId: lot.id, lotNumber: lot.lotNumber });
    try {
      const r = await labInventoryApi.movementsByLot(lot.id);
      setHistoryRows(r.items ?? []);
    } catch (err: any) {
      message.error('Failed to load history');
    }
  };

  // ── Quarantine / Recall ────────────────────────────────────────────────
  const quarantine = async (lot: LabLot) => {
    Modal.confirm({
      title: `Quarantine lot ${lot.lotNumber}?`,
      content: 'Lot will be pulled from active inventory pending decision.',
      onOk: async () => {
        await labInventoryApi.quarantineLot(lot.id, 'Manual quarantine');
        message.success('Quarantined');
        void reload();
      },
    });
  };
  const recall = async (lot: LabLot) => {
    Modal.confirm({
      title: `Recall lot ${lot.lotNumber}?`,
      content: 'Vendor / manufacturer recall. Lot is permanently removed from inventory.',
      okButtonProps: { danger: true },
      onOk: async () => {
        await labInventoryApi.recallLot(lot.id, 'Manual recall');
        message.success('Recalled');
        void reload();
      },
    });
  };

  // ── Filtered summary by search ─────────────────────────────────────────
  const filteredSummary = useMemo(
    () => summary.filter((s) =>
      !filter.q || s.itemCode.toLowerCase().includes(filter.q.toLowerCase()) || s.description.toLowerCase().includes(filter.q.toLowerCase()),
    ),
    [summary, filter.q],
  );

  // ── KPI tiles ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const sku = summary.length;
    const oos = summary.filter((s) => s.belowMin || s.totalOnHand === 0).length;
    const belowReorder = summary.filter((s) => s.belowReorderPoint).length;
    const expiringCount = expiring.length;
    return { sku, oos, belowReorder, expiringCount };
  }, [summary, expiring]);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Lab Inventory</Title>
          <Text type="secondary">Per-site stock with lot tracking, expiration alerts, and FEFO issuance.</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>Refresh</Button>
            <Button icon={<PlusOutlined />} onClick={openCreateItem}>Add item</Button>
            <Button icon={<DownloadOutlined />} type="primary" onClick={() => openReceive()}>Receive lot</Button>
            <Button icon={<ExperimentOutlined />} onClick={() => openIssue()}>Issue (FEFO)</Button>
          </Space>
        </Col>
      </Row>

      {/* KPI tiles */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="SKUs tracked" value={kpis.sku} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Out of stock" value={kpis.oos} valueStyle={{ color: kpis.oos > 0 ? '#cf1322' : '#52c41a' }} prefix={<WarningOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Below reorder point" value={kpis.belowReorder} valueStyle={{ color: kpis.belowReorder > 0 ? '#fa8c16' : '#52c41a' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Lots expiring in 30d" value={kpis.expiringCount} valueStyle={{ color: kpis.expiringCount > 0 ? '#cf1322' : '#52c41a' }} prefix={<ClockCircleOutlined />} /></Card></Col>
      </Row>

      <Row gutter={16}>
        {/* Sites pane */}
        <Col xs={24} md={5}>
          <Card title="Kit sites" size="small">
            {sites.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No kit sites" />
            ) : (
              sites.map((s) => (
                <SiteCard key={s.id} $active={siteId === s.id} size="small" onClick={() => setSiteId(s.id)}>
                  <strong>{s.name}</strong>
                  {s.address && <div><Text type="secondary" style={{ fontSize: 12 }}>{s.address}</Text></div>}
                </SiteCard>
              ))
            )}
          </Card>
        </Col>

        {/* Main pane */}
        <Col xs={24} md={19}>
          <Card size="small">
            <Tabs
              items={[
                {
                  key: 'summary',
                  label: <Space><InboxOutlined /> Stock summary <Tag>{filteredSummary.length}</Tag></Space>,
                  children: (
                    <>
                      <Space style={{ marginBottom: 8 }}>
                        <Select
                          style={{ width: 160 }}
                          placeholder="All categories"
                          allowClear
                          value={filter.category || undefined}
                          onChange={(v) => setFilter((f) => ({ ...f, category: v ?? '' }))}
                          options={LAB_CONSUMABLE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                        />
                        <Input.Search
                          placeholder="Search code / description"
                          allowClear
                          style={{ width: 280 }}
                          onSearch={(v) => setFilter((f) => ({ ...f, q: v }))}
                        />
                      </Space>
                      <Table<SiteSummaryRow>
                        size="small"
                        rowKey={(r) => `${r.consumableId}-${r.siteId}`}
                        loading={loading}
                        dataSource={filteredSummary}
                        columns={summaryColumns(openReceive, openIssue)}
                        pagination={{ pageSize: 25 }}
                      />
                    </>
                  ),
                },
                {
                  key: 'lots',
                  label: <Space>All lots <Tag>{lots.length}</Tag></Space>,
                  children: (
                    <Table<LabLot>
                      size="small"
                      rowKey="id"
                      loading={loading}
                      dataSource={lots}
                      columns={lotColumns(openHistory, quarantine, recall, consumables)}
                      pagination={{ pageSize: 25 }}
                    />
                  ),
                },
                {
                  key: 'expiring',
                  label: <Space>Expiring (30d) <Tag color={expiring.length > 0 ? 'red' : 'green'}>{expiring.length}</Tag></Space>,
                  children: (
                    <Table<LabLot>
                      size="small"
                      rowKey="id"
                      dataSource={expiring}
                      columns={lotColumns(openHistory, quarantine, recall, consumables)}
                      pagination={{ pageSize: 25 }}
                    />
                  ),
                },
                {
                  key: 'reorder',
                  label: <Space>Reorder needed <Tag color={reorder.length > 0 ? 'orange' : 'green'}>{reorder.length}</Tag></Space>,
                  children: (
                    <Table<SiteSummaryRow>
                      size="small"
                      rowKey={(r) => `${r.consumableId}-${r.siteId}`}
                      dataSource={reorder}
                      columns={summaryColumns(openReceive, openIssue)}
                      pagination={{ pageSize: 25 }}
                    />
                  ),
                },
                {
                  key: 'master',
                  label: <Space>Item master <Tag>{consumables.length}</Tag></Space>,
                  children: (
                    <Table<LabConsumable>
                      size="small"
                      rowKey="id"
                      dataSource={consumables}
                      columns={[
                        { title: 'Code', dataIndex: 'itemCode', width: 120 },
                        { title: 'Description', dataIndex: 'description' },
                        { title: 'Category', dataIndex: 'category', width: 110, render: (v) => <Tag>{v}</Tag> },
                        { title: 'Hazard', dataIndex: 'hazardClass', width: 120, render: (v) => v === 'NONE' ? '—' : <Tag color="orange">{v}</Tag> },
                        { title: 'UOM', dataIndex: 'usageUom', width: 70 },
                        { title: 'Min', dataIndex: 'minThreshold', width: 60 },
                        { title: 'Reorder', dataIndex: 'reorderPoint', width: 80 },
                        { title: 'Max', dataIndex: 'maxThreshold', width: 60 },
                        { title: 'Lot tracking', dataIndex: 'requiresLotTracking', width: 110, render: (v) => v ? <Tag color="blue">Required</Tag> : '—' },
                      ]}
                      pagination={{ pageSize: 25 }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* Receive lot modal */}
      <Modal title="Receive lot" open={receiveOpen} onCancel={() => setReceiveOpen(false)} onOk={submitReceive} okText="Receive">
        <Form form={receiveForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="consumableId" label="Item" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={consumables.map((c) => ({ value: c.id, label: `${c.itemCode} — ${c.description}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
                <Select options={sites.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={10}><Form.Item name="lotNumber" label="Lot #" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={7}><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={7}><Form.Item name="expirationDate" label="Expiration"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="unitPriceUsd" label="Unit price ($)"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>

      {/* Issue modal */}
      <Modal title="Issue (FEFO consume)" open={issueOpen} onCancel={() => setIssueOpen(false)} onOk={submitIssue} okText="Issue">
        <Form form={issueForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}><Form.Item name="consumableId" label="Item" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={consumables.map((c) => ({ value: c.id, label: `${c.itemCode} — ${c.description}` }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="siteId" label="Site" rules={[{ required: true }]}><Select options={sites.map((s) => ({ value: s.id, label: s.name }))} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="reason" label="Reason / lab order ref"><Input placeholder="e.g. Run 2026-05-23-A" /></Form.Item></Col>
          </Row>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            FEFO: oldest non-expired ACTIVE lot is consumed first. May span multiple lots.
          </Paragraph>
        </Form>
      </Modal>

      {/* Create item modal */}
      <Modal title="Add lab consumable" open={createItemOpen} onCancel={() => setCreateItemOpen(false)} onOk={submitCreateItem} width={720} okText="Add">
        <Form form={itemForm} layout="vertical">
          <Row gutter={12}>
            <Col span={8}><Form.Item name="itemCode" label="Item code / SKU" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={16}><Form.Item name="description" label="Description" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="category" label="Category" rules={[{ required: true }]}><Select options={LAB_CONSUMABLE_CATEGORIES.map((c) => ({ value: c, label: c }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="hazardClass" label="Hazard class"><Select options={HAZARD_CLASSES.map((h) => ({ value: h, label: h }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="usageUom" label="UOM"><Input placeholder="each / mL / test" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}><Form.Item name="storageTempMinC" label="Storage min (°C)"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="storageTempMaxC" label="Storage max (°C)"><InputNumber style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="unitsPerCase" label="Units / case"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="defaultUnitPriceUsd" label="Default price"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}><Form.Item name="minThreshold" label="Min"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="reorderPoint" label="Reorder point"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="maxThreshold" label="Max"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6}><Form.Item name="reorderQuantity" label="Default order qty"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="requiresLotTracking" valuePropName="checked"><Switch /> <span style={{ marginLeft: 8 }}>Requires lot tracking</span></Form.Item>
        </Form>
      </Modal>

      {/* History drawer */}
      <Drawer title={historyDrawer ? `Movements — lot ${historyDrawer.lotNumber}` : ''} open={!!historyDrawer} onClose={() => setHistoryDrawer(null)} width={680}>
        <Table<StockMovement>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={historyRows}
          columns={[
            { title: 'When', dataIndex: 'occurredAt', width: 150, render: (v) => dayjs(v).format('MMM D, h:mm A') },
            { title: 'Type', dataIndex: 'movementType', width: 110, render: (v) => <Tag>{v}</Tag> },
            { title: 'Qty', dataIndex: 'quantity', width: 60 },
            { title: 'After', dataIndex: 'quantityAfter', width: 60 },
            { title: 'Reason', dataIndex: 'reason' },
          ]}
        />
      </Drawer>
    </PageWrap>
  );
};

// ── Column factories (defined here so they can reference receive/issue handlers) ─
function summaryColumns(
  openReceive: (consumableId?: string) => void,
  openIssue: (consumableId?: string) => void,
): ColumnsType<SiteSummaryRow> {
  return [
    { title: 'Code', dataIndex: 'itemCode', width: 110 },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Category', dataIndex: 'category', width: 100, render: (v) => <Tag>{v}</Tag> },
    {
      title: 'On hand', dataIndex: 'totalOnHand', width: 90, align: 'right',
      render: (v: number, r) => (
        <span>
          <strong style={{ color: r.belowMin ? '#cf1322' : r.belowReorderPoint ? '#fa8c16' : undefined }}>{v}</strong>
        </span>
      ),
    },
    { title: 'Reorder', dataIndex: 'reorderPoint', width: 80, align: 'right', render: (v: number | null) => v ?? '—' },
    { title: 'Min', dataIndex: 'minThreshold', width: 60, align: 'right', render: (v: number | null) => v ?? '—' },
    { title: 'Max', dataIndex: 'maxThreshold', width: 60, align: 'right', render: (v: number | null) => v ?? '—' },
    { title: 'Lots', dataIndex: 'lotCount', width: 60, align: 'right' },
    {
      title: 'Oldest expires', dataIndex: 'oldestExpiration', width: 130,
      render: (v: string | null, r) =>
        v ? (
          <Tooltip title={dayjs(v).format('MMM D, YYYY')}>
            <Tag color={r.hasExpiredLot ? 'red' : r.hasExpiringSoon ? 'orange' : 'default'}>
              {r.daysToOldestExpiration != null
                ? (r.daysToOldestExpiration <= 0 ? 'EXPIRED' : `${r.daysToOldestExpiration}d`)
                : '—'}
            </Tag>
          </Tooltip>
        ) : '—',
    },
    {
      title: 'Status', width: 130,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.belowMin && <Tag color="red">OOS RISK</Tag>}
          {r.belowReorderPoint && !r.belowMin && <Tag color="orange">REORDER</Tag>}
          {r.hasExpiringSoon && <Tag color="gold">EXPIRING</Tag>}
        </Space>
      ),
    },
    {
      title: '',
      width: 180,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => openReceive(r.consumableId)}>Receive</Button>
          <Button size="small" icon={<ExperimentOutlined />} onClick={() => openIssue(r.consumableId)}>Issue</Button>
        </Space>
      ),
    },
  ];
}

function lotColumns(
  openHistory: (l: LabLot) => void,
  quarantine: (l: LabLot) => void,
  recall: (l: LabLot) => void,
  consumables: LabConsumable[],
): ColumnsType<LabLot> {
  return [
    {
      title: 'Item', dataIndex: 'consumableId', width: 200, ellipsis: true,
      render: (cid: string) => {
        const c = consumables.find((x) => x.id === cid);
        return c ? <span><strong>{c.itemCode}</strong> {c.description}</span> : cid;
      },
    },
    { title: 'Lot #', dataIndex: 'lotNumber', width: 120 },
    { title: 'On hand', dataIndex: 'quantityOnHand', width: 80, align: 'right' },
    { title: 'Expires', dataIndex: 'expirationDate', width: 130, render: (v: string | null) => v ? dayjs(v).format('MMM D, YYYY') : '—' },
    { title: 'Status', dataIndex: 'status', width: 110, render: (s: string) => <Tag color={STATUS_COLORS[s] ?? 'default'}>{s}</Tag> },
    { title: 'Received', dataIndex: 'receivedAt', width: 120, render: (v: string | null) => v ? dayjs(v).format('MMM D') : '—' },
    {
      title: '',
      width: 220,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(r)} />
          {r.status === 'ACTIVE' && <Button size="small" icon={<WarningOutlined />} onClick={() => quarantine(r)}>Quarantine</Button>}
          {r.status !== 'RECALLED' && <Button size="small" danger onClick={() => recall(r)}>Recall</Button>}
        </Space>
      ),
    },
  ];
}

export default LabInventoryPage;
