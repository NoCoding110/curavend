/**
 * Requisitions list + create/detail drawers.
 *
 * Status flow:
 *   DRAFT → SUBMITTED → IN_REVIEW → APPROVED → CONVERTED
 *                                 → REJECTED
 *   Any non-terminal → CANCELLED
 *
 * Once APPROVED, click "Convert to orders" to spawn one order per
 * preferred-vendor split.
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
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Row,
  Col,
  Statistic,
  DatePicker,
  Timeline,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  SendOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SwapOutlined,
  WarningOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import {
  requisitionsApi,
  REQUISITION_STATUSES,
  REQUISITION_PRIORITIES,
  type Requisition,
  type RequisitionItem,
  type RequisitionHistoryEvent,
  type RequisitionStatus,
} from '../../../api/requisitions';
import { usePermissions } from '../../../hooks/usePermissions';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;

const statusColor: Record<RequisitionStatus, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  IN_REVIEW: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  CONVERTED: 'blue',
  CANCELLED: 'default',
};

const priorityColor: Record<string, string> = {
  LOW: 'default',
  NORMAL: 'blue',
  HIGH: 'orange',
  URGENT: 'red',
};

export const Requisitions: React.FC = () => {
  const navigate = useNavigate();
  const { canWrite, canDelete } = usePermissions();
  const [rows, setRows] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{ status: string; q: string }>({ status: '', q: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<(Requisition & { items: RequisitionItem[]; history: RequisitionHistoryEvent[] }) | null>(null);
  const [createForm] = Form.useForm();
  const [itemDraft, setItemDraft] = useState<any[]>([]);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; reason: string }>({ open: false, reason: '' });

  const fetchList = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filter.status) params.status = filter.status;
      if (filter.q) params.q = filter.q;
      const r = await requisitionsApi.list(params);
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.status]);

  // Dashboard counts
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  // ── Create ────────────────────────────────────────────────────────────
  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ priority: 'NORMAL' });
    setItemDraft([]);
    setCreateOpen(true);
  };
  const addDraftLine = () => {
    setItemDraft((arr) => [...arr, { hcpcCode: '', description: '', quantity: 1, estimatedUnitPriceUsd: 0 }]);
  };
  const updateDraftLine = (idx: number, k: string, v: any) => {
    setItemDraft((arr) => arr.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));
  };
  const removeDraftLine = (idx: number) => {
    setItemDraft((arr) => arr.filter((_, i) => i !== idx));
  };
  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      const items = itemDraft
        .filter((l) => l.hcpcCode && l.description && l.quantity)
        .map((l) => ({
          hcpcCode: String(l.hcpcCode).toUpperCase(),
          description: l.description,
          quantity: Number(l.quantity),
          estimatedUnitPriceUsd: l.estimatedUnitPriceUsd ? Number(l.estimatedUnitPriceUsd) : undefined,
          justification: l.justification,
        }));
      if (items.length === 0) {
        message.warning('Add at least one item');
        return;
      }
      const r = await requisitionsApi.create({
        ...v,
        neededByDate: v.neededByDate ? dayjs(v.neededByDate).format('YYYY-MM-DD') : undefined,
        items,
      });
      message.success(`Created ${r.requisitionNumber}`);
      setCreateOpen(false);
      void fetchList();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed to create');
    }
  };

  // ── Detail / actions ───────────────────────────────────────────────────
  const openDetail = async (id: string) => {
    try {
      const r = await requisitionsApi.get(id);
      setDetail(r);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    }
  };
  const refreshDetail = async () => {
    if (!detail) return;
    const r = await requisitionsApi.get(detail.id);
    setDetail(r);
    void fetchList();
  };

  const submitRequisition = async () => {
    if (!detail) return;
    try {
      const r = await requisitionsApi.submit(detail.id);
      message.success(r.matched ? 'Submitted — approver assigned via rules' : 'Submitted — no matching rule, awaiting fallback');
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const approveRequisition = async () => {
    if (!detail) return;
    try {
      await requisitionsApi.approve(detail.id);
      message.success('Approved');
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const rejectRequisition = () => setRejectModal({ open: true, reason: '' });
  const confirmReject = async () => {
    if (!detail) return;
    const reason = rejectModal.reason.trim();
    if (!reason) {
      message.warning('Reason is required');
      return;
    }
    try {
      await requisitionsApi.reject(detail.id, reason);
      message.success('Rejected');
      setRejectModal({ open: false, reason: '' });
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const convertRequisition = async () => {
    if (!detail) return;
    try {
      const r = await requisitionsApi.convert(detail.id);
      message.success(`Converted into ${r.orderIds.length} order(s)`);
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const convertToPo = async () => {
    if (!detail) return;
    try {
      const r = await requisitionsApi.convertToPo(detail.id);
      message.success(`Converted into ${r.purchaseOrderIds.length} PO(s)`);
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };
  const cancelRequisition = async () => {
    if (!detail) return;
    try {
      await requisitionsApi.cancel(detail.id);
      message.success('Cancelled');
      await refreshDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  // ── Columns ─────────────────────────────────────────────────────────────
  const columns: ColumnsType<Requisition> = [
    {
      title: 'Number',
      dataIndex: 'requisitionNumber',
      width: 150,
      render: (v: string, r) => <a onClick={() => openDetail(r.id)}><strong>{v}</strong></a>,
    },
    { title: 'Title', dataIndex: 'title', ellipsis: true },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (s: RequisitionStatus) => <Tag color={statusColor[s]}>{s}</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      width: 90,
      render: (p: string) => <Tag color={priorityColor[p]}>{p}</Tag>,
    },
    {
      title: 'Estimated',
      dataIndex: 'estimatedTotalUsd',
      width: 110,
      render: (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`),
    },
    {
      title: 'Needed by',
      dataIndex: 'neededByDate',
      width: 110,
      render: (v: string | null) => (v ? dayjs(v).format('MMM D, YYYY') : '—'),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 110,
      render: (v: string) => dayjs(v).format('MMM D, YYYY'),
    },
  ];

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Requisitions
          </Title>
          <Text type="secondary">
            Pre-order requests that route through approval before becoming purchase orders.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchList()}>Refresh</Button>
            {canWrite('requisitions') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                New requisition
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Draft" value={counts.DRAFT ?? 0} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Submitted" value={counts.SUBMITTED ?? 0} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="In Review" value={counts.IN_REVIEW ?? 0} valueStyle={{ color: '#d48806' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Approved" value={counts.APPROVED ?? 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Converted" value={counts.CONVERTED ?? 0} valueStyle={{ color: '#1BAEE5' }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="Rejected" value={counts.REJECTED ?? 0} valueStyle={{ color: '#cf1322' }} /></Card></Col>
      </Row>

      <Card
        size="small"
        extra={
          <Space>
            <Select
              style={{ width: 140 }}
              value={filter.status}
              onChange={(s) => setFilter((f) => ({ ...f, status: s }))}
              options={[
                { value: '', label: 'All statuses' },
                ...REQUISITION_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
            <Input.Search
              placeholder="Search title or REQ-#"
              allowClear
              style={{ width: 240 }}
              onSearch={(v) => {
                setFilter((f) => ({ ...f, q: v }));
                setTimeout(() => void fetchList(), 0);
              }}
            />
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 25, showSizeChanger: true }}
        />
      </Card>

      {/* ── Create modal ────────────────────────────────────────────── */}
      <Modal
        title="New requisition"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        okText="Create draft"
        width={820}
      >
        <Form form={createForm} layout="vertical">
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input placeholder="e.g. Q2 wound care restock" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="priority" label="Priority">
                <Select options={REQUISITION_PRIORITIES.map((p) => ({ value: p, label: p }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="neededByDate" label="Needed by">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="justification" label="Justification">
            <Input.TextArea rows={2} placeholder="Business case for this request" />
          </Form.Item>
          <Divider>Line items</Divider>
          <Space direction="vertical" style={{ width: '100%' }}>
            {itemDraft.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items yet" />
            ) : (
              itemDraft.map((l, idx) => (
                <Row key={idx} gutter={[8, 8]} align="middle">
                  <Col xs={24} sm={4}>
                    <Input
                      placeholder="HCPC"
                      value={l.hcpcCode}
                      onChange={(e) => updateDraftLine(idx, 'hcpcCode', e.target.value)}
                    />
                  </Col>
                  <Col xs={24} sm={9}>
                    <Input
                      placeholder="Description"
                      value={l.description}
                      onChange={(e) => updateDraftLine(idx, 'description', e.target.value)}
                    />
                  </Col>
                  <Col xs={8} sm={3}>
                    <InputNumber
                      placeholder="Qty"
                      min={1}
                      style={{ width: '100%' }}
                      value={l.quantity}
                      onChange={(v) => updateDraftLine(idx, 'quantity', v)}
                    />
                  </Col>
                  <Col xs={8} sm={4}>
                    <InputNumber
                      placeholder="Est $"
                      min={0}
                      step={0.01}
                      style={{ width: '100%' }}
                      value={l.estimatedUnitPriceUsd}
                      onChange={(v) => updateDraftLine(idx, 'estimatedUnitPriceUsd', v)}
                    />
                  </Col>
                  <Col xs={6} sm={3}>
                    <Input
                      placeholder="Justification"
                      value={l.justification}
                      onChange={(e) => updateDraftLine(idx, 'justification', e.target.value)}
                    />
                  </Col>
                  <Col xs={2} sm={1}>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeDraftLine(idx)} />
                  </Col>
                </Row>
              ))
            )}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addDraftLine} block>
              Add line
            </Button>
          </Space>
        </Form>
      </Modal>

      {/* ── Detail drawer ───────────────────────────────────────────── */}
      <Drawer
        title={detail ? `${detail.requisitionNumber} — ${detail.title}` : ''}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={780}
      >
        {detail && (
          <>
            <Space wrap style={{ marginBottom: 16 }}>
              <Tag color={statusColor[detail.status]}>{detail.status}</Tag>
              <Tag color={priorityColor[detail.priority]}>{detail.priority}</Tag>
              {detail.neededByDate && <Tag>Needed by {dayjs(detail.neededByDate).format('MMM D')}</Tag>}
              <Tag>Est ${(detail.estimatedTotalUsd ?? 0).toFixed(2)}</Tag>
            </Space>

            {detail.rejectedReason && (
              <Alert
                style={{ marginBottom: 12 }}
                type="error"
                message="Rejected"
                description={detail.rejectedReason}
              />
            )}
            {detail.status === 'CONVERTED' && detail.convertedOrderIds && detail.convertedOrderIds.length > 0 && (
              <Alert
                style={{ marginBottom: 12 }}
                type="success"
                message={`Converted into ${detail.convertedOrderIds.length} order(s)`}
                description={
                  <Space wrap>
                    {detail.convertedOrderIds.map((oid, idx) => (
                      <Tag
                        key={oid}
                        color="blue"
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/provider-orders/${oid}`)}
                      >
                        Order {idx + 1} →
                      </Tag>
                    ))}
                  </Space>
                }
              />
            )}

            <Space style={{ marginBottom: 16 }} wrap>
              {detail.status === 'DRAFT' && canWrite('requisitions') && (
                <Button type="primary" icon={<SendOutlined />} onClick={submitRequisition}>
                  Submit for approval
                </Button>
              )}
              {['SUBMITTED', 'IN_REVIEW'].includes(detail.status) && canWrite('requisitions') && (
                <>
                  <Button type="primary" icon={<CheckOutlined />} onClick={approveRequisition}>Approve</Button>
                  <Button danger icon={<CloseOutlined />} onClick={rejectRequisition}>Reject</Button>
                </>
              )}
              {detail.status === 'APPROVED' && canDelete('requisitions') && (
                <>
                  <Button type="primary" icon={<SwapOutlined />} onClick={convertRequisition}>
                    Convert to orders
                  </Button>
                  <Popconfirm
                    title="Convert to Purchase Orders?"
                    description="Spawns one PO per vendor (lines without a preferred vendor are skipped). The PO can then be transmitted via EDI/API/PunchOut/email/portal."
                    onConfirm={convertToPo}
                  >
                    <Button icon={<SwapOutlined />}>Convert to POs</Button>
                  </Popconfirm>
                </>
              )}
              {!['CONVERTED', 'REJECTED', 'CANCELLED'].includes(detail.status) && canWrite('requisitions') && (
                <Popconfirm title="Cancel this requisition?" onConfirm={cancelRequisition}>
                  <Button>Cancel requisition</Button>
                </Popconfirm>
              )}
            </Space>

            <Tabs
              items={[
                {
                  key: 'items',
                  label: `Items (${detail.items.length})`,
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={detail.items}
                      columns={[
                        { title: 'HCPC', dataIndex: 'hcpcCode', width: 90 },
                        { title: 'Description', dataIndex: 'description' },
                        { title: 'Qty', dataIndex: 'quantity', width: 60 },
                        {
                          title: 'Est $',
                          dataIndex: 'estimatedUnitPriceUsd',
                          width: 80,
                          render: (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`),
                        },
                        {
                          title: 'Flags',
                          width: 160,
                          render: (_: any, r: RequisitionItem) => (
                            <Space size={4} wrap>
                              {r.isOffFormulary ? (
                                <Tooltip title="Not on formulary">
                                  <Tag color="orange" icon={<WarningOutlined />}>Off-formulary</Tag>
                                </Tooltip>
                              ) : null}
                              {r.requiresPriorAuth ? <Tag color="purple">PA</Tag> : null}
                            </Space>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'justification',
                  label: 'Justification',
                  children: (
                    <Paragraph>
                      {detail.justification || <Text type="secondary">No justification provided.</Text>}
                    </Paragraph>
                  ),
                },
                {
                  key: 'history',
                  label: `History (${detail.history.length})`,
                  children: (
                    <Timeline
                      items={detail.history.map((h) => ({
                        children: (
                          <div>
                            <strong>{h.action}</strong>
                            {h.fromStatus && h.toStatus && (
                              <Tag style={{ marginLeft: 8 }}>{h.fromStatus} → {h.toStatus}</Tag>
                            )}
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {dayjs(h.createdAt).format('MMM D, YYYY h:mm A')}
                              </Text>
                            </div>
                            {h.comment && <Paragraph style={{ marginTop: 4 }}>{h.comment}</Paragraph>}
                          </div>
                        ),
                      }))}
                    />
                  ),
                },
              ]}
            />
          </>
        )}
      </Drawer>

      <Modal
        title="Reject requisition"
        open={rejectModal.open}
        onCancel={() => setRejectModal({ open: false, reason: '' })}
        onOk={confirmReject}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <p>Provide a reason. The requester will see this in their notifications.</p>
        <Input.TextArea
          rows={4}
          autoFocus
          value={rejectModal.reason}
          onChange={(e) => setRejectModal((s) => ({ ...s, reason: e.target.value }))}
          placeholder="e.g. Over budget — please revise quantities"
        />
      </Modal>
    </PageWrap>
  );
};

// styled-components helper (Divider is unused above — Ant's Divider works fine; here for completeness)
const Divider: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div style={{ borderTop: '1px solid #f0f0f0', margin: '12px 0', textAlign: 'center', position: 'relative' }}>
    {children && (
      <span
        style={{
          position: 'absolute',
          top: -10,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#fff',
          padding: '0 12px',
          color: '#666',
          fontSize: 12,
        }}
      >
        {children}
      </span>
    )}
  </div>
);

export default Requisitions;
