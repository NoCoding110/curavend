import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Select,
  InputNumber,
  Typography,
  message,
  Modal,
  Space,
  Divider,
  Table,
  Tag,
  Alert,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { labsApi, type LabGroup, type LabKitSite } from '../../../api/labs';

interface Shortage {
  testCode: string;
  consumableId: string;
  consumableCode: string;
  requested: number;
  issued: number;
  short: number;
  isCritical: boolean;
}

const { Title } = Typography;

const CreateLabOrder: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [groups, setGroups] = useState<LabGroup[]>([]);
  const [kitSites, setKitSites] = useState<LabKitSite[]>([]);
  const [tests, setTests] = useState<{ testCode: string; testName: string }[]>([]);
  const [testCode, setTestCode] = useState('');
  const [testName, setTestName] = useState('');
  const [dxCodes, setDxCodes] = useState<{ code: string }[]>([]);
  const [dxInput, setDxInput] = useState('');

  useEffect(() => {
    (async () => {
      const [g, k] = await Promise.all([labsApi.listGroups(), labsApi.listKitSites()]);
      setGroups(g.data);
      setKitSites(k.data);
    })();
  }, []);

  const showShortageDialog = (orderId: string, orderNumber: string, shortages: Shortage[]) => {
    const hasCritical = shortages.some((s) => s.isCritical);
    Modal[hasCritical ? 'error' : 'warning']({
      title: hasCritical
        ? `Order ${orderNumber} created — CRITICAL shortages detected`
        : `Order ${orderNumber} created — minor shortages logged`,
      width: 720,
      maskClosable: false,
      okText: hasCritical ? 'Acknowledge & continue' : 'OK',
      content: (
        <div>
          <Alert
            type={hasCritical ? 'error' : 'warning'}
            showIcon
            style={{ marginBottom: 12 }}
            message={
              hasCritical
                ? 'One or more critical consumables were not fully stocked. The order was created, but the lab cannot run these tests until inventory is replenished.'
                : 'Some consumables were under-stocked. The order is valid; please reorder soon.'
            }
          />
          <Table<Shortage>
            size="small"
            pagination={false}
            rowKey={(r) => `${r.testCode}-${r.consumableId}`}
            dataSource={shortages}
            columns={[
              { title: 'Test', dataIndex: 'testCode', width: 90 },
              { title: 'Consumable', dataIndex: 'consumableCode', width: 130 },
              { title: 'Requested', dataIndex: 'requested', width: 90, align: 'right' as const },
              { title: 'Issued', dataIndex: 'issued', width: 80, align: 'right' as const },
              {
                title: 'Short',
                dataIndex: 'short',
                width: 80,
                align: 'right' as const,
                render: (v: number) => <strong style={{ color: '#cf1322' }}>{v}</strong>,
              },
              {
                title: 'Priority',
                dataIndex: 'isCritical',
                width: 90,
                render: (v: boolean) => (v ? <Tag color="red">CRITICAL</Tag> : <Tag>routine</Tag>),
              },
            ]}
          />
        </div>
      ),
      onOk: () => navigate(`/labs/orders/${orderId}`),
    });
  };

  const submit = async (values: any) => {
    setSubmitting(true);
    try {
      const res = await labsApi.createOrder({
        ...values,
        testList: tests,
        dxCodeList: dxCodes,
        items: tests.map((t) => ({
          testCode: t.testCode,
          testName: t.testName,
          quantity: 1,
          barcode: `${t.testCode}-${Date.now()}`,
        })),
      });
      const shortages: Shortage[] = res?.consumption?.shortages ?? [];
      if (shortages.length > 0) {
        // Surface shortages BEFORE navigating so user must acknowledge.
        showShortageDialog(res.id, res.orderNumber, shortages);
      } else {
        message.success(`Lab order ${res.orderNumber} created. Assets generating…`);
        navigate(`/labs/orders/${res.id}`);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
      <Title level={3}>New Lab Order</Title>
      <Card>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="Lab Group" name="labGroupId" rules={[{ required: true }]}>
            <Select
              placeholder="Select lab group"
              options={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.groupType})` }))}
            />
          </Form.Item>
          <Form.Item label="Kit Site" name="kitSiteId">
            <Select
              allowClear
              placeholder="(optional) Select kit site"
              options={kitSites.map((s) => ({ value: s.id, label: `${s.siteName}${s.siteNumber ? ' #' + s.siteNumber : ''}` }))}
            />
          </Form.Item>
          <Form.Item label="LabCorp reference" name="lcOrderReference">
            <Input placeholder="(optional) LC reference number" />
          </Form.Item>

          <Divider>Patient</Divider>
          <Form.Item label="Patient First Name" name="patientName">
            <Input />
          </Form.Item>
          <Form.Item label="Patient Last Name" name="patientLastName">
            <Input />
          </Form.Item>
          <Form.Item label="Patient Email" name="patientEmail">
            <Input type="email" />
          </Form.Item>
          <Form.Item label="Patient Phone" name="patientPhone">
            <Input />
          </Form.Item>
          <Form.Item label="Address" name="patientAddress">
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item label="City" name="patientCity" style={{ flex: 2 }}>
              <Input />
            </Form.Item>
            <Form.Item label="State" name="patientState">
              <Input maxLength={2} style={{ width: 80 }} />
            </Form.Item>
            <Form.Item label="ZIP" name="patientZip">
              <Input maxLength={10} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Divider>Tests</Divider>
          <Space style={{ marginBottom: 8 }}>
            <Input
              placeholder="Test code (e.g. 80048)"
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              style={{ width: 180 }}
            />
            <Input
              placeholder="Test name (e.g. CMP)"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              style={{ width: 280 }}
            />
            <Button
              onClick={() => {
                if (testCode && testName) {
                  setTests([...tests, { testCode, testName }]);
                  setTestCode('');
                  setTestName('');
                }
              }}
            >
              + Add Test
            </Button>
          </Space>
          <div>
            {tests.map((t, i) => (
              <Card
                key={i}
                size="small"
                style={{ marginBottom: 6 }}
                extra={
                  <Button size="small" danger type="text" onClick={() => setTests(tests.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                }
              >
                <strong>{t.testCode}</strong> — {t.testName}
              </Card>
            ))}
          </div>

          <Divider>Diagnosis Codes (ICD-10)</Divider>
          <Space style={{ marginBottom: 8 }}>
            <Input
              placeholder="ICD-10 code (e.g. E11.9)"
              value={dxInput}
              onChange={(e) => setDxInput(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              onClick={() => {
                if (dxInput) {
                  setDxCodes([...dxCodes, { code: dxInput }]);
                  setDxInput('');
                }
              }}
            >
              + Add DX
            </Button>
          </Space>
          <div>
            {dxCodes.map((d, i) => (
              <Card
                key={i}
                size="small"
                style={{ marginBottom: 6 }}
                extra={
                  <Button size="small" danger type="text" onClick={() => setDxCodes(dxCodes.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                }
              >
                {d.code}
              </Card>
            ))}
          </div>

          <Form.Item label="Quantity" name="quantity" initialValue={1}>
            <InputNumber min={1} max={20} />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Create Order
              </Button>
              <Button onClick={() => navigate('/labs/orders')}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default CreateLabOrder;
