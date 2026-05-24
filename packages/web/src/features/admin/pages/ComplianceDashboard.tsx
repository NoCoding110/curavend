/**
 * Admin: Unified compliance dashboard.
 *
 * Aggregates every compliance_alerts row across vendors, lab lots, and users
 * into one triage view. Filters by severity + subject type. Operator can
 * acknowledge an alert (records who saw it) or trigger a manual sweep.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Row, Select, Space, Statistic, Table, Tag, Typography, message,
} from 'antd';
import {
  SafetyCertificateOutlined, ReloadOutlined, CheckOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const SUBJECT_TYPES = [
  'VENDOR_DMEPOS', 'VENDOR_ACCREDITATION', 'VENDOR_LICENSE',
  'VENDOR_INSURANCE', 'LAB_LOT', 'USER_MFA',
];
const SEVERITY_COLOR: Record<string, string> = { INFO: 'blue', WARN: 'orange', CRITICAL: 'red' };

interface ComplianceAlert {
  id: string;
  hospitalId: string | null;
  subjectType: string;
  subjectId: string;
  alertKind: string;
  thresholdDays: number | null;
  expiresOn: string | null;
  severity: string;
  message: string;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const ComplianceDashboardPage: React.FC = () => {
  const [rows, setRows] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [filter, setFilter] = useState<{ severity?: string; subjectType?: string }>({});

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.severity) params.set('severity', filter.severity);
      if (filter.subjectType) params.set('subjectType', filter.subjectType);
      const r = await get<{ items: ComplianceAlert[] }>(
        `/compliance-alerts${params.toString() ? '?' + params.toString() : ''}`,
      );
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to load');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [filter.severity, filter.subjectType]);

  const ack = async (id: string) => {
    try {
      await post(`/compliance-alerts/${id}/acknowledge`, {});
      message.success('Acknowledged');
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const sweep = async () => {
    setSweeping(true);
    try {
      const r = await post<any>('/compliance-alerts/sweep', {});
      message.success(`Sweep complete: ${r.vendorAccreditation + r.vendorLicense + r.vendorInsurance + r.labLots} new, ${r.resolved} resolved`);
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally { setSweeping(false); }
  };

  const totals = {
    critical: rows.filter((r) => r.severity === 'CRITICAL').length,
    warn: rows.filter((r) => r.severity === 'WARN').length,
    info: rows.filter((r) => r.severity === 'INFO').length,
    unacked: rows.filter((r) => !r.acknowledgedAt).length,
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><SafetyCertificateOutlined /> Compliance Dashboard</Space>
          </Title>
          <Text type="secondary">Pre-expiry alerts for DMEPOS, vendor accreditation/license/insurance, and lab lot expiry. Daily cron at 08:00 UTC.</Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button icon={<ThunderboltOutlined />} loading={sweeping} onClick={sweep}>
              Run sweep now
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="CRITICAL" value={totals.critical} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="WARN" value={totals.warn} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="INFO" value={totals.info} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="Unacknowledged" value={totals.unacked} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Select
            placeholder="All severities" allowClear style={{ width: 160 }}
            value={filter.severity}
            onChange={(v) => setFilter((f) => ({ ...f, severity: v }))}
            options={['CRITICAL', 'WARN', 'INFO'].map((s) => ({ value: s, label: s }))}
          />
          <Select
            placeholder="All subjects" allowClear style={{ width: 240 }}
            value={filter.subjectType}
            onChange={(v) => setFilter((f) => ({ ...f, subjectType: v }))}
            options={SUBJECT_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
          />
        </Space>
      </Card>

      <Card size="small">
        <Table<ComplianceAlert>
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 100 }}
          columns={[
            {
              title: 'Severity', dataIndex: 'severity', width: 100,
              render: (v) => <Tag color={SEVERITY_COLOR[v]}>{v}</Tag>,
            },
            { title: 'Subject', dataIndex: 'subjectType', width: 180, render: (v) => v.replace(/_/g, ' ') },
            { title: 'Subject ID', dataIndex: 'subjectId', width: 100, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> },
            {
              title: 'Expires', dataIndex: 'expiresOn', width: 110,
              render: (v) => v ? new Date(v).toLocaleDateString() : '—',
            },
            {
              title: 'In', dataIndex: 'thresholdDays', width: 70,
              render: (v) => v != null ? <Tag>{v}d</Tag> : '—',
            },
            { title: 'Message', dataIndex: 'message', ellipsis: true },
            {
              title: 'Status', width: 120,
              render: (_, r) =>
                r.acknowledgedAt
                  ? <Tag color="green">Acknowledged</Tag>
                  : <Tag>New</Tag>,
            },
            {
              title: 'Action', width: 110,
              render: (_, r) =>
                r.acknowledgedAt ? null : (
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => ack(r.id)}>
                    Ack
                  </Button>
                ),
            },
          ]}
        />
      </Card>

      <Alert
        type="info" showIcon style={{ marginTop: 12 }}
        message="Auto-resolution"
        description="When the underlying expiry date is renewed past the 60-day horizon, alerts are auto-resolved by the next sweep. Acknowledgement is for triage only; it does not resolve."
      />
    </PageWrap>
  );
};

export default ComplianceDashboardPage;
