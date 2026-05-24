/**
 * Admin: Supplier onboarding kanban.
 *
 * Columns = states (INVITED → ACTIVE), each card = one (vendor, hospital) row.
 * Click a card to see history + doc checklist + advance/suspend buttons.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Checkbox, Col, Drawer, Form, Input, message, Modal,
  Row, Select, Space, Tag, Timeline, Typography,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, ArrowRightOutlined, StopOutlined, ReloadOutlined as Reactivate,
  UserAddOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const STATES = [
  'INVITED', 'DOCS_PENDING', 'DOCS_RECEIVED', 'CREDENTIALED', 'APPROVED', 'ACTIVE', 'SUSPENDED',
];
const STATE_COLOR: Record<string, string> = {
  INVITED: 'default', DOCS_PENDING: 'gold', DOCS_RECEIVED: 'cyan',
  CREDENTIALED: 'blue', APPROVED: 'geekblue', ACTIVE: 'green', SUSPENDED: 'red',
};
const DOC_TYPES = ['W9', 'COI', 'OIG_ATTESTATION', 'DMEPOS', 'MSA', 'BAA', 'ACCREDITATION'];

interface Onboarding {
  id: string;
  vendorId: string;
  hospitalId: string | null;
  state: string;
  invitedAt: string;
  docsRequired: string | null;
  docsReceived: string | null;
  notes: string | null;
  history?: any[];
}

const SupplierOnboardingPage: React.FC = () => {
  const [rows, setRows] = useState<Onboarding[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Onboarding | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Onboarding[] }>('/vendor-onboarding');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    (async () => {
      try {
        const r = await get<any>('/vendors?limit=500');
        setVendors(r.items ?? r ?? []);
      } catch { /* noop */ }
    })();
  }, []);

  const openDetail = async (id: string) => {
    try {
      const r = await get<Onboarding>(`/vendor-onboarding/${id}`);
      setDetail(r);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    }
  };

  const invite = async () => {
    try {
      const v = await inviteForm.validateFields();
      await post('/vendor-onboarding/invite', v);
      message.success('Invited');
      inviteForm.resetFields();
      setInviteOpen(false);
      void load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const advance = async (id: string) => {
    try {
      await post(`/vendor-onboarding/${id}/advance`, {});
      message.success('Advanced');
      await openDetail(id);
      void load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const suspend = (id: string) => {
    Modal.confirm({
      title: 'Suspend this onboarding?',
      content: (
        <Input.TextArea id={`suspend-reason-${id}`} placeholder="Reason (required)" rows={3} />
      ),
      onOk: async () => {
        const reason = (document.getElementById(`suspend-reason-${id}`) as HTMLTextAreaElement)?.value?.trim();
        if (!reason) { message.error('Reason required'); return Promise.reject(); }
        await post(`/vendor-onboarding/${id}/suspend`, { reason });
        message.success('Suspended');
        await openDetail(id);
        void load();
      },
    });
  };

  const reactivate = async (id: string) => {
    await post(`/vendor-onboarding/${id}/reactivate`, {});
    message.success('Reactivated');
    await openDetail(id);
    void load();
  };

  const toggleDoc = async (id: string, doc: string, received: boolean) => {
    try {
      await post(`/vendor-onboarding/${id}/mark-doc`, { doc, received });
      await openDetail(id);
      void load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const vendorName = (vid: string) => vendors.find((v) => v.id === vid)?.name ?? vid.slice(0, 8);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><UserAddOutlined /> Supplier Onboarding</Space>
          </Title>
          <Text type="secondary">7-state machine: INVITED → DOCS_PENDING → DOCS_RECEIVED → CREDENTIALED → APPROVED → ACTIVE. Click a card to manage.</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
              Invite supplier
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={8} style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        {STATES.map((state) => {
          const inCol = rows.filter((r) => r.state === state);
          return (
            <Col key={state} flex="0 0 240px">
              <Card
                size="small"
                title={<Space><Tag color={STATE_COLOR[state]}>{state}</Tag><Text type="secondary">{inCol.length}</Text></Space>}
                bodyStyle={{ padding: 8, minHeight: 400, background: '#fafafa' }}
              >
                {inCol.map((r) => (
                  <Card
                    key={r.id}
                    size="small"
                    hoverable
                    style={{ marginBottom: 8, cursor: 'pointer' }}
                    onClick={() => openDetail(r.id)}
                  >
                    <div><strong>{vendorName(r.vendorId)}</strong></div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      since {new Date(r.invitedAt).toLocaleDateString()}
                    </Text>
                  </Card>
                ))}
              </Card>
            </Col>
          );
        })}
      </Row>

      <Drawer
        title={detail ? `${vendorName(detail.vendorId)} — ${detail.state}` : ''}
        width={560}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (() => {
          const required: string[] = detail.docsRequired ? JSON.parse(detail.docsRequired) : [];
          const received: string[] = detail.docsReceived ? JSON.parse(detail.docsReceived) : [];
          return (
            <>
              <Space style={{ marginBottom: 12 }}>
                {!['ACTIVE', 'SUSPENDED'].includes(detail.state) && (
                  <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => advance(detail.id)}>
                    Advance state
                  </Button>
                )}
                {detail.state !== 'SUSPENDED' && (
                  <Button danger icon={<StopOutlined />} onClick={() => suspend(detail.id)}>
                    Suspend
                  </Button>
                )}
                {detail.state === 'SUSPENDED' && (
                  <Button type="primary" icon={<Reactivate />} onClick={() => reactivate(detail.id)}>
                    Reactivate
                  </Button>
                )}
              </Space>

              <Title level={5}>Required documents</Title>
              <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
                {required.map((doc) => (
                  <Checkbox
                    key={doc}
                    checked={received.includes(doc)}
                    onChange={(e) => toggleDoc(detail.id, doc, e.target.checked)}
                  >
                    <Text code>{doc}</Text>
                  </Checkbox>
                ))}
              </Space>

              <Title level={5}>History</Title>
              <Timeline
                items={(detail.history ?? []).map((h: any) => ({
                  color: STATE_COLOR[h.toState] === 'red' ? 'red'
                    : STATE_COLOR[h.toState] === 'green' ? 'green' : 'blue',
                  children: (
                    <>
                      <div><strong>{h.fromState ?? '∅'}</strong> → <strong>{h.toState}</strong></div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(h.createdAt).toLocaleString()}
                      </Text>
                      {h.note && <div style={{ fontSize: 12, marginTop: 4 }}>{h.note}</div>}
                    </>
                  ),
                }))}
              />
            </>
          );
        })()}
      </Drawer>

      <Modal
        title="Invite a supplier"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={invite}
        okText="Send invite"
      >
        <Form form={inviteForm} layout="vertical">
          <Form.Item name="vendorId" label="Vendor" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Pick a vendor"
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
            />
          </Form.Item>
          <Form.Item name="docsRequired" label="Required documents" initialValue={['W9', 'COI', 'OIG_ATTESTATION', 'MSA']}>
            <Select mode="multiple" options={DOC_TYPES.map((d) => ({ value: d, label: d }))} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Alert
        type="info"
        showIcon
        style={{ marginTop: 16 }}
        message="Auto-advance"
        description="Marking the first required doc auto-advances INVITED → DOCS_PENDING. Marking all required docs auto-advances DOCS_PENDING → DOCS_RECEIVED. Other transitions require the operator to click Advance."
      />
    </PageWrap>
  );
};

export default SupplierOnboardingPage;
