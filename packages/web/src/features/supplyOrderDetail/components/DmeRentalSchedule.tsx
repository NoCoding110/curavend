/**
 * Per-order DME rental period schedule.
 *
 * Shows the SCHEDULED / BILLED / TERMINATED periods. Admins can edit
 * monthly rate or notes inline; the daily billing cron walks SCHEDULED
 * periods whose end date has passed and converts them to invoices.
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Empty,
  Space,
  Table,
  Tag,
  Typography,
  message,
  InputNumber,
  Button,
} from 'antd';
import { CalendarOutlined, DollarOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { get, post, put } from '../../../api/client';

interface RentalPeriod {
  id: string;
  orderId: string;
  periodNumber: number;
  periodStart: string;
  periodEnd: string;
  monthlyRateUsd: number | null;
  invoiceId: string | null;
  status: 'SCHEDULED' | 'BILLED' | 'SKIPPED' | 'TERMINATED';
  notes: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'blue',
  BILLED: 'green',
  SKIPPED: 'default',
  TERMINATED: 'red',
};

export const DmeRentalSchedule: React.FC<{ orderId: string }> = ({ orderId }) => {
  const [rows, setRows] = useState<RentalPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await get<{ items: RentalPeriod[] }>(`/dme-rental-periods/order/${orderId}`);
      setRows(r.items ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const initialize = async () => {
    setBusy(true);
    try {
      const r = await post<{ created: number }>(`/dme-rental-periods/order/${orderId}/initialize`, { monthlyRateUsd: 0 });
      message.success(`Created ${r.created} rental period(s)`);
      void fetch();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const updateRate = async (id: string, rate: number) => {
    try {
      await put(`/dme-rental-periods/${id}`, { monthlyRateUsd: rate });
      void fetch();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  if (rows.length === 0 && !loading) {
    return null; // hide section entirely when no rental periods (typical for purchase orders)
  }

  const totalBilled = rows.filter((r) => r.status === 'BILLED').length;
  const totalScheduled = rows.filter((r) => r.status === 'SCHEDULED').length;

  return (
    <Card
      size="small"
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1BAEE5' }} />
          <span>DME Rental Schedule</span>
          {rows.length > 0 && (
            <>
              <Tag color="green">{totalBilled} billed</Tag>
              <Tag color="blue">{totalScheduled} scheduled</Tag>
            </>
          )}
        </Space>
      }
      extra={
        rows.length === 0 ? (
          <Button size="small" loading={busy} icon={<PlayCircleOutlined />} onClick={initialize}>
            Initialize periods
          </Button>
        ) : null
      }
      style={{ marginBottom: 16 }}
    >
      {rows.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description='No rental periods. Save the order with a non-purchase rentalType to auto-spawn.'
        />
      ) : (
        <Table<RentalPeriod>
          size="small"
          rowKey="id"
          loading={loading}
          pagination={false}
          dataSource={rows}
          columns={[
            { title: '#', dataIndex: 'periodNumber', width: 50 },
            { title: 'Start', dataIndex: 'periodStart', width: 110, render: (v) => dayjs(v).format('MMM D, YYYY') },
            { title: 'End', dataIndex: 'periodEnd', width: 110, render: (v) => dayjs(v).format('MMM D, YYYY') },
            {
              title: 'Monthly rate',
              dataIndex: 'monthlyRateUsd',
              width: 130,
              render: (v: number | null, r) =>
                r.status === 'SCHEDULED' ? (
                  <InputNumber
                    size="small"
                    min={0}
                    step={1}
                    value={v ?? 0}
                    onBlur={(e) => {
                      const val = Number((e.target as HTMLInputElement).value);
                      if (val !== v) updateRate(r.id, val);
                    }}
                    prefix={<DollarOutlined />}
                    style={{ width: '100%' }}
                  />
                ) : v == null ? (
                  <Typography.Text type="secondary">—</Typography.Text>
                ) : (
                  `$${v.toFixed(2)}`
                ),
            },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 110,
              render: (s) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
            },
            {
              title: 'Invoice',
              dataIndex: 'invoiceId',
              width: 200,
              render: (v: string | null) =>
                v ? (
                  <a href={`/billing-orders/${v}`} target="_blank" rel="noreferrer">
                    {v.slice(0, 8)}…
                  </a>
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
            { title: 'Notes', dataIndex: 'notes', ellipsis: true },
          ]}
        />
      )}
    </Card>
  );
};

export default DmeRentalSchedule;
