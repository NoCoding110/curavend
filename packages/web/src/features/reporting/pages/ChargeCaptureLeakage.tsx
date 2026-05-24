/**
 * Charge capture leakage — POU events without a matching invoice line.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { DollarOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const ChargeCaptureLeakagePage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<any>('/reporting/charge-capture-leakage');
      setRows(r.items ?? []);
      setTotalUsd(r.totalUsd ?? 0);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><DollarOutlined /> Charge Capture Leakage</Space>
          </Title>
          <Text type="secondary">Point-of-use events without a matching invoice_item_id — revenue at risk.</Text>
        </Col>
        <Col><Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button></Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={12}><Card size="small"><Statistic title="Uncharged events" value={rows.length} /></Card></Col>
        <Col span={12}><Card size="small"><Statistic title="Estimated leakage" value={totalUsd} prefix="$" precision={2} valueStyle={{ color: totalUsd > 0 ? '#cf1322' : undefined }} /></Card></Col>
      </Row>

      <Alert type="warning" showIcon style={{ marginBottom: 12 }}
        message="Bill or mark as NON_BILLABLE to clear from this report." />

      <Card size="small">
        <Table size="small" rowKey="id" loading={loading} dataSource={rows} pagination={{ pageSize: 100 }}
          columns={[
            { title: 'When', dataIndex: 'capturedAt', width: 170, render: (v) => new Date(v).toLocaleString() },
            { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
            { title: 'Patient', dataIndex: 'patientMrn', width: 130 },
            { title: 'Encounter', dataIndex: 'encounterId', width: 150, ellipsis: true },
            { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' as const },
            { title: 'Unit $', dataIndex: 'unitPriceUsd', width: 90, align: 'right' as const, render: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
            {
              title: 'Line $', width: 100, align: 'right' as const,
              render: (_, r: any) => r.unitPriceUsd != null ? <strong style={{ color: '#cf1322' }}>${(r.quantity * r.unitPriceUsd).toFixed(2)}</strong> : '—',
            },
            { title: 'Status', dataIndex: 'chargeStatus', width: 120, render: (v) => <Tag color="orange">{v}</Tag> },
          ]}
        />
      </Card>
    </PageWrap>
  );
};

export default ChargeCaptureLeakagePage;
