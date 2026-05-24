/**
 * Admin page for managing GPO organizations + their contract rates.
 *
 * Two-column layout:
 *   - LEFT: GPO organization picker (Vizient / Premier / HealthTrust / etc.)
 *   - RIGHT: contract items for the selected GPO (HCPC, rate, effective dates)
 *
 * Admins can also bulk-add items via a CSV-style textarea.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Statistic,
  Row,
  Col,
  DatePicker,
  Tooltip,
  Divider,
} from 'antd';
import { PlusOutlined, DeleteOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { gpoApi, GPO_KINDS, type GpoOrganization, type GpoContractItem, type GpoKind } from '../../../api/gpo';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;

const SidebarCard = styled(Card)`
  margin-bottom: 16px;
  cursor: pointer;
  transition: border-color 0.2s;
  &:hover { border-color: #1BAEE5; }
`;

export const GpoContracts: React.FC = () => {
  const [gpos, setGpos] = useState<GpoOrganization[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<GpoContractItem[]>([]);
  const [stats, setStats] = useState<{ memberHospitalCount: number; contractItemCount: number } | null>(null);
  const [loadingGpos, setLoadingGpos] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [createGpoOpen, setCreateGpoOpen] = useState(false);

  // ── Load GPOs ────────────────────────────────────────────────
  const fetchGpos = async () => {
    setLoadingGpos(true);
    try {
      const resp = await gpoApi.listOrganizations();
      setGpos(resp.items);
      if (!selectedId && resp.items.length > 0) setSelectedId(resp.items[0].id);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load GPOs');
    } finally {
      setLoadingGpos(false);
    }
  };
  useEffect(() => {
    void fetchGpos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load items for the selected GPO ──────────────────────────
  const fetchItems = async () => {
    if (!selectedId) return;
    setLoadingItems(true);
    try {
      const [itemsResp, gpoResp] = await Promise.all([
        gpoApi.listItems(selectedId),
        gpoApi.getOrganization(selectedId),
      ]);
      setItems(itemsResp.items);
      setStats({
        memberHospitalCount: gpoResp.memberHospitalCount,
        contractItemCount: gpoResp.contractItemCount,
      });
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load GPO items');
    } finally {
      setLoadingItems(false);
    }
  };
  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectedGpo = useMemo(() => gpos.find((g) => g.id === selectedId), [gpos, selectedId]);

  // ── Single-item add ──────────────────────────────────────────
  const [addForm] = Form.useForm();
  const handleAddItem = async () => {
    let values: any;
    try {
      values = await addForm.validateFields();
    } catch {
      return;
    }
    if (!selectedId) return;
    try {
      await gpoApi.upsertItems(selectedId, [
        {
          hcpcCode: values.hcpcCode,
          rateUsd: values.rateUsd,
          effectiveStartDate: dayjs(values.effectiveStartDate).format('YYYY-MM-DD'),
          effectiveEndDate: values.effectiveEndDate
            ? dayjs(values.effectiveEndDate).format('YYYY-MM-DD')
            : undefined,
          description: values.description,
          sourceContractId: values.sourceContractId,
        },
      ]);
      message.success('Item added');
      setAddItemOpen(false);
      addForm.resetFields();
      void fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to add item');
    }
  };

  // ── Bulk import via textarea ─────────────────────────────────
  const [bulkText, setBulkText] = useState('');
  const handleBulk = async () => {
    if (!selectedId) return;
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      message.warning('Paste at least one line: HCPC,Rate,EffectiveStart[,EffectiveEnd]');
      return;
    }
    const items = lines.map((line) => {
      const [hcpcCode, rate, start, end] = line.split(',').map((p) => p.trim());
      return {
        hcpcCode,
        rateUsd: Number(rate),
        effectiveStartDate: start || dayjs().format('YYYY-MM-DD'),
        effectiveEndDate: end || undefined,
      };
    });
    try {
      const resp = await gpoApi.upsertItems(selectedId, items);
      message.success(`${resp.processed} item(s) imported`);
      setBulkOpen(false);
      setBulkText('');
      void fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Bulk import failed');
    }
  };

  // ── Delete ───────────────────────────────────────────────────
  const handleDelete = async (itemId: string) => {
    if (!selectedId) return;
    try {
      await gpoApi.deleteItem(selectedId, itemId);
      message.success('Item deleted');
      void fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  // ── Create new GPO ───────────────────────────────────────────
  const [createForm] = Form.useForm();
  const handleCreateGpo = async () => {
    let v: any;
    try {
      v = await createForm.validateFields();
    } catch {
      return;
    }
    try {
      const resp = await gpoApi.createOrganization(v);
      message.success(`GPO "${v.name}" created`);
      setCreateGpoOpen(false);
      createForm.resetFields();
      await fetchGpos();
      setSelectedId(resp.id);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create GPO');
    }
  };

  const columns: ColumnsType<GpoContractItem> = [
    { title: 'HCPC', dataIndex: 'hcpcCode', key: 'hcpcCode', width: 100,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    { title: 'Description', dataIndex: 'description', key: 'description',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    { title: 'Rate (USD)', dataIndex: 'rateUsd', key: 'rateUsd', width: 110, align: 'right',
      render: (v: number) => <Text strong>${v.toFixed(2)}</Text>,
    },
    { title: 'Effective', key: 'effective', width: 200,
      render: (_, r) => (
        <Text type="secondary">
          {r.effectiveStartDate}
          {r.effectiveEndDate ? ` → ${r.effectiveEndDate}` : ' → '}
        </Text>
      ),
    },
    { title: 'Vendor', dataIndex: 'vendorId', key: 'vendorId', width: 120,
      render: (v: string | null) => (v ? <Tag>{v.slice(0, 6)}…</Tag> : <Text type="secondary">Any</Text>),
    },
    { title: 'Status', dataIndex: 'isActive', key: 'isActive', width: 90,
      render: (v: number) => (v === 1 ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
    },
    { title: 'Actions', key: 'actions', width: 80,
      render: (_, r) => (
        <Popconfirm title="Delete this rate?" onConfirm={() => handleDelete(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <PageWrap>
      <Title level={3}>GPO Contracts</Title>
      <Paragraph type="secondary">
        Manage Group Purchasing Organization rates. Hospitals in a GPO get those rates
        applied automatically in the pricing cascade — <code>Contract → GPO Contract →
        Fee Schedule → Medicare → Manual</code>.
      </Paragraph>

      <Row gutter={16}>
        <Col xs={24} md={7}>
          <Card
            title="Organizations"
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setCreateGpoOpen(true)}>Add</Button>}
            loading={loadingGpos}
          >
            {gpos.length === 0 ? (
              <Empty description="No GPOs yet" />
            ) : (
              gpos.map((g) => (
                <SidebarCard
                  key={g.id}
                  size="small"
                  onClick={() => setSelectedId(g.id)}
                  style={{
                    borderColor: selectedId === g.id ? '#1BAEE5' : undefined,
                    background: selectedId === g.id ? '#1BAEE508' : undefined,
                  }}
                >
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong>{g.name}</Text>
                      <Tag color="purple">{g.kind}</Tag>
                    </Space>
                    {g.description && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {g.description.length > 50 ? `${g.description.slice(0, 50)}…` : g.description}
                      </Text>
                    )}
                  </Space>
                </SidebarCard>
              ))
            )}
          </Card>
        </Col>

        <Col xs={24} md={17}>
          {selectedGpo ? (
            <Card
              title={
                <Space>
                  <span>{selectedGpo.name}</span>
                  <Tag color="purple">{selectedGpo.kind}</Tag>
                </Space>
              }
              extra={
                <Space>
                  <Tooltip title="Refresh">
                    <Button size="small" icon={<ReloadOutlined />} onClick={fetchItems} />
                  </Tooltip>
                  <Button size="small" icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>
                    Bulk Import
                  </Button>
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setAddItemOpen(true)}>
                    Add Rate
                  </Button>
                </Space>
              }
            >
              {stats && (
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={12} md={6}><Statistic title="Member Hospitals" value={stats.memberHospitalCount} /></Col>
                  <Col xs={12} md={6}><Statistic title="Contract Rates" value={stats.contractItemCount} /></Col>
                </Row>
              )}
              <Divider style={{ margin: '8px 0 16px 0' }} />
              <Table<GpoContractItem>
                rowKey="id"
                size="small"
                dataSource={items}
                columns={columns}
                loading={loadingItems}
                pagination={{ pageSize: 20 }}
                locale={{ emptyText: 'No rates yet — click "Add Rate" or "Bulk Import" to populate.' }}
              />
            </Card>
          ) : (
            <Card>
              <Empty description="Select a GPO on the left to see its rates" />
            </Card>
          )}
        </Col>
      </Row>

      {/* ── Add single item modal ─────────────────────────────── */}
      <Modal
        open={addItemOpen}
        title="Add GPO Rate"
        onCancel={() => { setAddItemOpen(false); addForm.resetFields(); }}
        onOk={handleAddItem}
        okText="Add"
      >
        <Form layout="vertical" form={addForm}>
          <Form.Item name="hcpcCode" label="HCPC Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. L1832" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input placeholder="e.g. Knee orthosis, adjustable" />
          </Form.Item>
          <Form.Item name="rateUsd" label="Rate (USD)" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="effectiveStartDate" label="Effective Start" rules={[{ required: true }]} initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="effectiveEndDate" label="Effective End (optional)">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="sourceContractId" label="Source Contract # (optional)">
            <Input placeholder="GPO's internal contract identifier" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Bulk import modal ─────────────────────────────────── */}
      <Modal
        open={bulkOpen}
        title="Bulk Import — Paste CSV"
        onCancel={() => setBulkOpen(false)}
        onOk={handleBulk}
        okText="Import"
        width={640}
      >
        <Paragraph type="secondary">
          One line per rate: <code>HCPC,Rate,EffectiveStart[,EffectiveEnd]</code>. Dates in <code>YYYY-MM-DD</code>.
        </Paragraph>
        <Input.TextArea
          rows={10}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={'L1832,125.50,2026-01-01\nL3900,87.25,2026-01-01,2026-12-31\nA4210,12.10,2026-03-01'}
        />
      </Modal>

      {/* ── Create new GPO modal ──────────────────────────────── */}
      <Modal
        open={createGpoOpen}
        title="Add GPO Organization"
        onCancel={() => { setCreateGpoOpen(false); createForm.resetFields(); }}
        onOk={handleCreateGpo}
        okText="Create"
      >
        <Form layout="vertical" form={createForm} initialValues={{ kind: 'OTHER' as GpoKind }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Capstone Health Alliance" />
          </Form.Item>
          <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
            <Select>
              {GPO_KINDS.map((k) => <Select.Option key={k} value={k}>{k}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input placeholder="https://" />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrap>
  );
};

export default GpoContracts;
