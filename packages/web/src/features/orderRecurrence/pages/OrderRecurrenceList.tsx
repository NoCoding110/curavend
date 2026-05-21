/**
 * Recurrence plans list — paginated table of all plans for the caller's tenant.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Typography, Table, Tag, Space, Button, message, Tooltip } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { orderRecurrenceApi, type RecurrencePlan, type RecurrenceStatus } from '../../../api/orderRecurrence';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const STATUS_COLOR: Record<RecurrenceStatus, string> = {
  ACTIVE: 'green',
  PAUSED: 'gold',
  CANCELLED: 'default',
  COMPLETED: 'blue',
};

const cadenceLabel = (p: RecurrencePlan): string => {
  if (p.frequencyUnit === 'CUSTOM') return p.customCronExpression ?? 'CUSTOM';
  return `every ${p.frequencyValue} ${p.frequencyUnit.toLowerCase()}`;
};

const OrderRecurrenceList: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecurrencePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RecurrenceStatus | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await orderRecurrenceApi.list({ status: statusFilter });
      setItems(resp.items ?? []);
    } catch (err: any) {
      message.error(`Failed to load: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Recurring Orders</Title>
            <Text type="secondary">Scheduled recurring (requisition) orders</Text>
          </div>
          <Tooltip title="Refresh"><Button icon={<ReloadOutlined />} onClick={load} /></Tooltip>
        </Space>
      </Card>
      <Card>
        <Space wrap style={{ marginBottom: 12 }}>
          <Text type="secondary">Filter:</Text>
          {(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as RecurrenceStatus[]).map((s) => (
            <Tag.CheckableTag
              key={s}
              checked={statusFilter === s}
              onChange={(c) => setStatusFilter(c ? s : undefined)}
              style={{ border: '1px solid #e0e0e0' }}
            >
              {s}
            </Tag.CheckableTag>
          ))}
          {statusFilter && <Button size="small" onClick={() => setStatusFilter(undefined)}>Clear</Button>}
        </Space>
        <Table<RecurrencePlan>
          loading={loading}
          dataSource={items}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: 'Cadence', width: 180,
              render: (_, r) => <Text strong>{cadenceLabel(r)}</Text>,
            },
            {
              title: 'Status', dataIndex: 'status', width: 110,
              render: (s: RecurrenceStatus) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
            },
            {
              title: 'Start', dataIndex: 'startDate', width: 110,
              render: (v: string) => v ? dayjs(v).format('MM/DD/YYYY') : '—',
            },
            {
              title: 'End', dataIndex: 'endDate', width: 110,
              render: (v: string | null) => v ? dayjs(v).format('MM/DD/YYYY') : <Text type="secondary">open-ended</Text>,
            },
            {
              title: 'Next', dataIndex: 'nextOccurrenceDate', width: 110,
              render: (v: string | null) => v ? dayjs(v).format('MM/DD/YYYY') : <Text type="secondary">—</Text>,
            },
            {
              title: 'Spawned', dataIndex: 'occurrencesSpawned', width: 90, align: 'right',
              render: (n: number, r) => `${n}${r.totalOccurrences != null ? ` / ${r.totalOccurrences}` : ''}`,
            },
            { title: 'Lead', dataIndex: 'leadTimeDays', width: 70, align: 'right', render: (n) => `${n}d` },
            {
              title: '', width: 100,
              render: (_, r) => (
                <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/recurrence/${r.id}`)}>
                  View
                </Button>
              ),
            },
          ]}
          locale={{ emptyText: 'No recurring orders yet. Convert an existing order from its detail page to start a schedule.' }}
        />
      </Card>
    </PageWrap>
  );
};

export default OrderRecurrenceList;
