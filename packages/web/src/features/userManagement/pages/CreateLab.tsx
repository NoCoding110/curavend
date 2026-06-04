import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  message,
  Row,
  Select,
  Space,
  Steps,
  Typography,
} from 'antd';
import { post } from '../../../api/client';

const { Title, Text } = Typography;

const STEPS = ['Basic Info', 'Admin User', 'Review'];

const GROUP_TYPES = [
  { value: 'SINGLE_SITE', label: 'Single site' },
  { value: 'D2P', label: 'Direct-to-patient (D2P)' },
];

const CreateLab: React.FC = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const [form0] = Form.useForm();
  const [form1] = Form.useForm();

  const next = async () => {
    try {
      if (current === 0) await form0.validateFields();
      if (current === 1) await form1.validateFields();
      setCurrent((c) => c + 1);
    } catch {
      /* inline errors */
    }
  };

  const prev = () => setCurrent((c) => c - 1);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const basic = form0.getFieldsValue();
      const adminUser = form1.getFieldsValue();

      await post('/api/labs/onboard', {
        name: basic.name,
        groupType: basic.groupType,
        description: basic.description,
        adminUser,
      });

      message.success('Lab group created');
      navigate('/labs');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create lab group');
    } finally {
      setLoading(false);
    }
  };

  const basicVals = form0.getFieldsValue();
  const adminVals = form1.getFieldsValue();

  const stepContent = [
    <Form form={form0} layout="vertical" key="basic">
      <Row gutter={16}>
        <Col span={14}>
          <Form.Item name="name" label="Lab Group Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Quest Diagnostics – Midwest" />
          </Form.Item>
        </Col>
        <Col span={10}>
          <Form.Item name="groupType" label="Group Type" rules={[{ required: true }]}>
            <Select options={GROUP_TYPES} placeholder="Select group type" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="description" label="Description">
        <Input.TextArea rows={3} placeholder="Optional notes about this lab group" />
      </Form.Item>
    </Form>,

    <Form form={form1} layout="vertical" key="admin">
      <Text type="secondary">This user becomes the lab group administrator (LAB_ADMIN).</Text>
      <Divider />
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="firstName" label="First Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="email" label="Email" rules={[{ required: true }, { type: 'email' }]}>
        <Input />
      </Form.Item>
    </Form>,

    <div key="review">
      <Title level={5}>Review</Title>
      <Divider />
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>Lab Group: </Text>
          <Text>{basicVals.name}</Text>
        </Col>
        <Col span={12}>
          <Text strong>Type: </Text>
          <Text>{basicVals.groupType}</Text>
        </Col>
      </Row>
      <br />
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>Admin: </Text>
          <Text>
            {adminVals.firstName} {adminVals.lastName}
          </Text>
        </Col>
        <Col span={12}>
          <Text strong>Admin Email: </Text>
          <Text>{adminVals.email}</Text>
        </Col>
      </Row>
    </div>,
  ];

  return (
    <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
      <Card>
        <Title level={3}>Create Lab Group</Title>
        <Steps current={current} items={STEPS.map((t) => ({ title: t }))} style={{ marginBottom: 32 }} />
        {stepContent[current]}
        <Divider />
        <Space>
          {current > 0 && <Button onClick={prev}>Previous</Button>}
          {current < STEPS.length - 1 && (
            <Button type="primary" onClick={next}>
              Next
            </Button>
          )}
          {current === STEPS.length - 1 && (
            <Button type="primary" loading={loading} onClick={handleSubmit}>
              Create Lab Group
            </Button>
          )}
          <Button onClick={() => navigate(-1)}>Cancel</Button>
        </Space>
      </Card>
    </div>
  );
};

export default CreateLab;
