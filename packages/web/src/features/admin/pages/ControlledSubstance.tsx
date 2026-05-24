/**
 * Admin: Controlled-substance log + new event form.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Table,
  Tag, Typography, message,
} from 'antd';
import { LockOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const EVENT_TYPES = ['RECEIVE', 'DISPENSE', 'WASTE', 'TRANSFER', 'COUNT', 'DISCREPANCY'];
const EVENT_COLOR: Record<string, string> = {
  RECEIVE: 'green', DISPENSE: 'blue', WASTE: 'red',
  TRANSFER: 'cyan', COUNT: 'default', DISCREPANCY: 'volcano',
};

const ControlledSubstancePage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: any[] }>('/controlled-substance/log');
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    try {
      const v = await form.validateFields();
      await post('/controlled-substance/event', v);
      message.success('Recorded');
      setCreateOpen(false);
      form.resetFields();
      void load();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><LockOutlined /> Controlled Substances</Space>
          </Title>
          <Text type="secondary">Chain-of-custody log for DEA Schedule II–V items. Schedule II DISPENSE / WASTE require a witness.</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Record event</Button>
          </Space>
        </Col>
      </Row>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Append-only log. Use COUNT events to spot-check; record DISCREPANCY for missing units." />

      <Card size="small">
        <Table size="small" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 100 }}
          columns={[
            { title: 'When', dataIndex: 'occurredAt', width: 170, render: (v) => new Date(v).toLocaleString() },
            { title: 'Event', dataIndex: 'eventType', width: 120, render: (v) => <Tag color={EVENT_COLOR[v]}>{v}</Tag> },
            { title: 'Sched', dataIndex: 'deaSchedule', width: 80, render: (v) => v ? <Tag>{v}</Tag> : '—' },
            { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
            { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' as const, render: (v) => <strong style={{ color: v > 0 ? '#52c41a' : v < 0 ? '#cf1322' : undefined }}>{v > 0 ? '+' + v : v}</strong> },
            { title: 'After', dataIndex: 'quantityAfter', width: 70, align: 'right' as const },
            { title: 'Patient', dataIndex: 'patientMrn', width: 120 },
            { title: 'By', dataIndex: 'performedByUserId', width: 150, ellipsis: true, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v?.slice(0, 8)}</Text> },
            { title: 'Witness', dataIndex: 'witnessedByUserId', width: 150, ellipsis: true, render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> : '—' },
          ]}
        />
      </Card>

      <Modal title="Record controlled-substance event" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submit} okText="Record" width={520}>
        <Form form={form} layout="vertical">
          <Form.Item name="eventType" label="Event type" rules={[{ required: true }]}>
            <Select options={EVENT_TYPES.map((e) => ({ value: e, label: e }))} />
          </Form.Item>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="formularyItemId" label="Formulary item ID">
                <Input placeholder="Pick from formulary…" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="hcpcCode" label="HCPC code (if no item)"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="deaSchedule" label="DEA Schedule (if no item)">
            <Select allowClear options={['II', 'III', 'IV', 'V'].map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="quantity" label="Quantity (signed)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} placeholder="+ for RECEIVE, – for DISPENSE" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lotNumber" label="Lot #"><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="patientMrn" label="Patient MRN (DISPENSE only)"><Input /></Form.Item>
          <Form.Item name="witnessedByUserId" label="Witness user ID (Schedule II required)"><Input /></Form.Item>
          <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </PageWrap>
  );
};

export default ControlledSubstancePage;
