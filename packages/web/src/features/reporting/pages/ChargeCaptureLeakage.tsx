/**
 * Charge capture leakage — POU events without a matching invoice line.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { DollarOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { useAdminHospitalSelect } from '../../../hooks/useAdminHospitalSelect';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const ChargeCaptureLeakagePage: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [rows, setRows] = useState<any[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    if (isAdmin && !adminHospital.selectedId) return;
    setLoading(true);
    setForbidden(false);
    try {
      const params: Record<string, any> = {};
      if (isAdmin && adminHospital.selectedId) params.hospitalId = adminHospital.selectedId;
      const r = await get<any>('/reporting/charge-capture-leakage', params);
      setRows(r.items ?? []);
      setTotalUsd(r.totalUsd ?? 0);
    } catch (err: any) {
      if (err?.response?.status === 403) { setForbidden(true); }
      else { message.error(err?.response?.data?.error ?? 'Failed'); }
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [adminHospital.selectedId]);

  if (isAdmin && !adminHospital.selectedId) {
    return (
      <PageWrap>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Select a hospital to view this report"
          description={
            <Select
              placeholder="Select hospital…"
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280, marginTop: 8 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          }
        />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      {isAdmin && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space>
            <span>Hospital:</span>
            <Select
              value={adminHospital.selectedId}
              onChange={adminHospital.setSelectedId}
              loading={adminHospital.loading}
              style={{ width: 280 }}
              options={adminHospital.hospitals.map(h => ({ value: h.id, label: h.name }))}
            />
          </Space>
        </Card>
      )}
      {forbidden && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="Hospital context required"
          description="This report is scoped to a single hospital. Your account has no default hospital — contact your administrator or select a hospital in the top bar." />
      )}
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
