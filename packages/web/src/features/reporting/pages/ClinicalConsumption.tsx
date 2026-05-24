/**
 * Clinical consumption rollup — cost per encounter / department / provider.
 */
import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Segmented, Space, Table, Typography, message } from 'antd';
import { MedicineBoxOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const ClinicalConsumptionPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<string>('encounter');

  const load = async () => {
    setLoading(true);
    try {
      const r = await get<any>(`/reporting/clinical-consumption?groupBy=${groupBy}`);
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [groupBy]);

  return (
    <PageWrap>
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
