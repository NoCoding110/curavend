/**
 * Recurrence plan detail — schedule overview, spawned children, projected
 * next 3 occurrences, plus status-gated action buttons.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Space,
  Button,
  Tag,
  Descriptions,
  Table,
  Spin,
  Empty,
  Modal,
  Input,
  DatePicker,
  message,
  Timeline,
  Popconfirm,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ForwardOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { orderRecurrenceApi, type OccurrenceListResponse, type RecurrenceStatus } from '../../../api/orderRecurrence';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px; max-width: 1200px; margin: 0 auto;`;

const STATUS_COLOR: Record<RecurrenceStatus, string> = {
  ACTIVE: 'green', PAUSED: 'gold', CANCELLED: 'default', COMPLETED: 'blue',
};

const OrderRecurrenceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<OccurrenceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pauseModal, setPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseUntil, setPauseUntil] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const resp = await orderRecurrenceApi.occurrences(id);
      setData(resp);
    } catch (err: any) {
      message.error(`Load failed: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handlePause = async () => {
    if (!id) return;
    try {
      await orderRecurrenceApi.pause(id, pauseReason || undefined, pauseUntil ? dayjs(pauseUntil).format('YYYY-MM-DD') : undefined);
      message.success('Paused');
      setPauseModal(false);
      setPauseReason('');
      setPauseUntil(null);
      await load();
    } catch (err: any) {
      message.error(`Pause failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleResume = async () => {
    if (!id) return;
    try { await orderRecurrenceApi.resume(id); message.success('Resumed'); await load(); }
    catch (err: any) { message.error(`Resume failed: ${err?.response?.data?.error ?? err.message}`); }
  };
  const handleCancel = async () => {
    if (!id) return;
    try { await orderRecurrenceApi.cancel(id); message.success('Cancelled'); await load(); }
    catch (err: any) { message.error(`Cancel failed: ${err?.response?.data?.error ?? err.message}`); }
  };
  const handleSkipNext = async () => {
    if (!id) return;
    try {
      const r = await orderRecurrenceApi.skipNext(id);
      message.success(`Next occurrence now ${r.nextOccurrenceDate ?? '(plan completed)'}`);
      await load();
    } catch (err: any) { message.error(`Skip failed: ${err?.response?.data?.error ?? err.message}`); }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;
  if (!data) return (
    <PageWrap>
      <Empty description="Plan not found" />
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button onClick={() => navigate('/recurrence')} icon={<ArrowLeftOutlined />}>Back to list</Button>
      </div>
    </PageWrap>
  );

  const plan = data.plan;
  const cadence = plan.frequencyUnit === 'CUSTOM'
    ? plan.customCronExpression ?? 'CUSTOM'
    : `every ${plan.frequencyValue} ${plan.frequencyUnit.toLowerCase()}`;
  const skipDates = plan.skipDates ? (() => { try { return JSON.parse(plan.skipDates) as string[]; } catch { return []; } })() : [];

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/recurrence')}>Back</Button>
            <Title level={3} style={{ margin: 0 }}>Recurring order — {cadence}</Title>
            <Tag color={STATUS_COLOR[plan.status]} style={{ fontWeight: 600 }}>{plan.status}</Tag>
            <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={load} /></Tooltip>
          </Space>
          <Space wrap style={{ marginTop: 8 }}>
            {plan.status === 'ACTIVE' && (
              <>
                <Button icon={<PauseCircleOutlined />} onClick={() => setPauseModal(true)}>Pause</Button>
                <Button icon={<ForwardOutlined />} onClick={handleSkipNext}>Skip next</Button>
                <Popconfirm title="Cancel this recurring schedule? Spawned orders are unaffected." onConfirm={handleCancel}>
                  <Button danger icon={<StopOutlined />}>Cancel</Button>
                </Popconfirm>
              </>
            )}
            {plan.status === 'PAUSED' && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleResume}>Resume</Button>
            )}
            <Button onClick={() => navigate(`/provider-orders/${plan.parentOrderId}`)}>View template order</Button>
          </Space>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions title="Schedule" column={2} bordered size="small">
          <Descriptions.Item label="Cadence">{cadence}</Descriptions.Item>
          <Descriptions.Item label="Anchor day">{plan.anchorDay ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Start">{plan.startDate}</Descriptions.Item>
          <Descriptions.Item label="End">{plan.endDate ?? <Text type="secondary">open-ended</Text>}</Descriptions.Item>
          <Descriptions.Item label="Total occurrences">{plan.totalOccurrences ?? <Text type="secondary">no cap</Text>}</Descriptions.Item>
          <Descriptions.Item label="Spawned so far">{plan.occurrencesSpawned}</Descriptions.Item>
          <Descriptions.Item label="Next occurrence">{plan.nextOccurrenceDate ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Lead time">{plan.leadTimeDays} day(s)</Descriptions.Item>
          <Descriptions.Item label="Reauth every">{plan.requireReauthEvery ?? <Text type="secondary">never</Text>}</Descriptions.Item>
          <Descriptions.Item label="Skip dates">{skipDates.length ? skipDates.join(', ') : <Text type="secondary">—</Text>}</Descriptions.Item>
          {plan.status === 'PAUSED' && (
            <>
              <Descriptions.Item label="Paused at">{plan.pausedAt ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Pause until">{plan.pauseUntil ?? <Text type="secondary">indefinite</Text>}</Descriptions.Item>
              <Descriptions.Item label="Pause reason" span={2}>{plan.pausedReason ?? '—'}</Descriptions.Item>
            </>
          )}
        </Descriptions>
      </Card>

      <Card style={{ marginBottom: 16 }} title={`Upcoming occurrences (next ${data.upcoming.length})`}>
        {data.upcoming.length === 0 ? (
          <Empty description="No upcoming occurrences" />
        ) : (
          <Timeline
            items={data.upcoming.map((d) => ({
              color: 'blue',
              children: <Text strong>{d}</Text>,
            }))}
          />
        )}
      </Card>

      <Card title={`Spawned orders (${data.spawned.length})`}>
        <Table
          dataSource={data.spawned}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            { title: 'Order #', dataIndex: 'identifier', render: (v, r: any) => <a onClick={() => navigate(`/provider-orders/${r.id}`)}>{v}</a> },
            { title: 'Occurrence', dataIndex: 'recurrenceIndex', width: 110 },
            { title: 'Status', dataIndex: 'status', width: 120 },
            { title: 'Substatus', dataIndex: 'orderSubStatus' },
            { title: 'Created', dataIndex: 'createdAt', width: 160, render: (v) => v ? dayjs(v).format('MM/DD/YYYY HH:mm') : '' },
          ]}
          locale={{ emptyText: 'No occurrences spawned yet.' }}
        />
      </Card>

      <Modal
        title="Pause schedule"
        open={pauseModal}
        onCancel={() => setPauseModal(false)}
        onOk={handlePause}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>The schedule will stop spawning new orders until resumed (or {pauseUntil ? 'after pause-until date' : 'manually resumed'}).</Text>
          <Input placeholder="Reason (optional)" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} />
          <DatePicker style={{ width: '100%' }} placeholder="Pause until (optional)" value={pauseUntil} onChange={setPauseUntil} />
        </Space>
      </Modal>
    </PageWrap>
  );
};

export default OrderRecurrenceDetail;
