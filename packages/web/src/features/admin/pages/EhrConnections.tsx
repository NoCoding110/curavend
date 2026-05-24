/**
 * EHR Connections admin page.
 *
 * Lists configured EHR connections, lets admins add new ones with vendor +
 * auth mode + mapping profile. Shows the webhook URL to point the EHR at
 * and recent ingest log entries.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { PlusOutlined, LinkOutlined, ApiOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { get, post, patch, del } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;

const PageWrap = styled.div`padding: 24px;`;

const EHR_VENDORS = ['EPIC', 'CERNER', 'MEDITECH', 'ATHENA', 'ALLSCRIPTS', 'ECW', 'GENERIC_FHIR_R4'] as const;
const AUTH_MODES = ['OAUTH2_CLIENT_CREDENTIALS', 'OAUTH2_USER_DELEGATED', 'SHARED_SECRET', 'API_KEY', 'MTLS'] as const;

interface EhrConnection {
  id: string;
  hospitalId: string;
  name: string;
  vendor: string;
  authMode: string;
  fhirBaseUrl: string | null;
  isActive: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

interface IngestLog {
  id: string;
  connectionId: string;
  resourceType: string | null;
  resourceId: string | null;
  mappedOrderId: string | null;
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'SKIPPED';
  errorMessage: string | null;
  receivedAt: string;
}

const StatusTag: React.FC<{ s: string }> = ({ s }) => {
  const color = s === 'PROCESSED' ? 'green' : s === 'SKIPPED' ? 'default' : s === 'FAILED' ? 'red' : 'blue';
  return <Tag color={color}>{s}</Tag>;
};

const VendorTag: React.FC<{ v: string }> = ({ v }) => {
  const color =
    v === 'EPIC' ? 'red' :
    v === 'CERNER' ? 'volcano' :
    v === 'ATHENA' ? 'purple' :
    v === 'MEDITECH' ? 'magenta' :
    v === 'ALLSCRIPTS' ? 'orange' :
    v === 'ECW' ? 'cyan' : 'blue';
  return <Tag color={color}>{v.replace('_', ' ')}</Tag>;
};

const apiBase =
  typeof window !== 'undefined' && window.location.host.includes('localhost')
    ? 'http://localhost:8787/api'
    : 'https://curavend-api.metabilityllc1.workers.dev/api';

export const EhrConnections: React.FC = () => {
  const [list, setList] = useState<EhrConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<IngestLog[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: EhrConnection[] }>('/ehr/connections');
      setList(r.items);
      if (!selectedId && r.items.length > 0) setSelectedId(r.items[0].id);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetchList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const fetchLogs = async () => {
    if (!selectedId) return;
    try {
      const r = await get<{ items: IngestLog[] }>(`/ehr/connections/${selectedId}/recent-logs`);
      setLogs(r.items);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load logs');
    }
  };
  useEffect(() => { void fetchLogs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedId]);

  const selected = list.find((c) => c.id === selectedId);
  const webhookUrl = selected ? `${apiBase}/ehr/${selected.id}/ingest` : '';

  // ── Create ──────────────────────────────────────────────────
  const [createForm] = Form.useForm();
  const handleCreate = async () => {
    let v: any;
    try { v = await createForm.validateFields(); } catch { return; }
    try {
      let mappingProfile = v.mappingProfile;
      if (mappingProfile && typeof mappingProfile === 'string' && mappingProfile.trim()) {
        try { mappingProfile = JSON.parse(mappingProfile); } catch {
          message.error('Mapping profile must be valid JSON');
          return;
        }
      } else {
        mappingProfile = undefined;
      }
      const resp = await post<{ id: string }>('/ehr/connections', { ...v, mappingProfile });
      message.success(`Connection "${v.name}" created`);
      setCreateOpen(false);
      createForm.resetFields();
      await fetchList();
      setSelectedId(resp.id);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to create');
    }
  };

  const handleToggleActive = async (conn: EhrConnection) => {
    try {
      await patch(`/ehr/connections/${conn.id}`, { isActive: conn.isActive === 1 ? 0 : 1 });
      message.success(`Connection ${conn.isActive === 1 ? 'paused' : 'activated'}`);
      void fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Toggle failed');
    }
  };

  const handleDelete = async (conn: EhrConnection) => {
    try {
      await del(`/ehr/connections/${conn.id}`);
      message.success('Connection deleted');
      setSelectedId(null);
      void fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      message.success('Webhook URL copied');
    } catch {
      message.warning('Copy failed — manually select and copy the URL');
    }
  };

  const logColumns: ColumnsType<IngestLog> = [
    {
      title: 'Time',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      width: 170,
      render: (v: string) => <Text type="secondary">{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</Text>,
    },
    {
      title: 'Resource',
      key: 'resource',
      render: (_: any, r) => (r.resourceType ? <Tag color="blue">{r.resourceType}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Resource ID',
      dataIndex: 'resourceId',
      key: 'resourceId',
      render: (v: string | null) => (v ? <Text code>{v}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => <StatusTag s={s} />,
    },
    {
      title: 'Order',
      dataIndex: 'mappedOrderId',
      key: 'mappedOrderId',
      width: 140,
      render: (v: string | null) => (v ? <Text code>{v.slice(0, 8)}</Text> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Error',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (v: string | null) => (v ? <Text type="danger">{v}</Text> : <Text type="secondary">—</Text>),
    },
  ];

  const summary = {
    total: list.length,
    active: list.filter((c) => c.isActive === 1).length,
    everySucceeded: list.filter((c) => c.lastSuccessAt).length,
  };

  return (
    <PageWrap>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            EHR Connections
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Multi-vendor FHIR ingest. Point Epic, Cerner, Meditech, Athena, Allscripts, eCW, or any
            generic FHIR R4 endpoint at a per-connection webhook URL and Curavend will create the
            order automatically.
          </Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New Connection
        </Button>
      </Space>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={8}><Card><Statistic title="Connections" value={summary.total} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Active" value={summary.active} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={8}><Card><Statistic title="Verified (ever succeeded)" value={summary.everySucceeded} /></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={9}>
          <Card title="Configured connections" loading={loading}>
            {list.length === 0 ? <Empty description="No connections yet" /> : list.map((conn) => (
              <Card
                key={conn.id}
                size="small"
                style={{
                  marginBottom: 10,
                  cursor: 'pointer',
                  borderColor: selectedId === conn.id ? '#1BAEE5' : undefined,
                  opacity: conn.isActive === 1 ? 1 : 0.6,
                }}
                onClick={() => setSelectedId(conn.id)}
              >
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text strong>{conn.name}</Text>
                    <VendorTag v={conn.vendor} />
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Auth: {conn.authMode.replace(/_/g, ' ')}
                    {conn.isActive === 0 && <Tag color="default" style={{ marginLeft: 8 }}>Paused</Tag>}
                  </Text>
                  {conn.lastSuccessAt && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Last success: {dayjs(conn.lastSuccessAt).format('YYYY-MM-DD HH:mm')}
                    </Text>
                  )}
                </Space>
              </Card>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={15}>
          {selected ? (
            <Card
              title={<Space><span>{selected.name}</span><VendorTag v={selected.vendor} /></Space>}
              extra={
                <Space>
                  <Tooltip title="Refresh logs">
                    <Button size="small" icon={<ReloadOutlined />} onClick={fetchLogs} />
                  </Tooltip>
                  <Button size="small" onClick={() => handleToggleActive(selected)}>
                    {selected.isActive === 1 ? 'Pause' : 'Activate'}
                  </Button>
                  <Button size="small" danger onClick={() => handleDelete(selected)}>
                    Delete
                  </Button>
                </Space>
              }
            >
              <Tabs
                defaultActiveKey="webhook"
                items={[
                  {
                    key: 'webhook',
                    label: (<><LinkOutlined /> Webhook</>),
                    children: (
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Alert
                          type="info"
                          showIcon
                          message="Point your EHR at this URL"
                          description="POST FHIR resources (ServiceRequest, MedicationRequest, etc.) here. Curavend verifies the X-Curavend-Webhook-Signature HMAC-SHA256 header, maps the payload using the connection's mapping profile, and creates a PENDING order."
                        />
                        <Input
                          value={webhookUrl}
                          readOnly
                          addonAfter={<Button type="text" icon={<CopyOutlined />} onClick={handleCopyWebhook}>Copy</Button>}
                          style={{ marginTop: 12 }}
                        />
                        <Card size="small" style={{ marginTop: 12 }} title="Auth setup">
                          <Space direction="vertical">
                            <Text>Auth mode: <Text strong>{selected.authMode}</Text></Text>
                            {selected.fhirBaseUrl && <Text>FHIR base: <Text code>{selected.fhirBaseUrl}</Text></Text>}
                            <Text type="secondary">Set the webhook secret as a Workers Secret with the name configured on the connection. Curavend reads it via env at request time so secrets never live in D1.</Text>
                          </Space>
                        </Card>
                      </Space>
                    ),
                  },
                  {
                    key: 'logs',
                    label: <><ApiOutlined /> Recent ingests ({logs.length})</>,
                    children: (
                      <Table<IngestLog>
                        rowKey="id"
                        size="small"
                        dataSource={logs}
                        columns={logColumns}
                        pagination={{ pageSize: 20 }}
                        locale={{ emptyText: 'No ingest activity yet. Point your EHR at the webhook URL.' }}
                      />
                    ),
                  },
                ]}
              />
              {selected.lastErrorAt && (
                <Alert
                  style={{ marginTop: 16 }}
                  type="error"
                  showIcon
                  message={`Last error at ${dayjs(selected.lastErrorAt).format('YYYY-MM-DD HH:mm')}`}
                  description={selected.lastErrorMessage}
                />
              )}
            </Card>
          ) : (
            <Card><Empty description="Select a connection on the left" /></Card>
          )}
        </Col>
      </Row>

      {/* Create drawer */}
      <Drawer
        open={createOpen}
        title="Add EHR Connection"
        onClose={() => { setCreateOpen(false); createForm.resetFields(); }}
        width={560}
        extra={
          <Space>
            <Button onClick={() => { setCreateOpen(false); createForm.resetFields(); }}>Cancel</Button>
            <Button type="primary" onClick={handleCreate}>Create</Button>
          </Space>
        }
      >
        <Form
          layout="vertical"
          form={createForm}
          initialValues={{ vendor: 'GENERIC_FHIR_R4', authMode: 'SHARED_SECRET', isActive: true }}
        >
          <Form.Item name="name" label="Connection Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Mass General — Cerner Sandbox" />
          </Form.Item>
          <Form.Item name="vendor" label="Vendor" rules={[{ required: true }]}>
            <Select>{EHR_VENDORS.map((v) => <Select.Option key={v} value={v}>{v.replace('_', ' ')}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="authMode" label="Auth Mode" rules={[{ required: true }]}>
            <Select>{AUTH_MODES.map((a) => <Select.Option key={a} value={a}>{a.replace(/_/g, ' ')}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="fhirBaseUrl" label="FHIR Base URL (optional)">
            <Input placeholder="https://fhir.example.com/r4" />
          </Form.Item>
          <Form.Item name="authClientId" label="Client ID (if OAuth2)">
            <Input />
          </Form.Item>
          <Form.Item name="authSecretEnvRef" label="Client Secret env var name">
            <Input placeholder="EHR_CONN_MGH_SECRET" />
          </Form.Item>
          <Form.Item name="apiKeyEnvRef" label="API Key env var name (if API_KEY)">
            <Input placeholder="EHR_CONN_ATHENA_KEY" />
          </Form.Item>
          <Form.Item name="sharedSecretEnvRef" label="Shared Secret env var name (if SHARED_SECRET)">
            <Input placeholder="EHR_CONN_X_SHARED" />
          </Form.Item>
          <Form.Item name="webhookSecretEnvRef" label="Webhook Signature Secret env var name">
            <Input placeholder="EHR_CONN_MGH_WEBHOOK" />
          </Form.Item>
          <Form.Item
            name="mappingProfile"
            label="Mapping Profile (JSON, optional)"
            tooltip="Override the vendor default. Leave empty to use Curavend's built-in mapping for the chosen vendor."
          >
            <Input.TextArea
              rows={6}
              placeholder='{ "patientName": "subject.display", "hcpcCode": "code.coding[0].code" }'
            />
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrap>
  );
};

export default EhrConnections;
