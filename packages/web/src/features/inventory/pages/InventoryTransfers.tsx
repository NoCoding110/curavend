/**
 * Cross-facility inventory transfers — list + create + state advance.
 */
import React, { useEffect, useState } from 'react';
import {
  Button, Card, Col, Drawer, Form, Input, InputNumber, Modal, Row, Select, Space,
  Table, Tag, Typography, message, Descriptions,
} from 'antd';
import { SwapOutlined, PlusOutlined, ReloadOutlined, ArrowRightOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const STATE_COLOR: Record<string, string> = {
  REQUESTED: 'default', APPROVED: 'blue', SHIPPED: 'cyan',
  RECEIVED: 'green', CANCELLED: 'red',
};
const NEXT: Record<string, { action: string; label: string }> = {
  REQUESTED: { action: 'approve', label: 'Approve' },
  APPROVED: { action: 'ship', label: 'Mark shipped' },
  SHIPPED: { action: 'receive', label: 'Mark received' },
};

interface Transfer {
  id: string;
  transferNumber: string;
  fromFacilityId: string;
  toFacilityId: string;
  state: string;
  priority: string;
  reason: string | null;
  trackingNumber: string | null;
  createdAt: string;
  lines?: any[];
}

const InventoryTransfersPage: React.FC = () => {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Transfer | null>(null);
  const [form] = Form.useForm();
  const [lines, setLines] = useState<any[]>([{ hcpcCode: '', description: '', quantity: 1 }]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Transfer[] }>('/transfers');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => {
    void load();
    (async () => {
      try { const r = await get<any>('/hospital-facilities?limit=200'); setFacilities(r.items ?? []); }
      catch { /* noop */ }
    })();
  }, []);

  const openDetail = async (id: string) => {
    const r = await get<Transfer>(`/transfers/${id}`);
    setDetail(r);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      const body = { ...v, lines: lines.filter((l) => l.hcpcCode || l.description) };
      if (body.lines.length === 0) { message.error('Add at least one line'); return; }
      await post('/transfers', body);
      message.success('Transfer requested');
      setCreateOpen(false);
      form.resetFields();
      setLines([{ hcpcCode: '', description: '', quantity: 1 }]);
      void load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const advance = async () => {
    if (!detail) return;
    const next = NEXT[detail.state];
    if (!next) return;
    try {
      const body: any = {};
      if (detail.state === 'APPROVED') {
        const tn = window.prompt('Tracking number?');
        if (tn) body.trackingNumber = tn;
      }
      await post(`/transfers/${detail.id}/${next.action}`, body);
      message.success(`→ ${next.action}`);
      await openDetail(detail.id);
      void load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const facilityName = (id: string) => facilities.find((f) => f.id === id)?.name ?? id.slice(0, 8);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><SwapOutlined /> Cross-Facility Transfers</Space>
          </Title>
          <Text type="secondary">Move stock between facilities. REQUESTED → APPROVED → SHIPPED → RECEIVED.</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>New transfer</Button>
          </Space>
        </Col>
      </Row>

      <Card size="small">
        <Table<Transfer>
          rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Transfer #', dataIndex: 'transferNumber', render: (v, r) => <a onClick={() => openDetail(r.id)}><strong>{v}</strong></a> },
            { title: 'State', dataIndex: 'state', render: (v) => <Tag color={STATE_COLOR[v]}>{v}</Tag>, width: 110 },
            { title: 'Priority', dataIndex: 'priority', width: 90, render: (v) => <Tag>{v}</Tag> },
            { title: 'From', dataIndex: 'fromFacilityId', width: 180, render: (id) => facilityName(id) },
            { title: 'To', dataIndex: 'toFacilityId', width: 180, render: (id) => facilityName(id) },
            { title: 'Reason', dataIndex: 'reason', ellipsis: true },
            { title: 'Created', dataIndex: 'createdAt', width: 130, render: (v) => new Date(v).toLocaleDateString() },
          ]}
        />
      </Card>

      <Modal title="New transfer" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submit} okText="Request" width={680}>
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="fromFacilityId" label="From facility" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={facilities.map((f) => ({ value: f.id, label: f.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="toFacilityId" label="To facility" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={facilities.map((f) => ({ value: f.id, label: f.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="priority" label="Priority" initialValue="NORMAL">
            <Select options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input placeholder="e.g. Satellite clinic stockout" />
          </Form.Item>
          <Title level={5}>Lines</Title>
          {lines.map((l, i) => (
            <Row gutter={4} key={i} style={{ marginBottom: 6 }}>
              <Col span={6}><Input placeholder="HCPC" value={l.hcpcCode} onChange={(e) => { lines[i].hcpcCode = e.target.value; setLines([...lines]); }} /></Col>
              <Col span={12}><Input placeholder="Description" value={l.description} onChange={(e) => { lines[i].description = e.target.value; setLines([...lines]); }} /></Col>
              <Col span={4}><InputNumber min={1} value={l.quantity} onChange={(v) => { lines[i].quantity = Number(v) || 1; setLines([...lines]); }} style={{ width: '100%' }} /></Col>
              <Col span={2}><Button danger size="small" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</Button></Col>
            </Row>
          ))}
          <Button size="small" onClick={() => setLines([...lines, { hcpcCode: '', description: '', quantity: 1 }])}>+ Add line</Button>
        </Form>
      </Modal>

      <Drawer title={detail?.transferNumber} width={560} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="State"><Tag color={STATE_COLOR[detail.state]}>{detail.state}</Tag></Descriptions.Item>
              <Descriptions.Item label="From">{facilityName(detail.fromFacilityId)}</Descriptions.Item>
              <Descriptions.Item label="To">{facilityName(detail.toFacilityId)}</Descriptions.Item>
              <Descriptions.Item label="Tracking">{detail.trackingNumber ?? '—'}</Descriptions.Item>
            </Descriptions>
            <Title level={5}>Lines</Title>
            <Table size="small" rowKey="id" pagination={false} dataSource={detail.lines ?? []}
              columns={[
                { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
                { title: 'Description', dataIndex: 'description', ellipsis: true },
                { title: 'Qty', dataIndex: 'quantity', width: 60, align: 'right' as const },
              ]}
              style={{ marginBottom: 12 }}
            />
            {NEXT[detail.state] && (
              <Button type="primary" icon={<ArrowRightOutlined />} block onClick={advance}>
                {NEXT[detail.state].label}
              </Button>
            )}
          </>
        )}
      </Drawer>
    </PageWrap>
  );
};

export default InventoryTransfersPage;
