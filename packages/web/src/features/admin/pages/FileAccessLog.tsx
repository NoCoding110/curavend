import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Table,
  Tag,
  Typography,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
} from 'antd';
import { ReloadOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import styled from 'styled-components';
import { adminApi, FileAccessLogRow, FileAccessLogQuery } from '../../../api/admin';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PageWrapper = styled.div`
  padding: 24px;
`;

/**
 * File Access Log — HIPAA §164.312(b) audit view.
 *
 * Lists every R2 file download (delivery proofs, contracts, invoices,
 * inventory manifests, order attachments). Restricted to ACCOUNT_MANAGER
 * via the backend rbac middleware on /admin/file-access-log.
 */
const FILE_KINDS = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'ORDER_ATTACHMENT', label: 'Order Attachment' },
  { value: 'INVENTORY_MANIFEST', label: 'Inventory Manifest' },
  { value: 'DELIVERY_PROOF', label: 'Delivery Proof' },
  { value: 'INVOICE_PDF', label: 'Invoice PDF' },
  { value: 'ORDER_PACKET', label: 'Order Packet' },
  { value: 'OTHER', label: 'Other' },
];

const KIND_COLORS: Record<string, string> = {
  CONTRACT: 'purple',
  ORDER_ATTACHMENT: 'blue',
  INVENTORY_MANIFEST: 'cyan',
  DELIVERY_PROOF: 'green',
  INVOICE_PDF: 'gold',
  ORDER_PACKET: 'magenta',
  OTHER: 'default',
};

interface FilterFormState {
  userId?: string;
  fileKind?: string;
  orderId?: string;
  hospitalId?: string;
  vendorId?: string;
  range?: [Dayjs, Dayjs];
}

const FileAccessLog: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FileAccessLogRow[]>([]);
  const [filters, setFilters] = useState<FilterFormState>({});
  const [form] = Form.useForm();

  const load = useCallback(async (f: FilterFormState) => {
    setLoading(true);
    try {
      const params: FileAccessLogQuery = {
        userId: f.userId || undefined,
        fileKind: f.fileKind || undefined,
        orderId: f.orderId || undefined,
        hospitalId: f.hospitalId || undefined,
        vendorId: f.vendorId || undefined,
        fromDate: f.range?.[0] ? f.range[0].toISOString() : undefined,
        toDate: f.range?.[1] ? f.range[1].toISOString() : undefined,
        limit: 200,
      };
      const data = await adminApi.fileAccessLog(params);
      setRows(data.items);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load file access log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load({}); }, [load]);

  const handleApply = () => {
    const values = form.getFieldsValue() as FilterFormState;
    setFilters(values);
    load(values);
  };

  const handleReset = () => {
    form.resetFields();
    setFilters({});
    load({});
  };

  const baseColumns = [
    {
      title: 'Accessed',
      dataIndex: 'accessedAt',
      width: 180,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '—',
      sorter: (a: FileAccessLogRow, b: FileAccessLogRow) =>
        a.accessedAt.localeCompare(b.accessedAt),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'User',
      dataIndex: 'userEmail',
      render: (v: string | null, r: FileAccessLogRow) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v ?? '—'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.userType ?? ''} · {r.userId.slice(0, 8)}…
          </Text>
        </div>
      ),
    },
    {
      title: 'Kind',
      dataIndex: 'fileKind',
      width: 160,
      render: (v: string | null) =>
        v ? <Tag color={KIND_COLORS[v] ?? 'default'}>{v}</Tag> : <Tag>UNKNOWN</Tag>,
    },
    {
      title: 'Entity',
      render: (_: any, r: FileAccessLogRow) => {
        if (r.orderId) return <Text code>order/{r.orderId.slice(0, 8)}…</Text>;
        if (r.contractId) return <Text code>contract/{r.contractId.slice(0, 8)}…</Text>;
        if (r.invoiceId) return <Text code>invoice/{r.invoiceId.slice(0, 8)}…</Text>;
        return <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Tenant',
      render: (_: any, r: FileAccessLogRow) => (
        <Space size={4} direction="vertical">
          {r.hospitalId && <Text type="secondary" style={{ fontSize: 12 }}>H: {r.hospitalId.slice(0, 8)}…</Text>}
          {r.vendorId && <Text type="secondary" style={{ fontSize: 12 }}>V: {r.vendorId.slice(0, 8)}…</Text>}
        </Space>
      ),
    },
    {
      title: 'File Key',
      dataIndex: 'fileKey',
      ellipsis: true,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Size',
      dataIndex: 'bytesServed',
      width: 90,
      render: (v: number | null) =>
        v == null ? '—' : v < 1024 ? `${v} B` : v < 1048576 ? `${(v / 1024).toFixed(1)} KB` : `${(v / 1048576).toFixed(1)} MB`,
    },
    {
      title: 'Status',
      dataIndex: 'httpStatus',
      width: 80,
      render: (v: number | null) => {
        if (v == null) return <Tag>—</Tag>;
        if (v >= 200 && v < 300) return <Tag color="green">{v}</Tag>;
        if (v >= 400) return <Tag color="red">{v}</Tag>;
        return <Tag>{v}</Tag>;
      },
    },
    { title: 'IP', dataIndex: 'ipAddress', width: 130 },
  ];

  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Title level={3}>File Access Log</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        HIPAA §164.312(b) — every R2 file download (contracts, attachments,
        delivery proofs, invoices, inventory manifests).
      </Text>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" onFinish={handleApply}>
          <Form.Item name="userId" style={{ marginBottom: 8 }}>
            <Input placeholder="User ID" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="fileKind" style={{ marginBottom: 8 }}>
            <Select placeholder="File kind" allowClear style={{ width: 200 }} options={FILE_KINDS} />
          </Form.Item>
          <Form.Item name="orderId" style={{ marginBottom: 8 }}>
            <Input placeholder="Order ID" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="hospitalId" style={{ marginBottom: 8 }}>
            <Input placeholder="Hospital ID" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="vendorId" style={{ marginBottom: 8 }}>
            <Input placeholder="Vendor ID" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item name="range" style={{ marginBottom: 8 }}>
            <RangePicker showTime />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<FilterOutlined />}>
                Filter
              </Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          components={tableComponents}
          size="small"
          scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 50, showSizeChanger: true }}
        />
      </Card>
    </PageWrapper>
  );
};

export default FileAccessLog;
