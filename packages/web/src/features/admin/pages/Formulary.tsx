/**
 * Item Master / Formulary management.
 *
 * Two-pane layout:
 *   - LEFT: facility scope picker (Org-wide + every facility)
 *   - RIGHT: filterable table of formulary items in scope + bulk-import textarea
 *
 * A facility-specific row OVERRIDES an org-wide row for that facility, so the
 * picker lets you author at the right scope. Items can be ACTIVE / INACTIVE /
 * RETIRED — the requisition engine only considers ACTIVE rows.
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
  Switch,
  Table,
  Tag,
  Typography,
  Row,
  Col,
  Drawer,
  Tabs,
  Divider,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import {
  formularyApi,
  FORMULARY_STATUSES,
  type FormularyItem,
  type FormularySubstitute,
  type FormularyStatus,
} from '../../../api/formulary';
import { get } from '../../../api/client';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';
import { usePermissions } from '../../../hooks/usePermissions';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;
const ScopeCard = styled(Card)<{ $active?: boolean }>`
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border-color: ${(p) => (p.$active ? '#1BAEE5' : undefined)};
  background: ${(p) => (p.$active ? '#E6F7FF' : undefined)};
  &:hover { border-color: #1BAEE5; }
`;

interface Facility {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
}

interface Vendor {
  id: string;
  name: string;
}

const ORG_WIDE = '__ORG_WIDE__';

export const FormularyPage: React.FC = () => {
  const user = useSelector((s: RootState) => s.auth.userData);
  const isAdmin = user?.role === 'ACCOUNT_MANAGER' || user?.role === 'ACCOUNT_MANAGER_USER';
  const { canWrite, canDelete } = usePermissions();
  // Admins must pick a hospital; everyone else uses their own
  const [hospitalId, setHospitalId] = useState<string | undefined>(user?.hospitalId ?? undefined);
  const [hospitals, setHospitals] = useState<Array<{ id: string; name: string }>>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [scope, setScope] = useState<string>(ORG_WIDE); // '__ORG_WIDE__' or facilityId
  const [items, setItems] = useState<FormularyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ q: '', status: 'ACTIVE' as FormularyStatus | '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detail, setDetail] = useState<{ item: FormularyItem; subs: FormularySubstitute[] } | null>(null);
  const [form] = Form.useForm();
  const [subForm] = Form.useForm();

  // ── Load hospital list for admins ───────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await get<{ items: Array<{ id: string; name: string }> }>('/hospitals');
        setHospitals(res.items ?? []);
        if (!hospitalId && res.items?.[0]) setHospitalId(res.items[0].id);
      } catch (err) { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // ── Load facilities + vendors when hospitalId changes ───────────────────
  useEffect(() => {
    if (!hospitalId) return;
    (async () => {
      try {
        const [facRes, vRes] = await Promise.all([
          get<{ items: Facility[] }>('/hospital-facilities', { hospitalId }),
          get<{ items: Vendor[] }>('/vendors'),
        ]);
        setFacilities(facRes.items ?? []);
        setVendors(vRes.items ?? []);
      } catch (err) { /* noop */ }
    })();
  }, [hospitalId]);

  // ── Load items when scope/filter changes ────────────────────────────────
  const fetchItems = async () => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const params: any = {
        hospitalId,
        facilityId: scope === ORG_WIDE ? 'null' : scope,
      };
      if (filter.status) params.status = filter.status;
      if (filter.q) params.q = filter.q;
      const res = await formularyApi.list(params);
      setItems(res.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load formulary');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId, scope, filter.status]);

  // ── Create / update ─────────────────────────────────────────────────────
  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ status: 'ACTIVE', requiresPriorAuth: false, isRestricted: false });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      const v = await form.validateFields();
      await formularyApi.create({
        hospitalId,
        facilityId: scope === ORG_WIDE ? null : scope,
        ...v,
      });
      message.success('Item added to formulary');
      setCreateOpen(false);
      void fetchItems();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed to create');
    }
  };

  // ── Detail drawer ───────────────────────────────────────────────────────
  const openDetail = async (id: string) => {
    try {
      const r = await formularyApi.get(id);
      setDetail({ item: r as any, subs: r.substitutes });
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load detail');
    }
  };

  const addSubstitute = async () => {
    if (!detail) return;
    try {
      const v = await subForm.validateFields();
      await formularyApi.addSubstitute(detail.item.id, v);
      message.success('Substitute added');
      subForm.resetFields();
      const r = await formularyApi.get(detail.item.id);
      setDetail({ item: r as any, subs: r.substitutes });
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed to add substitute');
    }
  };

  const removeSubstitute = async (subId: string) => {
    if (!detail) return;
    try {
      await formularyApi.removeSubstitute(detail.item.id, subId);
      const r = await formularyApi.get(detail.item.id);
      setDetail({ item: r as any, subs: r.substitutes });
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to remove');
    }
  };

  const retireItem = async (id: string) => {
    try {
      await formularyApi.retire(id);
      message.success('Item retired');
      void fetchItems();
      if (detail?.item.id === id) setDetail(null);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to retire');
    }
  };

  // ── Bulk import ────────────────────────────────────────────────────────
  const [bulkText, setBulkText] = useState('');
  const submitBulk = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows: any[] = [];
    for (const line of lines) {
      // Expected: HCPC,DESCRIPTION,CATEGORY,MAX_PRICE,REQUIRES_PA,RESTRICTED,PAR,REORDER,UOM
      const parts = line.split(',').map((p) => p.trim());
      if (parts.length < 2) continue;
      rows.push({
        hcpcCode: parts[0],
        description: parts[1],
        category: parts[2] || undefined,
        maxUnitPriceUsd: parts[3] ? Number(parts[3]) : undefined,
        requiresPriorAuth: parts[4] === '1' || parts[4]?.toLowerCase() === 'true',
        isRestricted: parts[5] === '1' || parts[5]?.toLowerCase() === 'true',
        parLevel: parts[6] ? Number(parts[6]) : undefined,
        reorderQuantity: parts[7] ? Number(parts[7]) : undefined,
        unitOfMeasure: parts[8] || undefined,
      });
    }
    if (!rows.length) {
      message.warning('No valid rows. Format: HCPC,DESCRIPTION,CATEGORY,MAX_PRICE,REQ_PA,RESTRICTED,PAR,REORDER,UOM');
      return;
    }
    try {
      const r = await formularyApi.bulkImport({
        hospitalId,
        facilityId: scope === ORG_WIDE ? null : scope,
        items: rows,
      });
      message.success(`${r.inserted} inserted, ${r.updated} updated`);
      setBulkOpen(false);
      setBulkText('');
      void fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to import');
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────
  const columns: ColumnsType<FormularyItem> = useMemo(
    () => [
      {
        title: 'HCPC',
        dataIndex: 'hcpcCode',
        width: 90,
        render: (v: string, r) => (
          <a onClick={() => openDetail(r.id)}>
            <strong>{v}</strong>
          </a>
        ),
      },
      { title: 'Description', dataIndex: 'description', ellipsis: true },
      { title: 'Category', dataIndex: 'category', width: 140 },
      {
        title: 'Max $',
        dataIndex: 'maxUnitPriceUsd',
        width: 90,
        render: (v: number | null) =>
          v == null ? <Text type="secondary">—</Text> : `$${v.toFixed(2)}`,
      },
      {
        title: 'Par',
        dataIndex: 'parLevel',
        width: 70,
        render: (v: number | null) => (v == null ? <Text type="secondary">—</Text> : v),
      },
      {
        title: 'Flags',
        width: 180,
        render: (_: any, r) => (
          <Space size={4} wrap>
            {r.requiresPriorAuth ? (
              <Tag color="orange" icon={<SafetyCertificateOutlined />}>PA</Tag>
            ) : null}
            {r.isRestricted ? (
              <Tag color="red" icon={<WarningOutlined />}>Restricted</Tag>
            ) : null}
            {r.preferredVendorId ? <Tag color="blue">Pref Vendor</Tag> : null}
          </Space>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        width: 100,
        render: (s: FormularyStatus) => (
          <Tag color={s === 'ACTIVE' ? 'green' : s === 'INACTIVE' ? 'default' : 'red'}>{s}</Tag>
        ),
      },
      {
        title: '',
        width: 80,
        render: (_: any, r) =>
          canDelete('formulary') ? (
            <Popconfirm
              title="Retire this item?"
              description="It will no longer appear in requisitions."
              onConfirm={() => retireItem(r.id)}
            >
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : null,
      },
    ],
    [vendors],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Item Master / Formulary
          </Title>
          <Text type="secondary">
            Authoritative list of approved items. Drives requisition validation, preferred-vendor steering, and reorder triggers.
          </Text>
        </Col>
        <Col>
          <Space>
            {isAdmin && (
              <Select
                style={{ width: 240 }}
                placeholder="Select hospital"
                options={hospitals.map((h) => ({ value: h.id, label: h.name }))}
                value={hospitalId}
                onChange={setHospitalId}
                showSearch
                optionFilterProp="label"
              />
            )}
            <Button icon={<ReloadOutlined />} onClick={() => void fetchItems()}>Refresh</Button>
            {canWrite('formulary') && (
              <Button icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>Bulk import</Button>
            )}
            {canWrite('formulary') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Add item
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card title="Scope" size="small" bodyStyle={{ padding: 12 }}>
            <ScopeCard size="small" $active={scope === ORG_WIDE} onClick={() => setScope(ORG_WIDE)}>
              <strong>Organization-wide</strong>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Applies to all facilities unless overridden
                </Text>
              </div>
            </ScopeCard>
            <Divider style={{ margin: '8px 0' }}>Facilities</Divider>
            {facilities.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No facilities" />
            ) : (
              facilities.map((f) => (
                <ScopeCard
                  size="small"
                  key={f.id}
                  $active={scope === f.id}
                  onClick={() => setScope(f.id)}
                >
                  <strong>{f.name}</strong>
                  {f.city || f.state ? (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {[f.city, f.state].filter(Boolean).join(', ')}
                      </Text>
                    </div>
                  ) : null}
                </ScopeCard>
              ))
            )}
          </Card>
        </Col>

        <Col xs={24} md={18}>
          <Card
            size="small"
            title={
              <Space>
                <span>
                  {scope === ORG_WIDE
                    ? 'Organization-wide items'
                    : facilities.find((f) => f.id === scope)?.name ?? 'Facility items'}
                </span>
                <Tag>{items.length}</Tag>
              </Space>
            }
            extra={
              <Space>
                <Input.Search
                  placeholder="Search HCPC or description"
                  allowClear
                  style={{ width: 240 }}
                  onSearch={(v) => {
                    setFilter((f) => ({ ...f, q: v }));
                    setTimeout(() => void fetchItems(), 0);
                  }}
                />
                <Select
                  style={{ width: 130 }}
                  value={filter.status}
                  onChange={(s) => setFilter((f) => ({ ...f, status: s }))}
                  options={[
                    { value: '', label: 'All statuses' },
                    ...FORMULARY_STATUSES.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </Space>
            }
          >
            <Table
              size="small"
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={items}
              pagination={{ pageSize: 25, showSizeChanger: true }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Create modal ─────────────────────────────────────────────── */}
      <Modal
        title="Add formulary item"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        width={680}
        okText="Add"
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Scope:{' '}
          <Tag color="blue">
            {scope === ORG_WIDE
              ? 'Organization-wide'
              : facilities.find((f) => f.id === scope)?.name}
          </Tag>
        </Paragraph>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="hcpcCode" label="HCPC Code" rules={[{ required: true, message: 'HCPC required' }]}>
                <Input placeholder="A4253" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="description" label="Description" rules={[{ required: true }]}>
                <Input placeholder="Glucose monitor blood test strips" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="category" label="Category">
                <Input placeholder="Diabetes Supplies" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unitOfMeasure" label="Unit of measure">
                <Input placeholder="box / each / pack" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status">
                <Select options={FORMULARY_STATUSES.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="preferredVendorId" label="Preferred vendor">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="secondaryVendorId" label="Backup vendor">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="maxUnitPriceUsd" label="Max unit price ($)">
                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="parLevel" label="Par level">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reorderQuantity" label="Reorder qty">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="requiresPriorAuth" label="Requires prior auth" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isRestricted" label="Restricted (needs special approval)" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item shouldUpdate={(p, n) => p.isRestricted !== n.isRestricted}>
            {({ getFieldValue }) =>
              getFieldValue('isRestricted') ? (
                <Form.Item name="restrictionReason" label="Restriction reason">
                  <Input.TextArea rows={2} placeholder="e.g. Requires medical director sign-off" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Bulk import modal ────────────────────────────────────────── */}
      <Modal
        title="Bulk import formulary items"
        open={bulkOpen}
        onCancel={() => setBulkOpen(false)}
        onOk={submitBulk}
        okText="Import"
        width={720}
      >
        <Paragraph type="secondary">
          One row per line, comma-separated:
          <br />
          <Text code>HCPC,DESCRIPTION,CATEGORY,MAX_PRICE,REQ_PA(0/1),RESTRICTED(0/1),PAR,REORDER,UOM</Text>
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Scope:{' '}
          <Tag color="blue">
            {scope === ORG_WIDE
              ? 'Organization-wide'
              : facilities.find((f) => f.id === scope)?.name}
          </Tag>
        </Paragraph>
        <Input.TextArea
          rows={12}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={`A4253,Blood glucose test strips,Diabetes,25.00,0,0,50,100,box
E0114,Crutches forearm,Mobility,80.00,1,0,5,10,pair`}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>

      {/* ── Detail drawer ─────────────────────────────────────────────── */}
      <Drawer
        title={detail ? `${detail.item.hcpcCode} — ${detail.item.description}` : ''}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={620}
      >
        {detail && (
          <Tabs
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <div>
                    <Row gutter={[12, 12]}>
                      <Col span={12}>
                        <Card size="small" title="Status">
                          <Tag color={detail.item.status === 'ACTIVE' ? 'green' : 'default'}>
                            {detail.item.status}
                          </Tag>
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card size="small" title="Category">
                          {detail.item.category ?? <Text type="secondary">—</Text>}
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card size="small" title="Preferred vendor">
                          {detail.item.preferredVendorName ?? <Text type="secondary">—</Text>}
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card size="small" title="Backup vendor">
                          {detail.item.secondaryVendorName ?? <Text type="secondary">—</Text>}
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small" title="Max price">
                          {detail.item.maxUnitPriceUsd != null
                            ? `$${detail.item.maxUnitPriceUsd.toFixed(2)}`
                            : '—'}
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small" title="Par level">
                          {detail.item.parLevel ?? '—'}
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small" title="Reorder qty">
                          {detail.item.reorderQuantity ?? '—'}
                        </Card>
                      </Col>
                    </Row>
                    <Divider />
                    <Space wrap>
                      {detail.item.requiresPriorAuth ? (
                        <Tag color="orange" icon={<SafetyCertificateOutlined />}>
                          Requires prior auth
                        </Tag>
                      ) : (
                        <Tag icon={<CheckCircleOutlined />}>No prior auth</Tag>
                      )}
                      {detail.item.isRestricted ? (
                        <Tag color="red" icon={<WarningOutlined />}>Restricted</Tag>
                      ) : null}
                    </Space>
                    {detail.item.restrictionReason ? (
                      <Paragraph type="secondary" style={{ marginTop: 8 }}>
                        <strong>Reason:</strong> {detail.item.restrictionReason}
                      </Paragraph>
                    ) : null}
                    {detail.item.notes ? (
                      <Paragraph style={{ marginTop: 8 }}>
                        <strong>Notes:</strong> {detail.item.notes}
                      </Paragraph>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'subs',
                label: `Substitutes (${detail.subs.length})`,
                children: (
                  <div>
                    <Paragraph type="secondary">
                      Acceptable substitutes ranked by priority (lower = preferred). The requisition
                      engine consults this list when the primary item is unavailable.
                    </Paragraph>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detail.subs}
                      columns={[
                        { title: 'Priority', dataIndex: 'priority', width: 80 },
                        { title: 'HCPC', dataIndex: 'substituteHcpcCode', width: 100 },
                        { title: 'Description', dataIndex: 'substituteDescription' },
                        {
                          title: '',
                          width: 50,
                          render: (_: any, r) => (
                            <Popconfirm
                              title="Remove substitute?"
                              onConfirm={() => removeSubstitute(r.id)}
                            >
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          ),
                        },
                      ]}
                    />
                    <Divider />
                    <Form form={subForm} layout="inline">
                      <Form.Item name="substituteHcpcCode" rules={[{ required: true }]}>
                        <Input placeholder="HCPC" style={{ width: 100 }} />
                      </Form.Item>
                      <Form.Item name="substituteDescription">
                        <Input placeholder="Description" style={{ width: 220 }} />
                      </Form.Item>
                      <Form.Item name="priority" initialValue={10}>
                        <InputNumber min={1} max={99} style={{ width: 80 }} />
                      </Form.Item>
                      <Button type="primary" icon={<PlusOutlined />} onClick={addSubstitute}>
                        Add
                      </Button>
                    </Form>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </PageWrap>
  );
};

export default FormularyPage;
