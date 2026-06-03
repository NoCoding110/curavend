/**
 * Payor management page — list, create, update payors; manage per-payor
 * contract rates; run a one-off eligibility check (stub).
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  DatePicker,
  Switch,
  Alert,
  Descriptions,
} from 'antd';
import { PlusOutlined, SafetyCertificateOutlined, EditOutlined, DollarOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  payorsApi,
  PAYOR_KINDS,
  type Payor,
  type PayorContractItem,
  type EligibilityResponse,
} from '../../../api/payors';

const { Title, Paragraph, Text } = Typography;

const PageWrap = styled.div`padding: 24px;`;

const KindTag: React.FC<{ kind: string }> = ({ kind }) => {
  const color =
    kind === 'MEDICARE' ? 'red' :
    kind === 'MEDICAID' ? 'orange' :
    kind === 'COMMERCIAL' ? 'blue' :
    kind === 'WORKERS_COMP' ? 'purple' :
    kind === 'SELF_PAY' ? 'default' : 'cyan';
  return <Tag color={color}>{kind.replace('_', ' ')}</Tag>;
};

export const Payors: React.FC = () => {
  const [list, setList] = useState<Payor[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<PayorContractItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [lastEligibility, setLastEligibility] = useState<EligibilityResponse | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const r = await payorsApi.list();
      setList(r.items);
      if (!selectedId && r.items.length > 0) setSelectedId(r.items[0].id);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load payors');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetchList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const fetchItems = async () => {
    if (!selectedId) return;
    try {
      const r = await payorsApi.listItems(selectedId);
      setItems(r.items);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load rates');
    }
  };
  useEffect(() => { void fetchItems(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedId]);

  const selected = list.find((p) => p.id === selectedId);

  // ── Create ──────────────────────────────────────────────────
  const [createForm] = Form.useForm();
  const handleCreate = async () => {
    let v: any;
    try { v = await createForm.validateFields(); } catch { return; }
    try {
      const resp = await payorsApi.create(v);
      message.success(`Payor "${v.name}" created`);
      setCreateOpen(false);
      createForm.resetFields();
      await fetchList();
      setSelectedId(resp.id);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create payor');
    }
  };

  // ── Add rate ────────────────────────────────────────────────
  const [rateForm] = Form.useForm();
  const handleAddRate = async () => {
    let v: any;
    try { v = await rateForm.validateFields(); } catch { return; }
    if (!selectedId) return;
    try {
      await payorsApi.upsertItems(selectedId, [
        {
          hcpcCode: v.hcpcCode,
          allowableUsd: v.allowableUsd,
          effectiveStartDate: dayjs(v.effectiveStartDate).format('YYYY-MM-DD'),
          effectiveEndDate: v.effectiveEndDate ? dayjs(v.effectiveEndDate).format('YYYY-MM-DD') : undefined,
          description: v.description,
          patientResponsibilityUsd: v.patientResponsibilityUsd,
          requiresPriorAuth: v.requiresPriorAuth,
        },
      ]);
      message.success('Rate added');
      setAddItemOpen(false);
      rateForm.resetFields();
      void fetchItems();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to add rate');
    }
  };

  // ── Eligibility stub ────────────────────────────────────────
  const [eligForm] = Form.useForm();
  const handleEligibility = async () => {
    let v: any;
    try { v = await eligForm.validateFields(); } catch { return; }
    if (!selectedId) return;
    try {
      const resp = await payorsApi.checkEligibility(selectedId, v);
      setLastEligibility(resp);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Eligibility check failed');
    }
  };

  const itemColumns: ColumnsType<PayorContractItem> = [
    { title: 'HCPC', dataIndex: 'hcpcCode', width: 100, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Description', dataIndex: 'description', render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: 'Allowable', dataIndex: 'allowableUsd', width: 110, align: 'right', render: (v: number) => <Text strong>${v.toFixed(2)}</Text> },
    { title: 'Patient Resp.', dataIndex: 'patientResponsibilityUsd', width: 120, align: 'right', render: (v: number | null) => v != null ? `$${v.toFixed(2)}` : <Text type="secondary">—</Text> },
    { title: 'Prior Auth', dataIndex: 'requiresPriorAuth', width: 110, render: (v: number) => v ? <Tag color="red">Required</Tag> : <Tag>No</Tag> },
    { title: 'Effective', key: 'effective', width: 200, render: (_: unknown, r: PayorContractItem) => (
      <Text type="secondary">{r.effectiveStartDate}{r.effectiveEndDate ? ` → ${r.effectiveEndDate}` : ' →'}</Text>
    ) },
    { title: 'Status', dataIndex: 'isActive', width: 90, render: (v: number) => v === 1 ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
  ];

  return (
    <PageWrap>
      <Title level={3}>Payors</Title>
      <Paragraph type="secondary">
        Manage insurance payors and their per-HCPC allowable rates. Used in the pricing cascade
        when an order has an attached payor, and to flag rates that require prior authorization.
        Eligibility checks return a stub response — wire your X12 270/271 clearinghouse later.
      </Paragraph>

      <Row gutter={16}>
        <Col xs={24} md={7}>
          <Card
            title="Payors"
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Add</Button>}
            loading={loading}
          >
            {list.length === 0 ? <Empty description="No payors yet" /> : list.map((p) => (
              <Card
                key={p.id}
                size="small"
                style={{ marginBottom: 10, cursor: 'pointer', borderColor: selectedId === p.id ? '#1BAEE5' : undefined }}
                onClick={() => setSelectedId(p.id)}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong>{p.name}</Text>
                  <KindTag kind={p.kind} />
                </Space>
                {p.payorCode && <Text type="secondary" style={{ fontSize: 12 }}>{p.payorCode}</Text>}
              </Card>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={17}>
          {selected ? (
            <Card
              title={<Space><span>{selected.name}</span><KindTag kind={selected.kind} /></Space>}
              extra={
                <Space>
                  <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => setEligibilityOpen(true)}>
                    Check Eligibility
                  </Button>
                  <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => setAddItemOpen(true)}>
                    Add Rate
                  </Button>
                </Space>
              }
            >
              <Tabs
                defaultActiveKey="rates"
                items={[
                  {
                    key: 'rates',
                    label: `Allowable Rates (${items.length})`,
                    children: (
                      <Table<PayorContractItem>
                        rowKey="id"
                        size="small"
                        dataSource={items}
                        columns={itemColumns}
                        pagination={{ pageSize: 20 }}
                        locale={{ emptyText: 'No rates yet — click "Add Rate".' }}
                      />
                    ),
                  },
                  {
                    key: 'meta',
                    label: 'Details',
                    children: (
                      <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label="Name">{selected.name}</Descriptions.Item>
                        <Descriptions.Item label="Kind"><KindTag kind={selected.kind} /></Descriptions.Item>
                        <Descriptions.Item label="Payor code">{selected.payorCode || '—'}</Descriptions.Item>
                        <Descriptions.Item label="Phone">{selected.phone || '—'}</Descriptions.Item>
                        <Descriptions.Item label="Website">{selected.website || '—'}</Descriptions.Item>
                        <Descriptions.Item label="Notes">{selected.notes || '—'}</Descriptions.Item>
                      </Descriptions>
                    ),
                  },
                ]}
              />
            </Card>
          ) : (
            <Card><Empty description="Select a payor on the left" /></Card>
          )}
        </Col>
      </Row>

      {/* Create payor modal */}
      <Modal open={createOpen} title="Add Payor" onCancel={() => { setCreateOpen(false); createForm.resetFields(); }} onOk={handleCreate} okText="Create">
        <Form layout="vertical" form={createForm} initialValues={{ kind: 'COMMERCIAL' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. BlueCross BlueShield of Massachusetts" />
          </Form.Item>
          <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
            <Select>{PAYOR_KINDS.map((k) => <Select.Option key={k} value={k}>{k.replace('_', ' ')}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="payorCode" label="Payor code (optional)"><Input placeholder="CMS ID / NAIC / internal" /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="website" label="Website"><Input placeholder="https://" /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Add rate modal */}
      <Modal open={addItemOpen} title="Add Allowable Rate" onCancel={() => { setAddItemOpen(false); rateForm.resetFields(); }} onOk={handleAddRate} okText="Add">
        <Form layout="vertical" form={rateForm} initialValues={{ effectiveStartDate: dayjs() }}>
          <Form.Item name="hcpcCode" label="HCPC Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. L1832" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)"><Input /></Form.Item>
          <Form.Item name="allowableUsd" label="Allowable (USD)" rules={[{ required: true }]}>
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="patientResponsibilityUsd" label="Patient Responsibility (USD, optional)">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="requiresPriorAuth" label="Requires Prior Auth" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="effectiveStartDate" label="Effective Start" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="effectiveEndDate" label="Effective End (optional)">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Eligibility check modal */}
      <Modal
        open={eligibilityOpen}
        title={`Eligibility Check — ${selected?.name ?? ''}`}
        onCancel={() => { setEligibilityOpen(false); eligForm.resetFields(); setLastEligibility(null); }}
        footer={[
          <Button key="close" onClick={() => { setEligibilityOpen(false); eligForm.resetFields(); setLastEligibility(null); }}>Close</Button>,
          <Button key="check" type="primary" onClick={handleEligibility}>Run Check</Button>,
        ]}
        width={640}
      >
        <Alert
          showIcon
          type="info"
          message="Eligibility responses are currently STUBBED."
          description="Connect a real X12 270/271 clearinghouse later — the response shape is identical so the UI doesn't need to change."
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical" form={eligForm}>
          <Form.Item name="patientMemberId" label="Patient Member ID" rules={[{ required: true }]}>
            <Input placeholder="e.g. ABC1234567" />
          </Form.Item>
          <Form.Item name="patientName" label="Patient Name (optional)"><Input /></Form.Item>
          <Form.Item name="patientDob" label="Patient DOB (optional)"><Input placeholder="YYYY-MM-DD" /></Form.Item>
          <Form.Item name="hcpcCode" label="HCPC Code being requested (optional)"><Input /></Form.Item>
        </Form>
        {lastEligibility && (
          <Card size="small" style={{ marginTop: 16 }} title="Response">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Status">
                <Tag color={lastEligibility.status === 'ACTIVE' ? 'green' : lastEligibility.status === 'INACTIVE' ? 'red' : 'default'}>
                  {lastEligibility.status}
                </Tag>
                {(lastEligibility as any).simulated && <Tag color="orange" style={{ marginLeft: 4 }}>SIMULATED</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Benefit notes">{lastEligibility.benefitNotes}</Descriptions.Item>
              {lastEligibility.copayUsd != null && <Descriptions.Item label="Copay">${lastEligibility.copayUsd.toFixed(2)}</Descriptions.Item>}
              {lastEligibility.deductibleUsd != null && (
                <Descriptions.Item label="Deductible">
                  ${lastEligibility.deductibleMetUsd?.toFixed(2)} of ${lastEligibility.deductibleUsd.toFixed(2)} met
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        )}
      </Modal>
    </PageWrap>
  );
};

export default Payors;
