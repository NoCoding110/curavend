import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  message,
  Row,
  Col,
  Select,
  Steps,
  Typography,
  Space,
  Transfer,
} from 'antd';
import type { TransferProps } from 'antd';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;

const STEPS = ['Basic Info', 'Facilities', 'Vendors', 'Admin User', 'Review'];

interface TransferItem {
  key: string;
  title: string;
}

const CreateProvider: React.FC = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const [form0] = Form.useForm();
  const [form3] = Form.useForm();

  const [hospitals, setHospitals] = useState<TransferItem[]>([]);
  const [vendors, setVendors] = useState<TransferItem[]>([]);
  const [selectedHospitals, setSelectedHospitals] = useState<string[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      get('/api/hospitals').catch(() => ({ items: [] })),
      get('/api/vendors').catch(() => ({ items: [] })),
    ]).then(([h, v]: any) => {
      setHospitals((h.items ?? []).map((x: any) => ({ key: x.id, title: x.name ?? x.id })));
      setVendors((v.items ?? []).map((x: any) => ({ key: x.id, title: x.name ?? x.id })));
    });
  }, []);

  const next = async () => {
    try {
      if (current === 0) await form0.validateFields();
      if (current === 3) await form3.validateFields();
      setCurrent((c) => c + 1);
    } catch { /* inline errors */ }
  };

  const prev = () => setCurrent((c) => c - 1);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const basic = form0.getFieldsValue();
      const adminUser = form3.getFieldsValue();

      await post('/api/providers/onboard', {
        ...basic,
        hospitalIds: selectedHospitals,
        vendorIds: selectedVendors,
        adminUser,
      });

      message.success('Provider network created');
      navigate('/vendors');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create provider');
    } finally {
      setLoading(false);
    }
  };

  // Review summary
  const basicVals = form0.getFieldsValue();
  const adminVals = form3.getFieldsValue();

  const stepContent = [
    // Step 0 — Basic Info
    <Form form={form0} layout="vertical" key="basic">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="name" label="Provider Network Name" rules={[{ required: true }]}>
            <Input placeholder="Midwest Health Partners" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="npi" label="Group NPI">
            <Input placeholder="10-digit NPI" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="address" label="Address">
        <Input />
      </Form.Item>
      <Row gutter={16}>
        <Col span={10}>
          <Form.Item name="city" label="City">
            <Input />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="state" label="State">
            <Select showSearch options={['AL','CA','FL','IL','NY','TX','WA'].map((s) => ({ value: s, label: s }))} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="zip" label="ZIP">
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="billingEmail" label="Billing Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>
    </Form>,

    // Step 1 — Facilities
    <div key="facilities">
      <Text type="secondary">Select the hospital facilities that belong to this provider network.</Text>
      <Divider />
      <Transfer
        dataSource={hospitals}
        titles={['Available Facilities', 'In Network']}
        targetKeys={selectedHospitals}
        onChange={(keys) => setSelectedHospitals(keys as string[])}
        render={(item) => item.title}
        listStyle={{ width: '100%', height: 320 }}
        showSearch
      />
    </div>,

    // Step 2 — Vendors
    <div key="vendors">
      <Text type="secondary">Select the DME vendors linked to this provider network.</Text>
      <Divider />
      <Transfer
        dataSource={vendors}
        titles={['Available Vendors', 'Linked']}
        targetKeys={selectedVendors}
        onChange={(keys) => setSelectedVendors(keys as string[])}
        render={(item) => item.title}
        listStyle={{ width: '100%', height: 320 }}
        showSearch
      />
    </div>,

    // Step 3 — Admin User
    <Form form={form3} layout="vertical" key="admin">
      <Text type="secondary">This user becomes the provider network administrator.</Text>
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
      <Form.Item name="phone" label="Phone">
        <Input />
      </Form.Item>
      <Form.Item name="title" label="Job Title">
        <Input placeholder="e.g. Network Director" />
      </Form.Item>
    </Form>,

    // Step 4 — Review
    <div key="review">
      <Title level={5}>Review</Title>
      <Divider />
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>Network Name: </Text><Text>{basicVals.name}</Text>
        </Col>
        <Col span={12}>
          <Text strong>NPI: </Text><Text>{basicVals.npi}</Text>
        </Col>
      </Row>
      <br />
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>Facilities linked: </Text><Text>{selectedHospitals.length}</Text>
        </Col>
        <Col span={12}>
          <Text strong>Vendors linked: </Text><Text>{selectedVendors.length}</Text>
        </Col>
      </Row>
      <br />
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>Admin: </Text><Text>{adminVals.firstName} {adminVals.lastName}</Text>
        </Col>
        <Col span={12}>
          <Text strong>Admin Email: </Text><Text>{adminVals.email}</Text>
        </Col>
      </Row>
    </div>,
  ];

  return (
    <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
      <Card>
        <Title level={3}>Create Provider Network</Title>
        <Steps current={current} items={STEPS.map((t) => ({ title: t }))} style={{ marginBottom: 32 }} />
        {stepContent[current]}
        <Divider />
        <Space>
          {current > 0 && <Button onClick={prev}>Previous</Button>}
          {current < STEPS.length - 1 && (
            <Button type="primary" onClick={next}>Next</Button>
          )}
          {current === STEPS.length - 1 && (
            <Button type="primary" loading={loading} onClick={handleSubmit}>
              Create Provider Network
            </Button>
          )}
          <Button onClick={() => navigate(-1)}>Cancel</Button>
        </Space>
      </Card>
    </div>
  );
};

export default CreateProvider;
