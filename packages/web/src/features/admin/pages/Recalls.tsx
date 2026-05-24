/**
 * Admin: Recall management.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Drawer, Form, Input, Modal, Row, Select, Space,
  Table, Tag, Typography, message, Descriptions,
} from 'antd';
import { WarningOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const STATE_COLOR: Record<string, string> = { OPEN: 'red', INVESTIGATING: 'gold', CLOSED: 'green' };
const SEVERITY_COLOR: Record<string, string> = { INFO: 'blue', WARN: 'orange', CRITICAL: 'red' };
const DISPOSITIONS = ['QUARANTINED', 'RETURNED', 'DESTROYED', 'PATIENT_NOTIFIED', 'NOT_FOUND'];

interface Recall {
  id: string;
  recallNumber: string;
  manufacturerName: string | null;
  classification: string | null;
  severity: string;
  hcpcCode: string | null;
  description: string;
  actionRequired: string;
  state: string;
  createdAt: string;
  affectedItems?: any[];
}

const RecallsPage: React.FC = () => {
  const [rows, setRows] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Recall | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: Recall[] }>('/recalls');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openDetail = async (id: string) => {
    const r = await get<Recall>(`/recalls/${id}`);
    setDetail(r);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      const lots = v.lotNumbersCsv ? v.lotNumbersCsv.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      const r = await post<any>('/recalls', { ...v, lotNumbers: lots });
      message.success(`Created ${r.recallNumber} (${r.affectedCount} affected items)`);
      setCreateOpen(false);
      form.resetFields();
      void load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const disposition = (recallId: string, itemId: string) => {
    Modal.confirm({
      title: 'Set disposition',
      content: (
        <Select id={`disp-${itemId}`} placeholder="Choose…" style={{ width: '100%' }}
          options={DISPOSITIONS.map((d) => ({ value: d, label: d }))} />
      ),
      onOk: async () => {
        const sel = document.querySelector(`#disp-${itemId}`) as HTMLElement;
        const v = (sel?.querySelector('.ant-select-selection-item') as HTMLElement)?.getAttribute('title')
          ?? (window.prompt(`Disposition (${DISPOSITIONS.join('|')})`) ?? '').toUpperCase();
        if (!DISPOSITIONS.includes(v)) { message.error('Pick a valid disposition'); return; }
        await post(`/recalls/${recallId}/disposition/${itemId}`, { disposition: v });
        message.success('Set');
        await openDetail(recallId);
      },
    });
  };

  const close = async () => {
    if (!detail) return;
    try {
      await post(`/recalls/${detail.id}/close`, {});
      message.success('Closed');
      await openDetail(detail.id);
      void load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><WarningOutlined /> Recalls</Space>
          </Title>
          <Text type="secondary">Intake a manufacturer recall notice. Auto-scans inventory + POU events for affected items.</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>File recall</Button>
          </Space>
        </Col>
      </Row>

      <Card size="small">
        <Table<Recall>
          rowKey="id" size="small" loading={loading} dataSource={rows} pagination={{ pageSize: 50 }}
          columns={[
            { title: 'Recall #', dataIndex: 'recallNumber', render: (v, r) => <a onClick={() => openDetail(r.id)}><strong>{v}</strong></a> },
            { title: 'Severity', dataIndex: 'severity', width: 100, render: (v) => <Tag color={SEVERITY_COLOR[v]}>{v}</Tag> },
            { title: 'State', dataIndex: 'state', width: 130, render: (v) => <Tag color={STATE_COLOR[v]}>{v}</Tag> },
            { title: 'Class', dataIndex: 'classification', width: 100, render: (v) => v ? <Tag>{v}</Tag> : '—' },
            { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
            { title: 'Action', dataIndex: 'actionRequired', width: 140, render: (v) => <Tag color="purple">{v}</Tag> },
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Created', dataIndex: 'createdAt', width: 130, render: (v) => new Date(v).toLocaleDateString() },
          ]}
        />
      </Card>

      <Modal title="File a recall" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submit} okText="File" width={620}>
        <Form form={form} layout="vertical">
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="What is being recalled and why" />
          </Form.Item>
          <Row gutter={8}>
            <Col span={12}><Form.Item name="hcpcCode" label="HCPC code"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="manufacturerNumber" label="Mfr #"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="lotNumbersCsv" label="Affected lot numbers (comma-separated)">
            <Input placeholder="LOT-001, LOT-002" />
          </Form.Item>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="classification" label="Class">
                <Select allowClear options={['CLASS_I', 'CLASS_II', 'CLASS_III'].map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="actionRequired" label="Action" rules={[{ required: true }]} initialValue="QUARANTINE">
                <Select options={['QUARANTINE', 'RETURN', 'DESTROY', 'NOTIFY_PATIENT'].map((a) => ({ value: a, label: a }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="manufacturerName" label="Manufacturer"><Input /></Form.Item>
          <Form.Item name="manufacturerRecallId" label="Manufacturer recall ID"><Input /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={detail?.recallNumber} width={680} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="State"><Tag color={STATE_COLOR[detail.state]}>{detail.state}</Tag></Descriptions.Item>
              <Descriptions.Item label="Severity"><Tag color={SEVERITY_COLOR[detail.severity]}>{detail.severity}</Tag></Descriptions.Item>
              <Descriptions.Item label="Action">{detail.actionRequired}</Descriptions.Item>
              <Descriptions.Item label="HCPC">{detail.hcpcCode ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Description" span={2}>{detail.description}</Descriptions.Item>
            </Descriptions>
            {detail.state === 'OPEN' && (detail.affectedItems ?? []).length > 0 && (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                message={`${detail.affectedItems?.filter((i: any) => !i.disposition).length} items need disposition`} />
            )}
            {detail.state !== 'CLOSED' && (
              <Button danger block style={{ marginBottom: 12 }} onClick={close}>
                Close recall (requires all dispositions set)
              </Button>
            )}
            <Title level={5}>Affected items ({detail.affectedItems?.length ?? 0})</Title>
            <Table size="small" rowKey="id" pagination={{ pageSize: 25 }}
              dataSource={detail.affectedItems ?? []}
              columns={[
                { title: 'Kind', dataIndex: 'kind', width: 100, render: (v) => <Tag>{v}</Tag> },
                { title: 'Lot', dataIndex: 'lotNumber', width: 120 },
                { title: 'Qty', dataIndex: 'quantityAffected', width: 70, align: 'right' as const },
                { title: 'Patient MRN', dataIndex: 'patientMrn', width: 130 },
                {
                  title: 'Disposition', dataIndex: 'disposition', width: 140,
                  render: (v) => v ? <Tag color="green">{v}</Tag> : <Tag color="orange">PENDING</Tag>,
                },
                {
                  title: 'Action', width: 100,
                  render: (_, r: any) => !r.disposition
                    ? <Button size="small" onClick={() => disposition(detail.id, r.id)}>Set</Button>
                    : null,
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </PageWrap>
  );
};

export default RecallsPage;
