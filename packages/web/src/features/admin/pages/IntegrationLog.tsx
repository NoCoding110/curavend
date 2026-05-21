/**
 * Admin: integration log viewer + retry + abort. Admin-only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Table,
  Tag,
  Space,
  Button,
  message,
  Select,
  Drawer,
  Descriptions,
  Alert,
  Popconfirm,
  Input,
} from 'antd';
import { ReloadOutlined, EyeOutlined, RedoOutlined, StopOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import {
  integrationsApi,
  type IntegrationLogEntry,
  type IntegrationStatus,
} from '../../../api/integrations';
import { useUserRoles } from '../../../hooks/useUserRoles';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const STATUS_COLOR: Record<IntegrationStatus, string> = {
  PENDING: 'blue',
  SUCCESS: 'green',
  RETRYING: 'gold',
  DEAD_LETTER: 'red',
  TERMINAL_FAILURE: 'volcano',
};

const IntegrationLog: React.FC = () => {
  const { isAdmin } = useUserRoles();
  const [items, setItems] = useState<IntegrationLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<IntegrationStatus | undefined>();
  const [connectorFilter, setConnectorFilter] = useState<string | undefined>();
  const [detailEntry, setDetailEntry] = useState<IntegrationLogEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await integrationsApi.log({
        status: statusFilter,
        connector: connectorFilter,
        limit: 100,
      });
      setItems(resp.items ?? []);
      setTotal(resp.total ?? 0);
    } catch (err: any) {
      message.error(`Load failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, connectorFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleRetry = async (id: string) => {
    try {
      await integrationsApi.retry(id);
      message.success('Marked for retry');
      await load();
    } catch (err: any) {
      message.error(`Retry failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  const handleAbort = async (id: string, reason?: string) => {
    try {
      await integrationsApi.abort(id, reason);
      message.success('Aborted');
      await load();
    } catch (err: any) {
      message.error(`Abort failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  if (!isAdmin) {
    return (
      <PageWrap>
        <Alert message="Admin only" description="Only admins can view the integration log." type="warning" />
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Integration Log</Title>
            <Text type="secondary">Outbound third-party HTTP calls — retry / abort dead-letters</Text>
          </div>
          <Button icon={<ReloadOutlined />} onClick={load} />
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>Status:</Text>
          <Select
            allowClear
            placeholder="Any"
            style={{ width: 180 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={['PENDING', 'SUCCESS', 'RETRYING', 'DEAD_LETTER', 'TERMINAL_FAILURE'].map((s) => ({ value: s, label: s }))}
          />
          <Text>Connector:</Text>
          <Select
            allowClear
            placeholder="Any"
            style={{ width: 180 }}
            value={connectorFilter}
            onChange={setConnectorFilter}
            options={['STRIPE', 'RESEND', 'FISHBOWL', 'NETSUITE', 'EPIC', 'TAXJAR', 'AVALARA', 'CARRIER', 'OTHER'].map((c) => ({ value: c, label: c }))}
          />
        </Space>
      </Card>

      <Card>
        <Table<IntegrationLogEntry>
          loading={loading}
          dataSource={items}
          rowKey="id"
          pagination={{ pageSize: 25, total }}
          columns={[
            {
              title: 'Connector', dataIndex: 'connectorType', width: 110,
              render: (v) => <Tag>{v}</Tag>,
            },
            { title: 'Entity', width: 140, render: (_, r) => `${r.entityType}:${r.entityId.slice(0, 8)}` },
            {
              title: 'Status', dataIndex: 'status', width: 130,
              render: (s: IntegrationStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
            },
            { title: 'Attempts', dataIndex: 'attemptCount', width: 80, align: 'right' },
            {
              title: 'Next retry', dataIndex: 'nextRetryAt', width: 160,
              render: (v) => v ? dayjs(v).format('MM/DD HH:mm') : <Text type="secondary">—</Text>,
            },
            {
              title: 'Last error', dataIndex: 'lastErrorMessage',
              render: (v) => v ? <Text ellipsis={{ tooltip: v }}>{v}</Text> : <Text type="secondary">—</Text>,
            },
            {
              title: 'Created', dataIndex: 'createdAt', width: 130,
              render: (v) => v ? dayjs(v).fromNow() : '',
            },
            {
              title: '', width: 180,
              render: (_, r) => (
                <Space size={4}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailEntry(r)} />
                  {(r.status === 'RETRYING' || r.status === 'DEAD_LETTER') && (
                    <Button size="small" icon={<RedoOutlined />} onClick={() => handleRetry(r.id)}>Retry</Button>
                  )}
                  {r.status === 'RETRYING' && (
                    <Popconfirm title="Mark as TERMINAL_FAILURE (no more retries)?" onConfirm={() => handleAbort(r.id, 'Aborted by admin')}>
                      <Button size="small" danger icon={<StopOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
          locale={{ emptyText: 'No integration calls logged.' }}
        />
      </Card>

      <Drawer
        title="Integration log entry"
        width={640}
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
      >
        {detailEntry && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="ID">{detailEntry.id}</Descriptions.Item>
              <Descriptions.Item label="Connector">{detailEntry.connectorType}</Descriptions.Item>
              <Descriptions.Item label="Entity">{detailEntry.entityType} / {detailEntry.entityId}</Descriptions.Item>
              <Descriptions.Item label="Direction">{detailEntry.direction}</Descriptions.Item>
              <Descriptions.Item label="HTTP">{detailEntry.httpMethod} {detailEntry.url}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={STATUS_COLOR[detailEntry.status]}>{detailEntry.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Attempts">{detailEntry.attemptCount}</Descriptions.Item>
              <Descriptions.Item label="Next retry">{detailEntry.nextRetryAt ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Last error">{detailEntry.lastErrorMessage ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Idempotency">{detailEntry.idempotencyKey ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Created">{detailEntry.createdAt}</Descriptions.Item>
              <Descriptions.Item label="Updated">{detailEntry.updatedAt}</Descriptions.Item>
            </Descriptions>
            {detailEntry.requestPayload && (
              <Card size="small" title="Request payload">
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto' }}>
                  {detailEntry.requestPayload}
                </pre>
              </Card>
            )}
            {detailEntry.responseBody && (
              <Card size="small" title={`Response (${detailEntry.responseStatus ?? '?'})`}>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflow: 'auto' }}>
                  {detailEntry.responseBody}
                </pre>
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </PageWrap>
  );
};

export default IntegrationLog;
