import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Typography,
  message,
  Tooltip,
  Drawer,
  Descriptions,
  Empty,
} from 'antd';
import {
  ReloadOutlined,
  StopOutlined,
  SendOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { workflowsApi, type WorkflowInstance } from '../../../api/workflows';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'blue',
  RUNNING: 'cyan',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'default',
  TERMINATED: 'red',
  WAITING_FOR_EVENT: 'gold',
};

const ACTIVE_STATUSES = new Set(['PENDING', 'RUNNING', 'WAITING_FOR_EVENT']);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TERMINATED']);

const WorkflowsAdmin: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkflowInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterEntity, setFilterEntity] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  // Modals
  const [startOpen, setStartOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState<WorkflowInstance | null>(null);
  const [eventOpen, setEventOpen] = useState<WorkflowInstance | null>(null);
  const [detailDrawer, setDetailDrawer] = useState<WorkflowInstance | null>(null);
  const [startForm] = Form.useForm();
  const [terminateForm] = Form.useForm();
  const [eventForm] = Form.useForm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await workflowsApi.list({
        type: filterType,
        status: filterStatus,
        entityId: filterEntity || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setRows(res.data);
      setTotal(res.total);
      setRegisteredTypes(res.registeredTypes);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus, page]);

  const handleStart = async (values: any) => {
    try {
      let ctx: any = undefined;
      if (values.context?.trim()) {
        try {
          ctx = JSON.parse(values.context);
        } catch {
          message.error('Context must be valid JSON');
          return;
        }
      }
      const result = await workflowsApi.start(values.workflowType, {
        entityType: values.entityType,
        entityId: values.entityId,
        context: ctx,
      });
      message.success(`Workflow started: ${result.instanceId.slice(0, 8)}…`);
      setStartOpen(false);
      startForm.resetFields();
      refresh();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to start workflow');
    }
  };

  const handleTerminate = async (values: any) => {
    if (!terminateOpen) return;
    try {
      await workflowsApi.terminate((terminateOpen.instanceId || terminateOpen.id) as string, values.reason);
      message.success('Workflow terminated');
      setTerminateOpen(null);
      terminateForm.resetFields();
      refresh();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Terminate failed');
    }
  };

  const handleRaiseEvent = async (values: any) => {
    if (!eventOpen) return;
    let payload: any = undefined;
    if (values.payload?.trim()) {
      try {
        payload = JSON.parse(values.payload);
      } catch {
        message.error('Payload must be valid JSON');
        return;
      }
    }
    try {
      const result = await workflowsApi.raiseEvent((eventOpen.instanceId || eventOpen.id) as string, values.eventName, payload);
      message.success(result.resumed ? 'Event raised — workflow resumed' : 'Event stored (workflow not waiting)');
      setEventOpen(null);
      eventForm.resetFields();
      refresh();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Raise event failed');
    }
  };

  const handlePurge = (row: WorkflowInstance) => {
    const id = (row.instanceId || row.id) as string;
    Modal.confirm({
      title: 'Purge workflow?',
      content: `This permanently deletes instance ${id.slice(0, 8)}… and all its activity log + events. This cannot be undone.`,
      okType: 'danger',
      onOk: async () => {
        try {
          const r = await workflowsApi.purge(id);
          message.success(`Purged: ${r.activityRowsDeleted} activities + ${r.eventRowsDeleted} events`);
          refresh();
        } catch (err: any) {
          message.error(err?.response?.data?.error || 'Purge failed');
        }
      },
    });
  };

  const openDetail = async (row: WorkflowInstance) => {
    try {
      const id = (row.instanceId || row.id) as string;
      const status = await workflowsApi.getStatus(id);
      setDetailDrawer(status);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load status');
    }
  };

  const ageOf = (createdAt: string) => {
    const ms = Date.now() - new Date(createdAt).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ${min % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  };

  const columns = useMemo(
    () => [
      {
        title: 'Instance',
        key: 'id',
        render: (_: any, r: WorkflowInstance) => {
          const id = (r.instanceId || r.id) ?? '';
          return (
            <Tooltip title={id}>
              <code style={{ fontSize: 11 }}>{id.slice(0, 8)}…</code>
            </Tooltip>
          );
        },
      },
      { title: 'Type', dataIndex: 'workflowType', key: 'workflowType' },
      {
        title: 'Entity',
        key: 'entity',
        render: (_: any, r: WorkflowInstance) =>
          r.entityType && r.entityId ? (
            <Tooltip title={`${r.entityType}:${r.entityId}`}>
              <code style={{ fontSize: 11 }}>{r.entityType}:{(r.entityId ?? '').slice(0, 8)}…</code>
            </Tooltip>
          ) : (
            '—'
          ),
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
      },
      {
        title: 'Step',
        key: 'step',
        render: (_: any, r: WorkflowInstance) => (
          <span>
            {r.stepIndex}/{r.totalSteps ?? '?'}
            {r.currentStep ? <Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>{r.currentStep}</Text> : null}
          </span>
        ),
      },
      {
        title: 'Age',
        key: 'age',
        render: (_: any, r: WorkflowInstance) => (
          <Tooltip title={dayjs(r.createdAt).format('YYYY-MM-DD HH:mm:ss')}>{ageOf(r.createdAt)}</Tooltip>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: any, r: WorkflowInstance) => (
          <Space size="small">
            <Tooltip title="View status">
              <Button type="text" icon={<EyeOutlined />} onClick={() => openDetail(r)} />
            </Tooltip>
            {ACTIVE_STATUSES.has(r.status) && (
              <Tooltip title="Terminate">
                <Button type="text" danger icon={<StopOutlined />} onClick={() => setTerminateOpen(r)} />
              </Tooltip>
            )}
            {r.status === 'WAITING_FOR_EVENT' || ACTIVE_STATUSES.has(r.status) ? (
              <Tooltip title="Raise event">
                <Button type="text" icon={<SendOutlined />} onClick={() => setEventOpen(r)} />
              </Tooltip>
            ) : null}
            {TERMINAL_STATUSES.has(r.status) && (
              <Tooltip title="Purge history">
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handlePurge(r)} />
              </Tooltip>
            )}
          </Space>
        ),
      },
    ],
    [],
  );

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Workflows</Title>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setStartOpen(true)}>
          Start Workflow
        </Button>
        <Button icon={<ReloadOutlined />} onClick={refresh}>Refresh</Button>
      </Space>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            placeholder="Filter by type"
            allowClear
            style={{ width: 240 }}
            value={filterType}
            onChange={(v) => { setFilterType(v); setPage(1); }}
            options={registeredTypes.map((t) => ({ value: t, label: t }))}
          />
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: 200 }}
            value={filterStatus}
            onChange={(v) => { setFilterStatus(v); setPage(1); }}
            options={[
              'PENDING','RUNNING','COMPLETED','FAILED','CANCELLED','TERMINATED','WAITING_FOR_EVENT',
            ].map((s) => ({ value: s, label: s }))}
          />
          <Input.Search
            placeholder="Filter by entityId"
            allowClear
            onSearch={(v) => { setFilterEntity(v); setPage(1); refresh(); }}
            style={{ width: 280 }}
          />
        </Space>
        <Table
          rowKey={(r) => (r.instanceId || r.id) as string}
          loading={loading}
          dataSource={rows}
          columns={columns as any}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: (t) => `Total ${t} workflows`,
          }}
        />
      </Card>

      {/* Start workflow modal */}
      <Modal
        title="Start a new workflow"
        open={startOpen}
        onCancel={() => setStartOpen(false)}
        onOk={() => startForm.submit()}
        okText="Start"
      >
        <Form form={startForm} layout="vertical" onFinish={handleStart}>
          <Form.Item label="Workflow type" name="workflowType" rules={[{ required: true }]}>
            <Select
              placeholder="Pick a registered workflow"
              options={registeredTypes.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>
          <Form.Item label="Entity type" name="entityType" rules={[{ required: true }]}>
            <Input placeholder="e.g. lab_order" />
          </Form.Item>
          <Form.Item label="Entity ID" name="entityId" rules={[{ required: true }]}>
            <Input placeholder="UUID of the entity this workflow runs against" />
          </Form.Item>
          <Form.Item
            label="Initial context (optional JSON)"
            name="context"
            tooltip="JSON object passed to the first step's execute() function."
          >
            <Input.TextArea rows={4} placeholder='{"labOrderId":"..."}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* Terminate modal */}
      <Modal
        title="Terminate workflow"
        open={!!terminateOpen}
        onCancel={() => setTerminateOpen(null)}
        onOk={() => terminateForm.submit()}
        okText="Terminate"
        okButtonProps={{ danger: true }}
      >
        <p>
          Instance <code>{((terminateOpen?.instanceId || terminateOpen?.id) ?? '').slice(0, 8)}…</code> (type{' '}
          <strong>{terminateOpen?.workflowType}</strong>) will be marked TERMINATED. Any in-flight step finishes
          naturally; subsequent steps will not run.
        </p>
        <Form form={terminateForm} layout="vertical" onFinish={handleTerminate}>
          <Form.Item
            label="Reason"
            name="reason"
            rules={[{ required: true, min: 3 }]}
          >
            <Input.TextArea rows={3} placeholder="Why are you terminating this?" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Raise event modal */}
      <Modal
        title="Raise external event"
        open={!!eventOpen}
        onCancel={() => setEventOpen(null)}
        onOk={() => eventForm.submit()}
        okText="Raise"
      >
        <p>
          Instance <code>{((eventOpen?.instanceId || eventOpen?.id) ?? '').slice(0, 8)}…</code>
          {eventOpen?.waitingForEvent ? (
            <> is waiting for <code>{eventOpen.waitingForEvent}</code></>
          ) : (
            <> — event will be stored. If the workflow later waits for this name, it will resume.</>
          )}
        </p>
        <Form form={eventForm} layout="vertical" onFinish={handleRaiseEvent}>
          <Form.Item
            label="Event name"
            name="eventName"
            rules={[{ required: true }]}
            initialValue={eventOpen?.waitingForEvent ?? ''}
          >
            <Input placeholder="e.g. HUMAN_APPROVAL" />
          </Form.Item>
          <Form.Item label="Payload (optional JSON, ≤16 KB)" name="payload">
            <Input.TextArea rows={4} placeholder='{"approver":"admin","decision":"go"}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        title={
          detailDrawer ? (
            <Space>
              <span>{detailDrawer.workflowType}</span>
              <Tag color={STATUS_COLOR[detailDrawer.status] ?? 'default'}>{detailDrawer.status}</Tag>
              <code style={{ fontSize: 11 }}>{((detailDrawer.instanceId || detailDrawer.id) ?? '').slice(0, 8)}…</code>
            </Space>
          ) : (
            'Workflow detail'
          )
        }
        open={!!detailDrawer}
        onClose={() => setDetailDrawer(null)}
        width={680}
      >
        {detailDrawer ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Entity">
                {detailDrawer.entityType ? `${detailDrawer.entityType}:${detailDrawer.entityId}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Step">
                {detailDrawer.stepIndex}/{detailDrawer.totalSteps} ({detailDrawer.currentStep ?? '—'})
              </Descriptions.Item>
              <Descriptions.Item label="Created">{dayjs(detailDrawer.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="Updated">{dayjs(detailDrawer.updatedAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              {detailDrawer.completedAt && (
                <Descriptions.Item label="Completed">{dayjs(detailDrawer.completedAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              )}
              {detailDrawer.waitingForEvent && (
                <Descriptions.Item label="Waiting for">
                  <code>{detailDrawer.waitingForEvent}</code>
                  {detailDrawer.eventWaitExpiresAt && (
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>
                      expires {dayjs(detailDrawer.eventWaitExpiresAt).format('HH:mm:ss')}
                    </Text>
                  )}
                </Descriptions.Item>
              )}
              {detailDrawer.terminateReason && (
                <Descriptions.Item label="Terminate reason">{detailDrawer.terminateReason}</Descriptions.Item>
              )}
              {detailDrawer.errorMessage && (
                <Descriptions.Item label="Error">
                  <span style={{ color: '#cf1322' }}>{detailDrawer.errorMessage}</span>
                </Descriptions.Item>
              )}
            </Descriptions>

            {detailDrawer.customStatus && (
              <Card size="small" type="inner" title="Custom status">
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detailDrawer.customStatus, null, 2)}
                </pre>
              </Card>
            )}

            <Card size="small" type="inner" title={`Activity log (${detailDrawer.activityLog?.length ?? 0})`}>
              {detailDrawer.activityLog && detailDrawer.activityLog.length > 0 ? (
                <Table
                  size="small"
                  rowKey={(r) => `${r.activityName}-${r.startedAt}`}
                  dataSource={detailDrawer.activityLog}
                  pagination={false}
                  columns={[
                    { title: 'Activity', dataIndex: 'activityName', key: 'a' },
                    { title: 'Status', dataIndex: 'status', key: 's', render: (v: string) => <Tag color={v === 'COMPLETED' ? 'green' : v === 'FAILED' ? 'red' : 'blue'}>{v}</Tag> },
                    { title: 'Duration', dataIndex: 'durationMs', key: 'd', render: (v: number | null) => v != null ? `${v} ms` : '—' },
                    { title: 'Started', dataIndex: 'startedAt', key: 'sa', render: (v: string) => dayjs(v).format('HH:mm:ss') },
                  ] as any}
                />
              ) : (
                <Empty description="No activity log yet" />
              )}
            </Card>

            {detailDrawer.context && (
              <Card size="small" type="inner" title="Context">
                <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detailDrawer.context, null, 2)}
                </pre>
              </Card>
            )}

            {detailDrawer.managementUrls && (
              <Card size="small" type="inner" title="Management URLs">
                <pre style={{ margin: 0, fontSize: 10, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(detailDrawer.managementUrls, null, 2)}
                </pre>
              </Card>
            )}
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
};

export default WorkflowsAdmin;
