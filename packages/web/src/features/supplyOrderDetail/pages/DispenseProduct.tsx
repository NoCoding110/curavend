import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Table,
  Descriptions,
  InputNumber,
  Tag,
  Divider,
  message,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

interface DispenseItem {
  key: string;
  hcpcCode: string;
  description: string;
  orderedQty: number;
  dispenseQty: number;
  lotNumber: string;
  serialNumber: string;
}

const DispenseProduct: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DispenseItem[]>([
    { key: '1', hcpcCode: 'E0601', description: 'Continuous Positive Airway Pressure (CPAP) Device', orderedQty: 1, dispenseQty: 0, lotNumber: '', serialNumber: '' },
    { key: '2', hcpcCode: 'A7030', description: 'Full Face Mask, CPAP, Replacement', orderedQty: 2, dispenseQty: 0, lotNumber: '', serialNumber: '' },
    { key: '3', hcpcCode: 'A7031', description: 'Face Mask Interface, Replacement Cushion', orderedQty: 4, dispenseQty: 0, lotNumber: '', serialNumber: '' },
  ]);

  const updateDispenseQty = (key: string, qty: number) => {
    setItems(items.map((item) =>
      item.key === key ? { ...item, dispenseQty: qty } : item
    ));
  };

  const handleScan = () => {
    message.info('Barcode/QR scanner will be integrated here.');
  };

  const handleDispense = () => {
    const hasZero = items.some((item) => item.dispenseQty === 0);
    if (hasZero) {
      message.warning('Please enter dispense quantities for all items.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      message.success('Products dispensed successfully!');
      navigate(`/supply-orders/${orderId}`);
    }, 1500);
  };

  const baseColumns: ColumnsType<DispenseItem> = [
    { title: 'HCPC Code', dataIndex: 'hcpcCode', key: 'hcpcCode', width: 120 },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    {
      title: 'Ordered Qty',
      dataIndex: 'orderedQty',
      key: 'orderedQty',
      align: 'center',
      width: 120,
    },
    {
      title: 'Dispense Qty',
      key: 'dispenseQty',
      align: 'center',
      width: 140,
      render: (_: unknown, record: DispenseItem) => (
        <InputNumber
          min={0}
          max={record.orderedQty}
          value={record.dispenseQty}
          onChange={(val) => updateDispenseQty(record.key, val || 0)}
        />
      ),
    },
    {
      title: 'Status',
      key: 'status',
      align: 'center',
      width: 120,
      render: (_: unknown, record: DispenseItem) => {
        if (record.dispenseQty === 0) return <Tag>Not Dispensed</Tag>;
        if (record.dispenseQty < record.orderedQty) return <Tag color="orange">Partial</Tag>;
        return <Tag color="green">Full</Tag>;
      },
    },
  ];
  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
                Back
              </Button>
              <Title level={3} style={{ margin: 0 }}>
                Dispense Products — {orderId || 'SO-2024-001'}
              </Title>
            </Space>
          </Col>
          <Col>
            <Button icon={<ScanOutlined />} onClick={handleScan}>
              Scan Barcode / QR
            </Button>
          </Col>
        </Row>

        <Alert
          message="Verify product details before dispensing"
          description="Ensure all items match the order and scan barcodes for verification when possible."
          type="info"
          showIcon
        />

        {/* Order Summary */}
        <SectionCard title="Order Summary">
          <Descriptions column={3} size="small">
            <Descriptions.Item label="Order ID">{orderId || 'SO-2024-001'}</Descriptions.Item>
            <Descriptions.Item label="Patient">John Smith</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color="blue">In Process</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Vendor">MedSupply Co</Descriptions.Item>
            <Descriptions.Item label="Hospital">City General</Descriptions.Item>
            <Descriptions.Item label="Order Date">2024-12-01</Descriptions.Item>
          </Descriptions>
        </SectionCard>

        {/* Product List */}
        <SectionCard title="Products to Dispense">
          <Table
            columns={columns}
            components={tableComponents}
            dataSource={items}
            pagination={false}
            size="middle"
          />
        </SectionCard>

        <Row justify="end">
          <Space>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={loading}
              onClick={handleDispense}
              size="large"
            >
              Confirm Dispense
            </Button>
          </Space>
        </Row>
      </Space>
    </PageWrapper>
  );
};

export default DispenseProduct;
