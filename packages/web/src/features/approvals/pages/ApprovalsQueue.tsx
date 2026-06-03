import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Input,
  Select,
  message,
  Segmented,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  EyeOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import styled from 'styled-components';
import { approvalsApi, ApprovalQueueItem } from '../../../api/approvals';
import { get } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

/**
 * Approvals Queue — single triage view of items awaiting decision.
 *
 * Visible to:
 *   - HOSPITAL admins: orders needing vendor assignment / modification
 *   - VENDOR admins:   orders awaiting receipt confirmation
 *   - PROVIDER admins: their provider's hospital orders
 *   - ADMIN:           pending users + all orders
 *
 * Approve/reject delegate to the existing transition logic on the backend.
 */
const ENTITY_COLORS: Record<string, string> = {
  order: 'blue',
  user: 'purple',
  contract: 'cyan',
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  NEW_ORDER:                  { label: 'Needs vendor',          color: 'orange' },
  ORDER_REQUESTED_FOR_MODIFY: { label: 'Vendor requested mod',  color: 'gold' },
  VENDOR_ASSIGNED:            { label: 'Awaiting vendor confirm', color: 'cyan' },
  PENDING:                    { label: 'Account pending',        color: 'magenta' },
  // PENDING_APPROVAL is shared by orders (approval-rules engine) and contracts.
  // "Approval required" is intentionally generic to cover both entity types.
  PENDING_APPROVAL:           { label: 'Approval required',     color: 'gold' },
};

const ApprovalsQueue: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ApprovalQueueItem[]>([]);
  const [counts, setCounts] = useState<{ order: number; user: number; contract: number }>({ order: 0, user: 0, contract: 0 });
  const [filterType, setFilterType] = useState<'all' | 'order' | 'user' | 'contract'>('all');
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    item?: ApprovalQueueItem;
  }>({ open: false });
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  // Vendor picker modal — shown when approving a NEW_ORDER or a PENDING_APPROVAL order
  const [vendorModal, setVendorModal] = useState<{
    open: boolean;
    item?: ApprovalQueueItem;
  }>({ open: false });
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string | undefined>();
  const [vendorsLoading, setVendorsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await approvalsApi.queue({ type: filterType });
      setItems(data.items);
      setCounts({
        order: data.counts.order ?? 0,
        user: data.counts.user ?? 0,
        contract: data.counts.contract ?? 0,
      });
      setSelectedKeys([]);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load approvals queue');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => { load(); }, [load]);

  const openApprove = async (item: ApprovalQueueItem) => {
    // Contract approvals open the contract detail page where the reviewer can
    // approve / reject / request-changes with full context (line items, document).
    if (item.entityType === 'contract') {
      navigate(`/contracts/${item.entityId}`);
      return;
    }
    // Orders in NEW_ORDER or PENDING_APPROVAL need a vendor confirmed — show picker.
    // PENDING_APPROVAL means the order was routed through the approval-rules engine;
    // it may already have a vendorId (pre-selected in the wizard) but the approver
    // can confirm or change it. The backend throws a ValidationError if neither the
    // existing order.vendorId nor a vendorId from the request body is present.
    if (item.entityType === 'order' && (item.pendingState === 'NEW_ORDER' || item.pendingState === 'PENDING_APPROVAL')) {
      setSelectedVendorId(item.vendorId ?? undefined);
      setVendorModal({ open: true, item });
      // Fetch only this hospital's approved vendors so the manager
      // only sees vendors they have an active contract/relationship with.
      setVendorsLoading(true);
      setVendors([]);
      try {
        const res = await get<any>('/hospital-vendors', {
          hospitalId: item.hospitalId,
          approvalStatus: 'APPROVED',
          limit: 200,
        });
        const rows: any[] = res?.items ?? res?.hospitalVendors ?? (Array.isArray(res) ? res : []);
        setVendors(
          rows.map((hv: any) => ({
            id: hv.vendorId,
            name: hv.vendorName ?? hv.vendor?.name ?? hv.vendorId,
          })).filter((v) => v.id),
        );
      } catch {
        message.error('Failed to load contracted vendors');
      } finally {
        setVendorsLoading(false);
      }
      return;
    }
    // All other approvals (user accounts, VENDOR_ASSIGNED, etc.) — approve directly
    await approveOne(item);
  };

  const approveOne = async (item: ApprovalQueueItem, vendorId?: string) => {
    setActing(true);
    try {
      const body = vendorId ? { vendorId } : {};
      await approvalsApi.approve(item.entityType, item.entityId, body);
      message.success(`Approved ${item.entityType}`);
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Approval failed');
    } finally {
      setActing(false);
    }
  };

  const submitVendorApprove = async () => {
    if (!vendorModal.item) return;
    if (!selectedVendorId) {
      message.warning('Please select a vendor before approving');
      return;
    }
    setVendorModal({ open: false });
    await approveOne(vendorModal.item, selectedVendorId);
  };

  const openReject = (item: ApprovalQueueItem) => {
    setRejectModal({ open: true, item });
    setReason('');
  };

  const submitReject = async () => {
    if (!rejectModal.item) return;
    setActing(true);
    try {
      await approvalsApi.reject(rejectModal.item.entityType, rejectModal.item.entityId, reason || undefined);
      message.success(`Rejected ${rejectModal.item.entityType}`);
      setRejectModal({ open: false });
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Rejection failed');
    } finally {
      setActing(false);
    }
  };

  const bulkApprove = async () => {
    const selectedItems = items.filter((it) =>
      selectedKeys.includes(`${it.entityType}:${it.entityId}`),
    );
    if (selectedItems.length === 0) return;
    setActing(true);
    try {
      const result = await approvalsApi.bulkApprove(
        selectedItems.map((it) => ({ entityType: it.entityType, entityId: it.entityId })),
      );
      if (result.failed === 0) {
        message.success(`Approved ${result.succeeded} item${result.succeeded === 1 ? '' : 's'}`);
      } else {
        message.warning(`Approved ${result.succeeded}, ${result.failed} failed`);
      }
      await load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Bulk approval failed');
    } finally {
      setActing(false);
    }
  };

  const baseColumns = [
    {
      title: 'Type',
      dataIndex: 'entityType',
      width: 90,
      render: (v: string) => <Tag color={ENTITY_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: 'State',
      dataIndex: 'pendingState',
      width: 220,
      render: (v: string) => {
        const m = STATE_LABELS[v];
        return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{v}</Tag>;
      },
    },
    {
      title: 'Summary',
      dataIndex: 'summary',
      ellipsis: true,
    },
    {
      title: 'Age',
      dataIndex: 'ageDays',
      width: 110,
      render: (days: number, r: ApprovalQueueItem) => {
        const color = days >= 3 ? 'red' : days >= 1 ? 'orange' : 'green';
        const tooltip = dayjs(r.requestedAt).format('YYYY-MM-DD HH:mm');
        return (
          <Tag color={color} icon={<ClockCircleOutlined />} title={tooltip}>
            {days === 0 ? 'today' : `${days}d`}
          </Tag>
        );
      },
      sorter: (a: ApprovalQueueItem, b: ApprovalQueueItem) => a.ageDays - b.ageDays,
    },
    {
      title: 'Actions',
      width: 260,
      render: (_: any, r: ApprovalQueueItem) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => openApprove(r)}
            loading={acting}
          >
            Approve
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => openReject(r)}
            disabled={acting}
          >
            Reject
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(r.actionUrl)}
          >
            View
          </Button>
        </Space>
      ),
    },
  ];

  const { columns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  return (
    <PageWrapper>
      <Title level={3}>Approvals Queue</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Items awaiting your decision — sorted oldest first.
      </Text>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented
            value={filterType}
            onChange={(v) => setFilterType(v as typeof filterType)}
            options={[
              { label: `All (${counts.order + counts.user + (counts.contract ?? 0)})`, value: 'all' },
              { label: `Orders (${counts.order})`, value: 'order' },
              { label: `Users (${counts.user})`, value: 'user' },
              { label: `Contracts (${counts.contract ?? 0})`, value: 'contract' },
            ]}
          />
          <Button
            type="primary"
            disabled={selectedKeys.length === 0}
            onClick={bulkApprove}
            loading={acting}
          >
            Approve {selectedKeys.length} selected
          </Button>
          <Button onClick={load} icon={<ReloadOutlined />}>Refresh</Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey={(r: ApprovalQueueItem) => `${r.entityType}:${r.entityId}`}
          loading={loading}
          dataSource={items}
          columns={columns}
          components={tableComponents}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
          }}
          size="small"
          pagination={{ pageSize: 50 }}
        />
      </Card>

      <Modal
        open={rejectModal.open}
        title="Reject this item"
        onCancel={() => setRejectModal({ open: false })}
        onOk={submitReject}
        okButtonProps={{ danger: true, loading: acting }}
        okText="Reject"
      >
        <Text>Optional reason for the requester:</Text>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Why are you rejecting this?"
          style={{ marginTop: 8 }}
        />
      </Modal>

      {/* Vendor assignment modal — shown when approving a NEW_ORDER or PENDING_APPROVAL order */}
      <Modal
        open={vendorModal.open}
        title="Approve order — assign vendor"
        onCancel={() => setVendorModal({ open: false })}
        onOk={submitVendorApprove}
        okButtonProps={{ loading: acting, disabled: !selectedVendorId }}
        okText="Approve & Assign Vendor"
      >
        <Text style={{ display: 'block', marginBottom: 12 }}>
          Choose from your hospital's contracted vendors. The order will advance
          to <strong>Vendor Assigned</strong> and the vendor will be notified to confirm receipt.
        </Text>
        <Select
          style={{ width: '100%' }}
          placeholder={vendorsLoading ? 'Loading contracted vendors…' : 'Select a contracted vendor…'}
          loading={vendorsLoading}
          value={selectedVendorId}
          onChange={setSelectedVendorId}
          showSearch
          optionFilterProp="label"
          notFoundContent={vendorsLoading ? 'Loading…' : 'No approved vendors found for this hospital'}
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
        />
      </Modal>
    </PageWrapper>
  );
};

export default ApprovalsQueue;
