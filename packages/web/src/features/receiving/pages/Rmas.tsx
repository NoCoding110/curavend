/**
 * /rmas — Return Material Authorization triage page.
 *
 * Auto-spawned from damaged/wrong-item goods receipts. Operator advances
 * each RMA through the state machine and records vendor RMA #s + credit.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Form, Input, InputNumber, Row, Space, Table,
  Tag, Typography, message, Descriptions,
} from 'antd';
import { ReloadOutlined, ArrowRightOutlined, RollbackOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const STATE_COLOR: Record<string, string> = {
  DRAFT: 'default', SUBMITTED: 'gold', APPROVED: 'blue', SHIPPED: 'cyan',
  RECEIVED: 'geekblue', CREDITED: 'green', REJECTED: 'red', CANCELLED: 'red',
};
const NEXT_ACTION: Record<string, { action: string; label: string }> = {
  DRAFT: { action: 'submit', label: 'Submit to vendor' },
  SUBMITTED: { action: 'approve', label: 'Vendor approved' },
  APPROVED: { action: 'ship', label: 'Mark shipped' },
  SHIPPED: { action: 'receive', label: 'Vendor received' },
  RECEIVED: { action: 'credit', label: 'Credit issued' },
};

interface Rma {
  id: string;
  rmaNumber: string;
  vendorId: string;
  state: string;
  reason: string;
  reasonDetail: string | null;
  vendorRmaNumber: string | null;
  expectedCreditUsd: number | null;
  actualCreditUsd: number | null;
  trackingNumber: string | null;
  sourceGrnId: string | null;
  createdAt: string;
  lines?: any[];
}

const RmasPage: React.FC = () => {
  const [rows, setRows] = useState<Rma[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Rma | null>(null);
  const [actionForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Rma[] }>('/rmas');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openDetail = async (id: string) => {
    const r = await get<Rma>(`/rmas/${id}`);
    setDetail(r);
    actionForm.resetFields();
  };

  const advance = async () => {
    if (!detail) return;
    const action = NEXT_ACTION[detail.state]?.action;
    if (!action) return;
    try {
      const v = await actionForm.validateFields().catch(() => ({}));
      await post(`/rmas/${detail.id}/${action}`, v);
      message.success(`Advanced via ${action}`);
      await openDetail(detail.id);
      void load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const cancel = async () => {
    if (!detail) return;
    await post(`/rmas/${detail.id}/cancel`, {});
    message.success('Cancelled');
    await openDetail(detail.id);
    void load();
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><RollbackOutlined /> Returns (RMAs)</Space>
          </Title>
          <Text type="secondary">Auto-spawned from goods receipts with DAMAGED or WRONG_ITEM lines. Advance through the state machine; record vendor RMA # and credit.</Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
        </Col>
      </Row>

      <Card size="small">
        <Table<Rma>
          size="small" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'RMA #', dataIndex: 'rmaNumber', render: (v, r) => <a onClick={() => openDetail(r.id)}><strong>{v}</strong></a> },
            { title: 'State', dataIndex: 'state', render: (v) => <Tag color={STATE_COLOR[v]}>{v}</Tag>, width: 110 },
            { title: 'Reason', dataIndex: 'reason', width: 130, render: (v) => <Tag>{v}</Tag> },
            { title: 'Vendor', dataIndex: 'vendorId', width: 200, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> },
            { title: 'Vendor RMA #', dataIndex: 'vendorRmaNumber', width: 140, render: (v) => v ?? '—' },
            {
              title: 'Expected credit', dataIndex: 'expectedCreditUsd', width: 130, align: 'right' as const,
              render: (v) => v != null ? `$${Number(v).toLocaleString()}` : '—',
            },
            {
              title: 'Actual credit', dataIndex: 'actualCreditUsd', width: 130, align: 'right' as const,
              render: (v) => v != null ? <strong>${Number(v).toLocaleString()}</strong> : '—',
            },
            { title: 'Created', dataIndex: 'createdAt', width: 160, render: (v) => new Date(v).toLocaleString() },
          ]}
        />
      </Card>

      <Drawer title={detail?.rmaNumber} width={620} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="State"><Tag color={STATE_COLOR[detail.state]}>{detail.state}</Tag></Descriptions.Item>
              <Descriptions.Item label="Reason"><Tag>{detail.reason}</Tag></Descriptions.Item>
              <Descriptions.Item label="Vendor RMA #">{detail.vendorRmaNumber ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Tracking">{detail.trackingNumber ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Expected credit">{detail.expectedCreditUsd != null ? `$${detail.expectedCreditUsd}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Actual credit">{detail.actualCreditUsd != null ? `$${detail.actualCreditUsd}` : '—'}</Descriptions.Item>
              {detail.reasonDetail && <Descriptions.Item label="Detail" span={2}>{detail.reasonDetail}</Descriptions.Item>}
            </Descriptions>

            <Title level={5}>Lines</Title>
            <Table
              size="small" rowKey="id" pagination={false}
              dataSource={detail.lines ?? []}
              columns={[
                { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Qty', dataIndex: 'quantity', width: 60, align: 'right' as const },
                { title: 'Condition', dataIndex: 'condition', width: 110, render: (v) => v ? <Tag color="red">{v}</Tag> : '—' },
              ]}
              style={{ marginBottom: 16 }}
            />

            {NEXT_ACTION[detail.state] && (
              <Card size="small" title={`Next: ${NEXT_ACTION[detail.state].label}`}>
                <Form form={actionForm} layout="vertical">
                  {detail.state === 'SUBMITTED' && (
                    <Form.Item name="vendorRmaNumber" label="Vendor RMA number" rules={[{ required: true }]}>
                      <Input placeholder="e.g. RMA-VENDOR-123" />
                    </Form.Item>
                  )}
                  {detail.state === 'APPROVED' && (
                    <Form.Item name="trackingNumber" label="Return tracking number">
                      <Input />
                    </Form.Item>
                  )}
                  {detail.state === 'RECEIVED' && (
                    <Form.Item name="actualCreditUsd" label="Actual credit (USD)" rules={[{ required: true }]}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                  <Space>
                    <Button type="primary" icon={<ArrowRightOutlined />} onClick={advance}>
                      {NEXT_ACTION[detail.state].label}
                    </Button>
                    {!['CREDITED', 'REJECTED', 'CANCELLED'].includes(detail.state) && (
                      <Button danger onClick={cancel}>Cancel RMA</Button>
                    )}
                  </Space>
                </Form>
              </Card>
            )}
            {!NEXT_ACTION[detail.state] && (
              <Alert type="success" message={`Terminal state: ${detail.state}`} showIcon />
            )}
          </>
        )}
      </Drawer>
    </PageWrap>
  );
};

export default RmasPage;
