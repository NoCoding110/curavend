/**
 * Admin: General-ledger viewer.
 *
 * Filterable view of `gl_entries` with debit/credit pairs, source links,
 * "mark exported" batch action, and CSV download for ERP import.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Card, Col, Empty, InputNumber, Modal, Row, Select, Space, Table,
  Tag, Typography, message,
} from 'antd';
import {
  BookOutlined, DownloadOutlined, ReloadOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import apiClient, { get, post } from '../../../api/client';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const PERIODS = [
  'M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12',
  'Q1','Q2','Q3','Q4','ANNUAL',
];
const SOURCE_TYPES = [
  'PO_COMMIT', 'GR_RECEIPT', 'INVOICE_APPROVE', 'INVOICE_PAY', 'ADJUSTMENT',
];

interface GlEntry {
  id: string;
  transactionId: string;
  hospitalId: string;
  fiscalYear: number;
  fiscalPeriod: string;
  accountCode: string;
  costCenter: string | null;
  departmentId: string | null;
  debitUsd: number;
  creditUsd: number;
  sourceType: string;
  sourceId: string;
  memo: string | null;
  postedAt: string;
  exportedAt: string | null;
}

const GlLedgerPage: React.FC = () => {
  const [rows, setRows] = useState<GlEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<{
    fiscalYear: number;
    fiscalPeriod?: string;
    sourceType?: string;
    unexported: boolean;
  }>({
    fiscalYear: new Date().getFullYear(),
    unexported: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('fiscalYear', String(filter.fiscalYear));
      if (filter.fiscalPeriod) params.set('fiscalPeriod', filter.fiscalPeriod);
      if (filter.sourceType) params.set('sourceType', filter.sourceType);
      if (filter.unexported) params.set('unexported', '1');
      const r = await get<{ items: GlEntry[] }>(`/reporting/gl/entries?${params.toString()}`);
      setRows(r.items ?? []);
      setSelectedIds([]);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [filter.fiscalYear, filter.fiscalPeriod, filter.sourceType, filter.unexported]);

  const exportCsv = async () => {
    try {
      const params: Record<string, string> = { fiscalYear: String(filter.fiscalYear) };
      if (filter.fiscalPeriod) params.fiscalPeriod = filter.fiscalPeriod;
      if (filter.sourceType) params.sourceType = filter.sourceType;
      if (filter.unexported) params.unexported = '1';
      // Use the shared axios instance so the JWT interceptor attaches automatically.
      const res = await apiClient.get('/reporting/gl/export.csv', {
        params,
        responseType: 'blob',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(res.data);
      a.download = `gl-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      message.error('Download failed: ' + (err?.message ?? 'unknown'));
    }
  };

  const markExported = () => {
    if (selectedIds.length === 0) return;
    Modal.confirm({
      title: `Mark ${selectedIds.length} entries as exported?`,
      content: 'They will no longer appear in the "unexported" filter. Use this after a successful ERP import.',
      okText: 'Mark exported',
      onOk: async () => {
        try {
          const r = await post<{ updated: number }>('/reporting/gl/mark-exported', { ids: selectedIds });
          message.success(`${r.updated} entries marked`);
          await load();
        } catch (err: any) {
          message.error(err?.response?.data?.error ?? 'Failed');
        }
      },
    });
  };

  const totalDebit = rows.reduce((s, r) => s + r.debitUsd, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditUsd, 0);

  return (
    <PageWrap>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <Space><BookOutlined /> General Ledger</Space>
          </Title>
          <Text type="secondary">
            Append-only journal. Posts auto on PO commit, GR receipt, invoice approve, invoice pay.
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
            <Button icon={<DownloadOutlined />} onClick={exportCsv}>Export CSV</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={selectedIds.length === 0}
              onClick={markExported}
            >
              Mark exported ({selectedIds.length})
            </Button>
          </Space>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Space>
            <Text>FY:</Text>
            <InputNumber
              min={2020}
              max={2100}
              value={filter.fiscalYear}
              onChange={(v) => setFilter((f) => ({ ...f, fiscalYear: Number(v) || new Date().getFullYear() }))}
              style={{ width: 100 }}
            />
          </Space>
          <Select
            placeholder="All periods"
            allowClear
            style={{ width: 140 }}
            value={filter.fiscalPeriod}
            onChange={(v) => setFilter((f) => ({ ...f, fiscalPeriod: v }))}
            options={PERIODS.map((p) => ({ value: p, label: p }))}
          />
          <Select
            placeholder="All sources"
            allowClear
            style={{ width: 200 }}
            value={filter.sourceType}
            onChange={(v) => setFilter((f) => ({ ...f, sourceType: v }))}
            options={SOURCE_TYPES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
          />
          <Button
            type={filter.unexported ? 'primary' : 'default'}
            onClick={() => setFilter((f) => ({ ...f, unexported: !f.unexported }))}
          >
            {filter.unexported ? '✓ ' : ''}Unexported only
          </Button>
        </Space>
      </Card>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={`${rows.length} entries · debits $${totalDebit.toLocaleString()} · credits $${totalCredit.toLocaleString()}${totalDebit !== totalCredit ? ' ⚠ unbalanced' : ' ✓ balanced'}`}
      />

      <Card size="small">
        {rows.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No entries in this window" />
        ) : (
          <Table<GlEntry>
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={rows}
            pagination={{ pageSize: 100, showSizeChanger: true }}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys as string[]),
              getCheckboxProps: (r) => ({ disabled: !!r.exportedAt }),
            }}
            columns={[
              {
                title: 'Posted',
                dataIndex: 'postedAt',
                width: 170,
                render: (v) => new Date(v).toLocaleString(),
              },
              {
                title: 'Period',
                width: 90,
                render: (_, r) => `${r.fiscalYear}/${r.fiscalPeriod}`,
              },
              { title: 'Account', dataIndex: 'accountCode', width: 130, render: (v) => <Text code>{v}</Text> },
              { title: 'Cost ctr', dataIndex: 'costCenter', width: 110, render: (v) => v ?? '—' },
              {
                title: 'Debit',
                dataIndex: 'debitUsd',
                width: 110,
                align: 'right' as const,
                render: (v: number) => v > 0 ? <strong>${v.toLocaleString()}</strong> : '—',
              },
              {
                title: 'Credit',
                dataIndex: 'creditUsd',
                width: 110,
                align: 'right' as const,
                render: (v: number) => v > 0 ? <strong>${v.toLocaleString()}</strong> : '—',
              },
              { title: 'Source', dataIndex: 'sourceType', width: 150, render: (v) => <Tag>{v.replace('_', ' ')}</Tag> },
              {
                title: 'Source ID',
                dataIndex: 'sourceId',
                width: 110,
                render: (v: string) => <Text code style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text>,
              },
              { title: 'Memo', dataIndex: 'memo', ellipsis: true },
              {
                title: 'Exported',
                dataIndex: 'exportedAt',
                width: 130,
                render: (v) => v
                  ? <Tag color="green">{new Date(v).toLocaleDateString()}</Tag>
                  : <Tag>pending</Tag>,
              },
            ]}
          />
        )}
      </Card>
    </PageWrap>
  );
};

export default GlLedgerPage;
