/**
 * Prior Authorizations page — list + create + transition + history.
 *
 * Closes the largest competitive gap vs. Parachute Health. The state
 * machine is enforced on the backend (NEEDED → SUBMITTED → PENDING →
 * APPROVED|DENIED|EXPIRED|CANCELLED), so the UI just renders the
 * currently-allowed actions per status.
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  WarningOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  priorAuthsApi,
  PRIOR_AUTH_STATUSES,
  type PriorAuth,
  type PriorAuthHistory,
  type PriorAuthStatus,
} from '../../../api/priorAuths';
import { payorsApi, type Payor } from '../../../api/payors';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;

const STATUS_COLOR: Record<PriorAuthStatus, string> = {
  NEEDED: 'default',
  SUBMITTED: 'processing',
  PENDING: 'gold',
  APPROVED: 'green',
  DENIED: 'red',
  EXPIRED: 'orange',
  CANCELLED: 'default',
};

const STATUS_ICON: Partial<Record<PriorAuthStatus, React.ReactNode>> = {
  SUBMITTED: <SafetyCertificateOutlined />,
  PENDING: <ClockCircleOutlined />,
  APPROVED: <CheckCircleOutlined />,
  DENIED: <StopOutlined />,
  EXPIRED: <WarningOutlined />,
};

const TRANSITIONS: Record<PriorAuthStatus, PriorAuthStatus[]> = {
  NEEDED: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED'],
  PENDING: ['APPROVED', 'DENIED', 'CANCELLED'],
  APPROVED: ['EXPIRED', 'CANCELLED'],
  DENIED: ['SUBMITTED'],
  EXPIRED: ['SUBMITTED'],
  CANCELLED: [],
};

export const PriorAuths: React.FC = () => {
  const [list, setList] = useState<PriorAuth[]>([]);
  const [payors, setPayors] = useState<Payor[]>([]);
  const [summary, setSummary] = useState<{ counts: Record<string, number>; expiringSoon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PriorAuthStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const [paResp, paySumm] = await Promise.all([
        priorAuthsApi.list(statusFilter === 'ALL' ? undefined : { status: statusFilter }),
        priorAuthsApi.dashboardSummary(),
      ]);
      setList(paResp.items);
      setSummary(paySumm);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load PAs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    payorsApi.list().then((r) => setPayors(r.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const columns: ColumnsType<PriorAuth> = [
    {
      title: 'Patient',
      dataIndex: 'patientName',
      key: 'patientName',
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Member: {r.payorMemberId}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Payor',
      dataIndex: ['payor', 'name'],
      key: 'payor',
      render: (_: any, r) => (r.payor ? <Tag>{r.payor.name}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'HCPC',
      dataIndex: 'hcpcCode',
      key: 'hcpcCode',
      width: 100,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 180,
      render: (s: PriorAuthStatus, r: any) => (
        <>
          <Tag color={STATUS_COLOR[s]} icon={STATUS_ICON[s]}>
            {s}
          </Tag>
          {r.submissionSimulated ? <Tag color="orange" style={{ marginLeft: 4 }}>SIM</Tag> : null}
        </>
      ),
    },
    {
      title: 'Auth #',
      dataIndex: 'authNumber',
      key: 'authNumber',
      width: 130,
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Coverage Ends',
      dataIndex: 'effectiveEndDate',
      key: 'effectiveEndDate',
      width: 130,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">—</Text>;
        const days = dayjs(v).diff(dayjs(), 'day');
        const color = days < 0 ? 'red' : days < 30 ? 'orange' : 'default';
        return <Tag color={color}>{v}</Tag>;
      },
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 140,
      render: (v: string) => <Text type="secondary">{dayjs(v).format('YYYY-MM-DD HH:mm')}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, r) => (
        <Button size="small" onClick={() => setDetailId(r.id)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <PageWrap>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Prior Authorizations
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Track payor authorizations from need → submission → decision. Required for chain DME and
            most commercial coverage.
          </Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New Prior Auth
        </Button>
      </Space>

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} md={4}>
            <Card>
              <Statistic title="Needed" value={summary.counts.NEEDED ?? 0} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card>
              <Statistic title="Submitted" value={summary.counts.SUBMITTED ?? 0} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card>
              <Statistic title="Pending" value={summary.counts.PENDING ?? 0} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card>
              <Statistic title="Approved" value={summary.counts.APPROVED ?? 0} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card>
              <Statistic title="Denied" value={summary.counts.DENIED ?? 0} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col xs={12} md={4}>
            <Card>
              <Statistic title="Expiring in 30d" value={summary.expiringSoon} valueStyle={{ color: '#fa8c16' }} />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        <Space style={{ marginBottom: 12 }}>
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            style={{ width: 200 }}
            options={[
              { value: 'ALL', label: 'All statuses' },
              ...PRIOR_AUTH_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
          />
        </Space>
        <Table<PriorAuth>
          rowKey="id"
          dataSource={list}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: 'No prior auths yet — click "New Prior Auth" to begin.' }}
        />
      </Card>

      <CreateDrawer
        open={createOpen}
        payors={payors}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void fetchList();
        }}
      />

      <DetailDrawer
        id={detailId}
        payors={payors}
        onClose={() => setDetailId(null)}
        onChanged={() => void fetchList()}
      />
    </PageWrap>
  );
};

// ─── Create Drawer ─────────────────────────────────────────────────────────

const CreateDrawer: React.FC<{
  open: boolean;
  payors: Payor[];
  onClose: () => void;
  onCreated: () => void;
}> = ({ open, payors, onClose, onCreated }) => {
  const [form] = Form.useForm();
  const handleOk = async () => {
    let v: any;
    try { v = await form.validateFields(); } catch { return; }
    try {
      await priorAuthsApi.create({
        payorId: v.payorId,
        payorMemberId: v.payorMemberId,
        payorGroupId: v.payorGroupId,
        patientName: v.patientName,
        patientDob: v.patientDob ? dayjs(v.patientDob).format('YYYY-MM-DD') : undefined,
        hcpcCode: v.hcpcCode,
        clinicalNote: v.clinicalNote,
        effectiveStartDate: v.effectiveStartDate ? dayjs(v.effectiveStartDate).format('YYYY-MM-DD') : undefined,
        effectiveEndDate: v.effectiveEndDate ? dayjs(v.effectiveEndDate).format('YYYY-MM-DD') : undefined,
      });
      message.success('Prior auth created (status = NEEDED)');
      form.resetFields();
      onCreated();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create');
    }
  };
  return (
    <Drawer
      open={open}
      width={520}
      title="New Prior Authorization"
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" onClick={handleOk}>
            Create
          </Button>
        </Space>
      }
    >
      <Form layout="vertical" form={form}>
        <Form.Item name="patientName" label="Patient Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="patientDob" label="Patient DOB">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="payorId" label="Payor" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={payors.map((p) => ({ value: p.id, label: `${p.name} (${p.kind})` }))} />
        </Form.Item>
        <Form.Item name="payorMemberId" label="Member ID" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="payorGroupId" label="Group ID (optional)">
          <Input />
        </Form.Item>
        <Form.Item name="hcpcCode" label="HCPC Code" rules={[{ required: true }]}>
          <Input placeholder="e.g. L1832" />
        </Form.Item>
        <Form.Item name="clinicalNote" label="Clinical justification">
          <Input.TextArea rows={3} placeholder="Medical necessity rationale, ICD-10 codes, etc." />
        </Form.Item>
        <Form.Item name="effectiveStartDate" label="Coverage Start (if known)">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="effectiveEndDate" label="Coverage End (if known)">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Drawer>
  );
};

// ─── Detail Drawer ─────────────────────────────────────────────────────────

const DetailDrawer: React.FC<{
  id: string | null;
  payors: Payor[];
  onClose: () => void;
  onChanged: () => void;
}> = ({ id, payors, onClose, onChanged }) => {
  const [detail, setDetail] = useState<(PriorAuth & { history: PriorAuthHistory[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState<PriorAuthStatus | null>(null);
  const [transitionForm] = Form.useForm();

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    setLoading(true);
    priorAuthsApi
      .get(id)
      .then(setDetail)
      .catch((err) => message.error(err?.response?.data?.error || 'Failed to load PA'))
      .finally(() => setLoading(false));
  }, [id]);

  const reload = async () => {
    if (!id) return;
    const d = await priorAuthsApi.get(id);
    setDetail(d);
  };

  if (!id) return null;

  const allowed = detail ? TRANSITIONS[detail.status] : [];
  const handleTransition = async () => {
    if (!detail || !transitionOpen) return;
    let v: any = {};
    try { v = await transitionForm.validateFields(); } catch { return; }
    try {
      await priorAuthsApi.transition(detail.id, {
        toStatus: transitionOpen,
        reason: v.reason,
        authNumber: v.authNumber,
        quantityApproved: v.quantityApproved,
        effectiveStartDate: v.effectiveStartDate ? dayjs(v.effectiveStartDate).format('YYYY-MM-DD') : undefined,
        effectiveEndDate: v.effectiveEndDate ? dayjs(v.effectiveEndDate).format('YYYY-MM-DD') : undefined,
      });
      message.success(`Transitioned to ${transitionOpen}`);
      setTransitionOpen(null);
      transitionForm.resetFields();
      await reload();
      onChanged();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Transition failed');
    }
  };

  return (
    <Drawer
      open={!!id}
      width={680}
      title={detail ? `PA — ${detail.patientName}` : 'Prior Authorization'}
      onClose={onClose}
      destroyOnClose
    >
      {loading || !detail ? (
        <Text type="secondary">Loading…</Text>
      ) : (
        <>
          <Space wrap style={{ marginBottom: 16 }}>
            <Tag color={STATUS_COLOR[detail.status]} icon={STATUS_ICON[detail.status]} style={{ fontSize: 14, padding: '4px 12px' }}>
              {detail.status}
            </Tag>
            {allowed.map((next) => (
              <Button key={next} onClick={() => setTransitionOpen(next)}>
                Move to {next}
              </Button>
            ))}
          </Space>

          <Tabs
            defaultActiveKey="info"
            items={[
              {
                key: 'info',
                label: 'Details',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Card size="small" title="Patient">
                      <Text strong>{detail.patientName}</Text>
                      {detail.patientDob && <Text type="secondary"> · DOB {detail.patientDob}</Text>}
                    </Card>
                    <Card size="small" title="Payor + Coverage">
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text>
                          {detail.payor ? (
                            <>
                              <Tag>{detail.payor.name}</Tag>
                              <Text type="secondary">{detail.payor.kind}</Text>
                            </>
                          ) : (
                            payors.find((p) => p.id === detail.payorId)?.name ?? detail.payorId
                          )}
                        </Text>
                        <Text>Member ID: <Text strong>{detail.payorMemberId}</Text></Text>
                        {detail.payorGroupId && <Text>Group: {detail.payorGroupId}</Text>}
                        {detail.authNumber && <Text>Auth #: <Text strong>{detail.authNumber}</Text></Text>}
                        {detail.effectiveStartDate && (
                          <Text>
                            Coverage: {detail.effectiveStartDate}
                            {detail.effectiveEndDate ? ` → ${detail.effectiveEndDate}` : ' →'}
                          </Text>
                        )}
                        {detail.quantityApproved != null && <Text>Qty Approved: <Text strong>{detail.quantityApproved}</Text></Text>}
                      </Space>
                    </Card>
                    <Card size="small" title="Clinical">
                      <Tag color="blue">{detail.hcpcCode}</Tag>
                      {detail.clinicalNote && (
                        <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>{detail.clinicalNote}</Paragraph>
                      )}
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'history',
                label: (
                  <>
                    <HistoryOutlined /> History ({detail.history.length})
                  </>
                ),
                children: (
                  <Timeline
                    items={detail.history.map((h) => ({
                      color: STATUS_COLOR[h.toStatus as PriorAuthStatus] ?? 'gray',
                      children: (
                        <>
                          <Space>
                            {h.fromStatus && <Tag>{h.fromStatus}</Tag>}
                            <span>→</span>
                            <Tag color={STATUS_COLOR[h.toStatus as PriorAuthStatus]}>{h.toStatus}</Tag>
                          </Space>
                          {h.reason && (
                            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                              {h.reason}
                            </Paragraph>
                          )}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(h.createdAt).format('YYYY-MM-DD HH:mm')}
                          </Text>
                        </>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />

          {/* Transition modal as Drawer-inner Form. Use Drawer here so we don't nest modals. */}
          <Drawer
            open={!!transitionOpen}
            title={`Move to ${transitionOpen}`}
            onClose={() => { setTransitionOpen(null); transitionForm.resetFields(); }}
            width={420}
            extra={
              <Space>
                <Button onClick={() => { setTransitionOpen(null); transitionForm.resetFields(); }}>Cancel</Button>
                <Button type="primary" onClick={handleTransition}>Confirm</Button>
              </Space>
            }
          >
            <Form layout="vertical" form={transitionForm}>
              <Form.Item name="reason" label="Reason / Note">
                <Input.TextArea rows={3} placeholder="Why are we transitioning this status?" />
              </Form.Item>
              {(transitionOpen === 'APPROVED' || transitionOpen === 'SUBMITTED') && (
                <>
                  <Form.Item name="authNumber" label="Auth Number (if known)">
                    <Input />
                  </Form.Item>
                  <Form.Item name="quantityApproved" label="Qty Approved">
                    <InputNumber min={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="effectiveStartDate" label="Coverage Start">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="effectiveEndDate" label="Coverage End">
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </>
              )}
            </Form>
          </Drawer>
        </>
      )}
    </Drawer>
  );
};

export default PriorAuths;
