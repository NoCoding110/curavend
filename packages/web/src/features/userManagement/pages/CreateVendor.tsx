import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  message,
  Select,
  Steps,
  Typography,
  Row,
  Col,
  Divider,
  Alert,
  Space,
} from 'antd';
import { post } from '../../../api/client';

const { Title, Text } = Typography;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const STEPS = ['Basic Info', 'Address & Contact', 'Licensing', 'Admin User'];

const CreateVendor: React.FC = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const [form0] = Form.useForm(); // Basic Info
  const [form1] = Form.useForm(); // Address/Contact
  const [form2] = Form.useForm(); // Licensing
  const [form3] = Form.useForm(); // Admin User

  const forms = [form0, form1, form2, form3];

  const next = async () => {
    try {
      await forms[current].validateFields();
      setCurrent((c) => c + 1);
    } catch {
      // validation errors shown inline
    }
  };

  const prev = () => setCurrent((c) => c - 1);

  const handleSubmit = async () => {
    try {
      await form3.validateFields();
    } catch {
      return;
    }
    setLoading(true);
    try {
      const basic = form0.getFieldsValue();
      const address = form1.getFieldsValue();
      const licensing = form2.getFieldsValue();
      const admin = form3.getFieldsValue();

      await post('/api/vendors/onboard', {
        ...basic,
        ...address,
        accreditationExpiry: licensing.accreditationExpiry?.toISOString?.() ?? licensing.accreditationExpiry,
        stateLicenseExpiry: licensing.stateLicenseExpiry?.toISOString?.() ?? licensing.stateLicenseExpiry,
        liabilityInsuranceExpiry: licensing.liabilityInsuranceExpiry?.toISOString?.() ?? licensing.liabilityInsuranceExpiry,
        adminUser: admin,
      });

      message.success('Vendor created — admin user will receive a welcome email');
      navigate('/vendors');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create vendor');
    } finally {
      setLoading(false);
    }
  };

  const stepContent = [
    // Step 0 — Basic Info
    <Form form={form0} layout="vertical" key="basic">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="name" label="Vendor Name" rules={[{ required: true }]}>
            <Input placeholder="Acme DME Solutions" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="npi" label="NPI Number">
            <Input placeholder="10-digit NPI" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="taxId" label="Tax ID (EIN)">
            <Input placeholder="XX-XXXXXXX" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="type" label="Vendor Type">
            <Select options={[
              { value: 'DME', label: 'DME Supplier' },
              { value: 'PHARMACY', label: 'Pharmacy' },
              { value: 'ORTHOTICS', label: 'Orthotics & Prosthetics' },
              { value: 'OTHER', label: 'Other' },
            ]} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="website" label="Website">
        <Input placeholder="https://example.com" />
      </Form.Item>
    </Form>,

    // Step 1 — Address & Contact
    <Form form={form1} layout="vertical" key="address">
      <Row gutter={16}>
        <Col span={16}>
          <Form.Item name="address" label="Street Address" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="suite" label="Suite / Unit">
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={10}>
          <Form.Item name="city" label="City" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="state" label="State" rules={[{ required: true }]}>
            <Select options={US_STATES.map((s) => ({ value: s, label: s }))} showSearch />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="zip" label="ZIP Code" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="phone" label="Phone" rules={[{ required: true }]}>
            <Input placeholder="(555) 000-0000" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="fax" label="Fax">
            <Input placeholder="(555) 000-0001" />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="billingEmail" label="Billing Email" rules={[{ type: 'email' }]}>
        <Input />
      </Form.Item>
    </Form>,

    // Step 2 — Licensing
    <Form form={form2} layout="vertical" key="licensing">
      <Alert
        message="All licence dates are used for expiry notifications 30 days before renewal."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="accreditationBody" label="Accreditation Body">
            <Select options={[
              { value: 'ACHC', label: 'ACHC' },
              { value: 'JCAHO', label: 'The Joint Commission' },
              { value: 'BOC', label: 'BOC' },
              { value: 'NONE', label: 'None / Pending' },
            ]} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="accreditationExpiry" label="Accreditation Expiry">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="stateLicenseNumber" label="State License Number">
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="stateLicenseExpiry" label="State License Expiry">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="liabilityInsuranceCarrier" label="Liability Insurance Carrier">
            <Input />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="liabilityInsuranceExpiry" label="Policy Expiry">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
    </Form>,

    // Step 3 — Admin User
    <Form form={form3} layout="vertical" key="admin">
      <Text type="secondary">
        This user will be the primary administrator for the vendor account and will receive the
        welcome email.
      </Text>
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
        <Input placeholder="e.g. Account Manager" />
      </Form.Item>
    </Form>,
  ];

  return (
    <div style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px' }}>
      <Card>
        <Title level={3}>Create New Vendor</Title>
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
              Create Vendor
            </Button>
          )}
          <Button onClick={() => navigate(-1)}>Cancel</Button>
        </Space>
      </Card>
    </div>
  );
};

export default CreateVendor;
