/**
 * Clinical consumption rollup — cost per encounter / department / provider.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Row, Segmented, Select, Space, Table, Typography, message } from 'antd';
import { MedicineBoxOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';
import { useUserRoles } from '../../../hooks/useUserRoles';
import { useAdminHospitalSelect } from '../../../hooks/useAdminHospitalSelect';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const ClinicalConsumptionPage: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const adminHospital = useAdminHospitalSelect();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<string>('encounter');
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    if (isAdmin && !adminHospital.selectedId) return;
    setLoading(true);
    setForbidden(false);
    try {
      const params: Record<string, any> = { groupBy };
      if (isAdmin && adminHospital.selectedId) params.hospitalId = adminHospital.selectedId;
      const r = await get<any>('/reporting/clinical-consumption', params);
      setRows(r.items ?? []);
    } catch (err: any) {
      if (err?.response?.status === 403) { setForbidden(true); }
      else { message.error(err?.response?.data?.error ?? 'Failed'); }
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [groupBy, adminHospital.selectedId]);

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
            <Space><MedicineBoxOutlined /> Clinical Consumption</Space>
          </Title>
          <Text type="secondary">Top consumers from point-of-use events. Roll up by encounter, department, or provider.</Text>
        </Col>
        <Col>
          <Space>
            <Segmented
              options={[
                { label: 'Encounter', value: 'encounter' },
                { label: 'Department', value: 'department' },
                { label: 'Provider', value: 'provider' },
              ]}
              value={groupBy}
              onChange={(v) => setGroupBy(String(v))}
            />
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Card size="small">
        <Table size="small" rowKey="group_key" loading={loading} dataSource={rows} pagination={{ pageSize: 100 }}
          columns={[
            { title: groupBy.toUpperCase(), dataIndex: 'group_key', ellipsis: true, render: (v: string) => <Text code>{v}</Text> },
            { title: 'Events', dataIndex: 'event_count', width: 110, align: 'right' as const },
            { title: 'Units', dataIndex: 'units', width: 100, align: 'right' as const },
            { title: 'Cost USD', dataIndex: 'total_usd', width: 140, align: 'right' as const, render: (v) => <strong>${Number(v).toLocaleString()}</strong> },
          ]}
        />
      </Card>
    </PageWrap>
  );
};

export default ClinicalConsumptionPage;
