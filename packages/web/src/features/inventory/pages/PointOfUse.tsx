/**
 * Bedside point-of-use capture — quick scan/search form.
 */
import React, { useState } from 'react';
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Table, Tag, Typography, message,
} from 'antd';
import { ScanOutlined, PlusOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface RecentEvent {
  id: string;
  hcpcCode: string | null;
  description?: string;
  quantity: number;
  lotNumber: string | null;
  capturedAt: string;
}

const PointOfUsePage: React.FC = () => {
  const [contextForm] = Form.useForm();
  const [lineForm] = Form.useForm();
  const [recent, setRecent] = useState<RecentEvent[]>([]);

  const capture = async () => {
    try {
      const ctx = await contextForm.validateFields().catch(() => ({}));
      const line = await lineForm.validateFields();
      const body = { ...ctx, ...line };
      const r = await post<{ id: string }>('/point-of-use', body);
      message.success('Captured');
      setRecent((prev) => [
        {
          id: r.id,
          hcpcCode: line.hcpcCode ?? null,
          description: line.description,
          quantity: line.quantity ?? 1,
          lotNumber: line.lotNumber ?? null,
          capturedAt: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 50));
      lineForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Capture failed');
    }
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><ScanOutlined /> Point-of-Use Capture</Space>
          </Title>
          <Text type="secondary">
            Record what was used at the bedside. Decrements inventory if you supply a lot ID.
          </Text>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col xs={24} md={10}>
          <Card size="small" title="Encounter context (persists across scans)">
            <Form form={contextForm} layout="vertical" initialValues={{ deviceId: 'kiosk-1' }}>
              <Form.Item name="patientMrn" label="Patient MRN">
                <Input placeholder="e.g. MRN-12345" />
              </Form.Item>
              <Form.Item name="encounterId" label="Encounter ID">
                <Input placeholder="optional" />
              </Form.Item>
              <Form.Item name="departmentId" label="Department ID">
                <Input placeholder="optional" />
              </Form.Item>
              <Form.Item name="roomId" label="Room ID">
                <Input placeholder="optional" />
              </Form.Item>
              <Form.Item name="deviceId" label="Device ID">
                <Input />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={14}>
          <Card size="small" title="Scan / enter item">
            <Form form={lineForm} layout="vertical" onFinish={capture}>
              <Form.Item name="hcpcCode" label="HCPC code">
                <Input placeholder="e.g. A4253" />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input />
              </Form.Item>
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item name="quantity" label="Quantity" initialValue={1}>
                    <InputNumber min={1} max={999} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="lotNumber" label="Lot #">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="serialNumber" label="Serial #">
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="inventoryLotId" label="Lab Inventory lot ID (decrements)" tooltip="If provided, the service issues from that lot.">
                <Input placeholder="optional UUID" />
              </Form.Item>
              <Button type="primary" icon={<PlusOutlined />} htmlType="submit" size="large" block>
                Capture
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Recent captures (this session)" style={{ marginTop: 16 }}>
        {recent.length === 0 ? (
          <Alert type="info" message="No captures yet" showIcon />
        ) : (
          <Table
            size="small" rowKey="id" pagination={false}
            dataSource={recent}
            columns={[
              { title: 'When', dataIndex: 'capturedAt', width: 170, render: (v) => new Date(v).toLocaleString() },
              { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
              { title: 'Description', dataIndex: 'description', ellipsis: true },
              { title: 'Qty', dataIndex: 'quantity', width: 60, align: 'right' as const },
              { title: 'Lot', dataIndex: 'lotNumber', width: 120, render: (v) => v ? <Tag>{v}</Tag> : '—' },
            ]}
          />
        )}
      </Card>
    </PageWrap>
  );
};

export default PointOfUsePage;
