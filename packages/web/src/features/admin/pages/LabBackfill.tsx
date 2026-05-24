/**
 * Admin: Historical lab consumption backfill.
 *
 * Walks lab_orders created in the lookback window that never produced any
 * lab_stock_movements (i.e., created BEFORE the auto-consume hook landed)
 * and applies `autoConsumeForLabOrder()` retroactively.
 *
 * Two-step UI:
 *   1. Dry-run (default) → table of candidate orders, NO writes.
 *   2. Commit → confirmation modal → POST commit=1 → per-order results.
 *
 * Idempotent because the API filters out orders that already have movements,
 * so re-running is safe.
 */
import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  InputNumber,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { post } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface DryRunCandidate {
  id: string;
  kit_site_id: string;
  lab_group_id: string;
  created_at: string;
}
interface DryRunResp {
  mode: 'dry-run';
  lookbackDays: number;
  candidateCount: number;
  candidates: DryRunCandidate[];
  message: string;
}
interface CommitResult {
  labOrderId: string;
  ok: boolean;
  attempted: number;
  fullyIssued: number;
  shortages: number;
  error?: string;
}
interface CommitResp {
  mode: 'commit';
  lookbackDays: number;
  processed: number;
  succeeded: number;
  failed: number;
  totalShortages: number;
  results: CommitResult[];
}

const LabBackfillPage: React.FC = () => {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResp | null>(null);
  const [commit, setCommit] = useState<CommitResp | null>(null);

  const runDryRun = async () => {
    setLoading(true);
    setCommit(null);
    try {
      const resp = await post<DryRunResp>(
        `/lab-inventory/backfill?days=${days}`,
        {},
      );
      setDryRun(resp);
      if (resp.candidateCount === 0) message.info('No backfill-eligible orders in window.');
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Dry-run failed');
    } finally {
      setLoading(false);
    }
  };

  const runCommit = () => {
    if (!dryRun || dryRun.candidateCount === 0) return;
    Modal.confirm({
      title: `Commit backfill for ${dryRun.candidateCount} order(s)?`,
      icon: <ThunderboltOutlined style={{ color: '#fa8c16' }} />,
      width: 540,
      content: (
        <Paragraph>
          This will issue inventory FEFO for each candidate lab order from the last{' '}
          <strong>{days}</strong> day(s). The operation is idempotent (orders with existing
          movements are skipped automatically) and append-only — no existing data will be modified.
          Shortages will be logged per order but won't block the run.
        </Paragraph>
      ),
      okText: 'Commit',
      okButtonProps: { type: 'primary', danger: false },
      cancelText: 'Cancel',
      onOk: async () => {
        setCommitting(true);
        try {
          const resp = await post<CommitResp>(
            `/lab-inventory/backfill?days=${days}&commit=1`,
            {},
          );
          setCommit(resp);
          message.success(
            `Backfill complete: ${resp.succeeded}/${resp.processed} succeeded, ` +
              `${resp.totalShortages} shortage line(s) logged.`,
          );
          // Refresh dry-run — successful orders should drop out of the candidate set.
          await runDryRun();
        } catch (err: any) {
          message.error(err?.response?.data?.error ?? 'Commit failed');
        } finally {
          setCommitting(false);
        }
      },
    });
  };

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space>
              <HistoryOutlined /> Lab Consumption Backfill
            </Space>
          </Title>
          <Text type="secondary">
            Retroactively apply FEFO consumption to lab orders that pre-date the auto-consume hook.
            Admin-only. Idempotent.
          </Text>
        </Col>
      </Row>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="How it works"
        description={
          <span>
            Step 1: pick a lookback window and run <strong>Dry-run</strong> to preview candidate
            orders. Step 2: review the list, then click <strong>Commit</strong> to apply consumption
            via the same FEFO path used by new orders. Already-consumed orders are silently
            excluded.
          </span>
        }
      />

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <Text strong>Lookback window:</Text>
          <InputNumber
            min={1}
            max={365}
            value={days}
            onChange={(v) => setDays(Number(v) || 30)}
            addonAfter="days"
            style={{ width: 140 }}
          />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={runDryRun}
            loading={loading}
          >
            Dry-run
          </Button>
          {dryRun && dryRun.candidateCount > 0 && (
            <Button
              danger
              icon={<ThunderboltOutlined />}
              onClick={runCommit}
              loading={committing}
            >
              Commit ({dryRun.candidateCount})
            </Button>
          )}
        </Space>
      </Card>

      {dryRun && (
        <Card size="small" title="Dry-run candidates" style={{ marginBottom: 12 }}>
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={6}>
              <Statistic title="Lookback (days)" value={dryRun.lookbackDays} />
            </Col>
            <Col span={6}>
              <Statistic title="Eligible orders" value={dryRun.candidateCount} />
            </Col>
            <Col span={12}>
              <Text type="secondary">{dryRun.message}</Text>
            </Col>
          </Row>
          {dryRun.candidates.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No orders to backfill in this window."
            />
          ) : (
            <Table<DryRunCandidate>
              size="small"
              rowKey="id"
              dataSource={dryRun.candidates}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              columns={[
                { title: 'Lab Order ID', dataIndex: 'id', ellipsis: true },
                { title: 'Kit Site', dataIndex: 'kit_site_id', ellipsis: true, width: 220 },
                { title: 'Lab Group', dataIndex: 'lab_group_id', ellipsis: true, width: 220 },
                {
                  title: 'Created',
                  dataIndex: 'created_at',
                  width: 180,
                  render: (v: string) => new Date(v).toLocaleString(),
                },
              ]}
            />
          )}
        </Card>
      )}

      {commit && (
        <Card
          size="small"
          title={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} /> Last commit results
            </Space>
          }
        >
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={6}>
              <Statistic title="Processed" value={commit.processed} />
            </Col>
            <Col span={6}>
              <Statistic
                title="Succeeded"
                value={commit.succeeded}
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Failed"
                value={commit.failed}
                valueStyle={{ color: commit.failed > 0 ? '#cf1322' : undefined }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Shortage lines"
                value={commit.totalShortages}
                valueStyle={{ color: commit.totalShortages > 0 ? '#fa8c16' : undefined }}
              />
            </Col>
          </Row>
          <Table<CommitResult>
            size="small"
            rowKey="labOrderId"
            dataSource={commit.results}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'Lab Order', dataIndex: 'labOrderId', ellipsis: true },
              {
                title: 'Status',
                dataIndex: 'ok',
                width: 90,
                render: (ok: boolean) =>
                  ok ? <Tag color="green">OK</Tag> : <Tag color="red">FAIL</Tag>,
              },
              { title: 'Attempted', dataIndex: 'attempted', width: 100, align: 'right' as const },
              {
                title: 'Fully issued',
                dataIndex: 'fullyIssued',
                width: 110,
                align: 'right' as const,
              },
              {
                title: 'Shortages',
                dataIndex: 'shortages',
                width: 100,
                align: 'right' as const,
                render: (v: number) =>
                  v > 0 ? <strong style={{ color: '#cf1322' }}>{v}</strong> : v,
              },
              { title: 'Error', dataIndex: 'error', ellipsis: true },
            ]}
          />
        </Card>
      )}
    </PageWrap>
  );
};

export default LabBackfillPage;
