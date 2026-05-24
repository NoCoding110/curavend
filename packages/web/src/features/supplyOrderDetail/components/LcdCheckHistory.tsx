/**
 * Per-order LCD coverage check history.
 *
 * Pulls cached check results from /api/lcd/check-history/order/:orderId,
 * shows decision + citations + when + by whom. Auto-hidden if no checks
 * have ever been run for this order.
 */
import React, { useEffect, useState } from 'react';
import { Card, Empty, Space, Table, Tag, Typography, Tooltip } from 'antd';
import {
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { get } from '../../../api/client';

interface LcdCheck {
  id: string;
  orderId: string;
  hcpcCode: string;
  icd10List: string | null;
  decision: 'MEETS' | 'DOES_NOT_MEET' | 'NEEDS_CLINICAL_REVIEW' | 'UNKNOWN';
  citations: string | null;
  explanation: string | null;
  checkedAt: string;
  checkedByUserId: string | null;
}

const DECISION_COLOR: Record<string, string> = {
  MEETS: 'green',
  DOES_NOT_MEET: 'red',
  NEEDS_CLINICAL_REVIEW: 'orange',
  UNKNOWN: 'default',
};

const DECISION_ICON: Record<string, React.ReactNode> = {
  MEETS: <CheckCircleOutlined />,
  DOES_NOT_MEET: <CloseCircleOutlined />,
  NEEDS_CLINICAL_REVIEW: <ExclamationCircleOutlined />,
  UNKNOWN: <QuestionCircleOutlined />,
};

export const LcdCheckHistory: React.FC<{ orderId: string }> = ({ orderId }) => {
  const [rows, setRows] = useState<LcdCheck[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await get<{ items: LcdCheck[] }>(`/lcd/check-history/order/${orderId}`);
        if (!cancelled) setRows(r.items ?? []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (rows.length === 0 && !loading) {
    return null; // auto-hide if no checks
  }

  // Deduplicate by HCPC keeping most recent
  const seen = new Set<string>();
  const latestPerHcpc = rows.filter((r) => {
    if (seen.has(r.hcpcCode)) return false;
    seen.add(r.hcpcCode);
    return true;
  });

  return (
    <Card
      size="small"
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: '#1BAEE5' }} />
          <span>LCD Coverage Check History</span>
          <Tag>{rows.length} check{rows.length !== 1 ? 's' : ''}</Tag>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Most-recent check per HCPC. Run from the DME order wizard step 2 or via the LCD admin API.
      </Typography.Paragraph>
      <Table<LcdCheck>
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={latestPerHcpc}
        columns={[
          { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
          {
            title: 'Decision',
            dataIndex: 'decision',
            width: 220,
            render: (d: LcdCheck['decision']) => (
              <Tag color={DECISION_COLOR[d]} icon={DECISION_ICON[d]}>{d.replace('_', ' ')}</Tag>
            ),
          },
          {
            title: 'Explanation',
            dataIndex: 'explanation',
            ellipsis: true,
            render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: 'Citations',
            dataIndex: 'citations',
            width: 220,
            render: (v: string | null) => {
              if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
              let arr: string[] = [];
              try { arr = JSON.parse(v); } catch {}
              return (
                <Space size={4} wrap>
                  {arr.map((c, i) => <Tag key={i}>{c}</Tag>)}
                </Space>
              );
            },
          },
          {
            title: 'Checked',
            dataIndex: 'checkedAt',
            width: 150,
            render: (v: string) => (
              <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm')}>
                {dayjs(v).format('MMM D, h:mm A')}
              </Tooltip>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default LcdCheckHistory;
