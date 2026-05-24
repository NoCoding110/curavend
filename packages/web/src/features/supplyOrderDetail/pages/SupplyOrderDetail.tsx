import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBreadcrumbOverride } from '../../../contexts/BreadcrumbContext';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Tag,
  Table,
  Descriptions,
  Timeline,
  Divider,
  Skeleton,
  message,
  Modal,
  Select,
  Input,
  Tooltip,
  Badge,
  Steps,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  MedicineBoxOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  InboxOutlined,
  UnorderedListOutlined,
  ClockCircleOutlined,
  FilePdfOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import { ordersApi } from '../../../api/orders';
import { get } from '../../../api/client';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';
import { useResizableColumns } from '../../../components/table/useResizableColumns';
import { usePermissions } from '../../../hooks/usePermissions';
import { DmeDocPacket } from '../components/DmeDocPacket';
import { DmeRentalSchedule } from '../components/DmeRentalSchedule';
import { LcdCheckHistory } from '../components/LcdCheckHistory';
import { BackordersPanel } from '../components/BackordersPanel';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const BRAND_COLOR = '#1BAEE5';

const PageWrapper = styled.div`
  padding: 24px;
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
`;

const ActionBar = styled(Space)`
  flex-wrap: wrap;
`;

// ── Status definitions ─────────────────────────────────────────────────────────

interface StatusConfig {
  color: string;
  label: string;
  step: number;
  badgeStatus: 'default' | 'processing' | 'success' | 'error' | 'warning';
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  NEW_ORDER: { color: 'gold', label: 'New Order', step: 0, badgeStatus: 'warning' },
  VENDOR_ASSIGNED: { color: 'blue', label: 'Vendor Assigned', step: 1, badgeStatus: 'processing' },
  VENDOR_CONFIRMED: { color: 'geekblue', label: 'Vendor Confirmed', step: 2, badgeStatus: 'processing' },
  VENDOR_DECLINED: { color: 'red', label: 'Vendor Declined', step: 1, badgeStatus: 'error' },
  DISPENSED: { color: 'purple', label: 'Dispensed', step: 3, badgeStatus: 'processing' },
  DELIVERED: { color: 'lime', label: 'Delivered', step: 4, badgeStatus: 'success' },
  SPEND_CONFIRMED: { color: 'cyan', label: 'Spend Confirmed', step: 5, badgeStatus: 'success' },
  COMPLETED: { color: 'green', label: 'Completed', step: 6, badgeStatus: 'success' },
  ORDER_COMPLETED: { color: 'green', label: 'Completed', step: 6, badgeStatus: 'success' },
  CANCELLED: { color: 'red', label: 'Cancelled', step: 0, badgeStatus: 'error' },
  FACILITY_CANCELLED: { color: 'red', label: 'Cancelled', step: 0, badgeStatus: 'error' },
};

const STATUS_STEPS = [
  { title: 'New Order' },
  { title: 'Vendor Assigned' },
  { title: 'Vendor Confirmed' },
  { title: 'Dispensed' },
  { title: 'Delivered' },
  { title: 'Spend Confirmed' },
  { title: 'Completed' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const getPatientName = (order: any): string => {
  if (order?.patient) {
    if (order.patient.name) return order.patient.name;
    const first = order.patient.firstName || '';
    const last = order.patient.lastName || '';
    if (first || last) return `${first} ${last}`.trim();
  }
  const first = order?.patientName || '';
  const last = order?.patientLastName || '';
  if (first || last) return `${first} ${last}`.trim();
  return '—';
};

const formatDate = (raw?: string): string => {
  if (!raw) return '—';
  return new Date(raw).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateShort = (raw?: string): string => {
  if (!raw) return '—';
  return new Date(raw).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatCurrency = (val?: number): string => {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

const getField = (obj: any, ...keys: string[]): string => {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null && obj?.[key] !== '') {
      return String(obj[key]);
    }
  }
  return '—';
};

// ── Main Component ─────────────────────────────────────────────────────────────

const SupplyOrderDetail: React.FC = () => {
  const { orderId, id } = useParams<{ orderId?: string; id?: string }>();
  const resolvedId = id || orderId || '';
  const navigate = useNavigate();
  const { canWrite: _canWrite } = usePermissions();
  const userData = useSelector((state: RootState) => state.auth.userData);
  const isVendor = userData?.userType === 'VENDOR';
  const isAdmin = userData?.userType === 'ADMIN';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useBreadcrumbOverride(
    order
      ? [
          { title: 'Orders', to: '/provider-orders' },
          { title: (order as any).identifier || (order as any).orderNumber || 'Order detail' },
        ]
      : null,
  );

  // Assign Vendor Modal
  const [assignVendorVisible, setAssignVendorVisible] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorList, setVendorList] = useState<any[]>([]);

  // Status Update Modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [shipments, setShipments] = useState<any[]>([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  // Goods Receipts against this order (Feature 11 integration)
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  // Source requisition info (Feature 8 integration)
  const [sourceReq, setSourceReq] = useState<{ id: string; requisitionNumber: string; title: string } | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!resolvedId) return;
    setLoading(true);
    try {
      const data = await ordersApi.get(resolvedId);
      setOrder(data?.data ?? data ?? null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load order details.');
    } finally {
      setLoading(false);
    }
  }, [resolvedId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Resolve the source requisition (if any) — only when order is loaded
  useEffect(() => {
    if (!order?.requisitionId) {
      setSourceReq(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const req = await get<{ id: string; requisitionNumber: string; title: string }>(
          `/requisitions/${order.requisitionId}`,
        );
        if (!cancelled) setSourceReq(req);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [order?.requisitionId]);

  // Fetch any goods receipts logged against this order
  const fetchReceipts = useCallback(async () => {
    if (!resolvedId) return;
    setReceiptsLoading(true);
    try {
      const resp = await get<{ items: any[] }>(`/goods-receipts?orderId=${resolvedId}`);
      setReceipts(resp?.items ?? []);
    } catch {
      setReceipts([]);
    } finally {
      setReceiptsLoading(false);
    }
  }, [resolvedId]);
  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  // Load shipments separately — they live in their own endpoint and may be added/updated independently of the order.
  const fetchShipments = useCallback(async () => {
    if (!resolvedId) return;
    setShipmentsLoading(true);
    try {
      const resp = await get<{ items: any[] }>(`/orders/${resolvedId}/shipments`);
      setShipments(resp?.items ?? []);
    } catch {
      // Non-fatal — shipments are an optional section. Don't surface a toast.
      setShipments([]);
    } finally {
      setShipmentsLoading(false);
    }
  }, [resolvedId]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // ── Action handlers ──────────────────────────────────────────────────────────

  const handleStatusUpdate = async (subStatus: string, reason?: string) => {
    setActionLoading(true);
    try {
      await ordersApi.updateStatus(resolvedId, { orderSubStatus: subStatus, reason });
      message.success('Order status updated successfully.');
      setStatusModalVisible(false);
      setStatusReason('');
      await fetchOrder();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to update order status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignVendor = async () => {
    if (!selectedVendorId) {
      message.warning('Please select a vendor.');
      return;
    }
    setActionLoading(true);
    try {
      await ordersApi.assignVendor(resolvedId, selectedVendorId);
      message.success('Vendor assigned successfully.');
      setAssignVendorVisible(false);
      setSelectedVendorId('');
      await fetchOrder();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to assign vendor.');
    } finally {
      setActionLoading(false);
    }
  };

  const openStatusModal = (status: string) => {
    setNextStatus(status);
    setStatusReason('');
    setStatusModalVisible(true);
  };

  const confirmStatusUpdate = () => {
    handleStatusUpdate(nextStatus, statusReason || undefined);
  };

  // ── Derived values ───────────────────────────────────────────────────────────

  const currentStatus: string = order?.orderSubStatus || order?.status || '';
  const statusCfg = STATUS_CONFIG[currentStatus];
  const currentStep = statusCfg?.step ?? 0;
  const isCancelled = currentStatus === 'CANCELLED';

  const orderItems: any[] = (order?.orderItems ?? order?.items ?? []).map(
    (item: any, idx: number) => ({ ...item, key: item.id ?? item._id ?? String(idx) }),
  );

  // API returns history under `orderHistory`; older shapes used `history` / `statusHistory` / `timeline`.
  const orderHistory: any[] = (
    order?.orderHistory ??
    order?.history ??
    order?.statusHistory ??
    order?.timeline ??
    []
  ).map((h: any, idx: number) => ({ ...h, key: idx }));

  // Sum item totals, skipping items with unknown unit price.
  const orderTotal = orderItems.reduce((acc: number, item: any) => {
    if (item.total !== undefined && item.total !== null) return acc + item.total;
    const unit = item.unitPrice ?? item.price;
    if (unit === undefined || unit === null) return acc;
    return acc + (item.quantity ?? 0) * unit;
  }, 0);
  // Track whether any item is missing pricing so the footer can show "—" instead of an artificially-low total.
  const orderTotalIsPartial = orderItems.some(
    (item: any) =>
      (item.total === undefined || item.total === null) &&
      (item.unitPrice ?? item.price) == null,
  );

  // ── Table columns ────────────────────────────────────────────────────────────

  const baseColumns: ColumnsType<any> = [
    {
      title: 'HCPC Code',
      key: 'hcpcCode',
      width: 120,
      render: (_: unknown, r: any) => getField(r, 'hcpcCode', 'code', 'itemCode'),
    },
    {
      title: 'Description',
      key: 'description',
      render: (_: unknown, r: any) => getField(r, 'description', 'name', 'itemName'),
    },
    {
      title: 'Qty',
      key: 'quantity',
      width: 80,
      align: 'center',
      render: (_: unknown, r: any) => getField(r, 'quantity', 'qty'),
    },
    {
      title: 'Unit Price',
      key: 'unitPrice',
      width: 120,
      align: 'right',
      render: (_: unknown, r: any) => formatCurrency(r.unitPrice ?? r.price),
    },
    {
      title: 'Total',
      key: 'total',
      width: 120,
      align: 'right',
      render: (_: unknown, r: any) => {
        // If we have an explicit total, use it.
        if (r.total !== undefined && r.total !== null) return formatCurrency(r.total);
        // Otherwise compute from qty * unitPrice — but only if unitPrice is known. If unit price is missing, show "—" to stay consistent with the Unit Price cell.
        const unit = r.unitPrice ?? r.price;
        if (unit === undefined || unit === null) return '—';
        return formatCurrency((r.quantity ?? 0) * unit);
      },
    },
  ];

  const { columns: itemColumns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderStatusTag = () => {
    if (!statusCfg) return <Tag>{currentStatus || 'Unknown'}</Tag>;
    return <Badge status={statusCfg.badgeStatus} text={<Text strong>{statusCfg.label}</Text>} />;
  };

  const renderActionButtons = () => {
    if (!order || isCancelled) return null;

    const buttons: React.ReactNode[] = [];

    if (currentStatus === 'NEW_ORDER') {
      buttons.push(
        <Button
          key="assign"
          type="primary"
          icon={<ShopOutlined />}
          style={{ background: BRAND_COLOR, borderColor: BRAND_COLOR }}
          onClick={async () => {
            setAssignVendorVisible(true);
            setVendorList([]);
            try {
              // Only show vendors that have an approved contract with this hospital
              const hospitalId = order?.hospital?.id ?? order?.hospitalId;
              const res = await get<any>('/hospital-vendors', {
                hospitalId,
                approvalStatus: 'APPROVED',
                limit: 200,
              });
              const rows: any[] = res?.items ?? res?.hospitalVendors ?? (Array.isArray(res) ? res : []);
              setVendorList(
                rows
                  .map((hv: any) => ({
                    id: hv.vendorId,
                    name: hv.vendorName ?? hv.vendor?.name ?? hv.vendorId,
                  }))
                  .filter((v: any) => v.id),
              );
            } catch { /* non-critical */ }
          }}
        >
          Assign Vendor
        </Button>,
      );
    }

    if (currentStatus === 'VENDOR_ASSIGNED' && (isVendor || isAdmin)) {
      buttons.push(
        <Button
          key="confirm"
          type="primary"
          icon={<CheckCircleOutlined />}
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
          onClick={() => openStatusModal('VENDOR_CONFIRMED')}
        >
          Confirm Receipt
        </Button>,
        <Button
          key="decline"
          danger
          icon={<CloseCircleOutlined />}
          onClick={() => openStatusModal('VENDOR_DECLINED')}
        >
          Decline
        </Button>,
      );
    }

    // Start / continue Encounter workflow — show at every stage between
    // vendor assignment and POD upload so the vendor always has a path back in.
    const encounterStages = [
      'VENDOR_ASSIGNED',
      'VENDOR_CONFIRMED',
      'VENDOR_CONFIRMED_RECEIPT',
      'PATIENT_VISITED_AND_ASSESSED',
      'DELIVERED',
      'PROOF_UPLOADED',
    ];
    if (isVendor && encounterStages.includes(currentStatus)) {
      const inProgress =
        currentStatus !== 'VENDOR_ASSIGNED' &&
        currentStatus !== 'VENDOR_CONFIRMED' &&
        currentStatus !== 'VENDOR_CONFIRMED_RECEIPT';
      buttons.push(
        <Button
          key="encounter"
          type="primary"
          icon={<MedicineBoxOutlined />}
          style={{ background: '#722ed1', borderColor: '#722ed1' }}
          onClick={() => navigate(`/encounter/${resolvedId}`)}
        >
          {inProgress ? 'Continue Encounter' : 'Start Encounter'}
        </Button>,
      );
    }

    if (currentStatus === 'VENDOR_CONFIRMED') {
      // Admins can still manually advance status (legacy flow)
      if (false) {
        // vendor button handled above
      } else if (isAdmin) {
        buttons.push(
          <Button
            key="dispense"
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => openStatusModal('DISPENSED')}
          >
            Mark Dispensed
          </Button>,
        );
      }
    }

    // Vendor can also open encounter from DISPENSED (if they used old flow)
    if (currentStatus === 'DISPENSED' && isVendor) {
      buttons.push(
        <Button
          key="encounter-dispensed"
          type="primary"
          icon={<MedicineBoxOutlined />}
          style={{ background: '#722ed1', borderColor: '#722ed1' }}
          onClick={() => navigate(`/encounter/${resolvedId}`)}
        >
          Open Encounter
        </Button>,
      );
    }

    if (currentStatus === 'DISPENSED' && (isVendor || isAdmin)) {
      buttons.push(
        <Button
          key="deliver"
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => openStatusModal('DELIVERED')}
        >
          Mark Delivered
        </Button>,
      );
    }

    if (currentStatus === 'DELIVERED' && !isVendor) {
      buttons.push(
        <Button
          key="confirmSpend"
          type="primary"
          onClick={() => openStatusModal('SPEND_CONFIRMED')}
        >
          Confirm Spend
        </Button>,
      );
    }

    if (currentStatus === 'SPEND_CONFIRMED' && isAdmin) {
      buttons.push(
        <Button
          key="complete"
          type="primary"
          icon={<CheckCircleOutlined />}
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
          onClick={() => openStatusModal('COMPLETED')}
        >
          Complete Order
        </Button>,
      );
    }

    if (!['COMPLETED', 'CANCELLED'].includes(currentStatus)) {
      buttons.push(
        <Tooltip key="cancel" title="Cancel this order">
          <Button
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => openStatusModal('CANCELLED')}
          >
            Cancel Order
          </Button>
        </Tooltip>,
      );
    }

    // View Encounter available on completed orders for admin/hospital
    if (currentStatus === 'COMPLETED' && !isVendor) {
      buttons.push(
        <Button
          key="view-encounter"
          icon={<MedicineBoxOutlined />}
          onClick={() => navigate(`/encounter/${resolvedId}`)}
        >
          View Encounter
        </Button>,
      );
    }

    // Consolidated packet — assembled on the server from every order attachment
    // (delivery proof, signed agreement, encounter doc, manifest) into one PDF.
    // Disabled when the order has no attachments at all.
    const hasAttachments = Boolean(
      order?.originalOrderAttachment ||
      order?.encounterAttachment ||
      order?.deliverySignAttachment ||
      (() => {
        try {
          const arr = JSON.parse(order?.attachments ?? 'null');
          return Array.isArray(arr) && arr.length > 0;
        } catch { return false; }
      })(),
    );
    buttons.push(
      <Button
        key="download-packet"
        icon={<FilePdfOutlined />}
        onClick={() => downloadOrderPacket()}
        disabled={!hasAttachments}
        title={!hasAttachments ? 'No attachments have been uploaded for this order yet' : 'Download all order documents as a single PDF'}
      >
        Download Packet (PDF)
      </Button>,
    );

    return <ActionBar>{buttons}</ActionBar>;
  };

  const downloadOrderPacket = async () => {
    try {
      const apiBase =
        (import.meta.env.VITE_API_URL as string | undefined) ??
        'https://curavend-api.metabilityllc1.workers.dev/api';
      const url = `${apiBase}/orders/${resolvedId}/packet.pdf`;
      // Pull the JWT from the Redux store so the fetch carries auth.
      const { store: rootStore } = await import('../../../store/store');
      const authToken = rootStore.getState().auth.token;

      const resp = await fetch(url, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        let msg = 'Failed to assemble packet';
        try {
          const parsed = text ? JSON.parse(text) : null;
          if (parsed?.error) msg = parsed.error;
        } catch { /* fall through */ }
        if (resp.status === 404) msg = 'This order has no attachments to assemble';
        message.error(msg);
        return;
      }

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `order-${order?.identifier ?? resolvedId.slice(0, 8)}-packet.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke after a brief delay to let the browser pick up the download
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      message.error(err?.message ?? 'Failed to download packet');
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageWrapper>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            Back
          </Button>
        </Space>
        <Skeleton active paragraph={{ rows: 4 }} style={{ marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 6 }} style={{ marginBottom: 16 }} />
        <Skeleton active paragraph={{ rows: 4 }} />
      </PageWrapper>
    );
  }

  if (!order) {
    return (
      <PageWrapper>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            Back
          </Button>
        </Space>
        <Card style={{ borderRadius: 12, textAlign: 'center', padding: 48 }}>
          <ExclamationCircleOutlined style={{ fontSize: 48, color: '#faad14' }} />
          <Title level={4} style={{ marginTop: 16 }}>
            Order not found
          </Title>
          <Text type="secondary">
            The order you are looking for does not exist or you do not have access to it.
          </Text>
        </Card>
      </PageWrapper>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  // Build patient object from flat API fields (API returns flat, not nested)
  const patient = order.patient ?? {
    dob: order.patientBirthDate,
    dateOfBirth: order.patientBirthDate,
    gender: order.patientGender,
    sex: order.patientGender,
    email: order.patientEmail,
    phone: order.patientPhone,
    address: order.patientAddress,
    insurance: order.insurance,
    insuranceName: order.insurance,
    memberId: order.insuranceId,
    insuranceMemberId: order.insuranceId,
  };
  const vendor = order.vendor ?? { name: order.vendorName };
  const hospital = order.hospital ?? { name: order.hospitalName };

  return (
    <PageWrapper>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Header */}
        <Row justify="space-between" align="middle">
          <Col>
            <Space align="center">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(-1)}
              >
                Back
              </Button>
              <Title level={3} style={{ margin: 0 }}>
                Order {order.identifier || resolvedId}
              </Title>
              {renderStatusTag()}
              {sourceReq && (
                <Tag color="purple" style={{ cursor: 'pointer' }} onClick={() => navigate('/requisitions')}>
                  From {sourceReq.requisitionNumber}
                </Tag>
              )}
            </Space>
          </Col>
          <Col>{renderActionButtons()}</Col>
        </Row>

        {/* Progress Steps */}
        {!isCancelled && (
          <SectionCard title="Order Progress">
            <Steps
              current={currentStep}
              items={STATUS_STEPS}
              size="small"
              style={{ overflowX: 'auto' }}
            />
          </SectionCard>
        )}

        {isCancelled && (
          <SectionCard>
            <Space>
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
              <Text strong style={{ color: '#ff4d4f' }}>
                This order has been cancelled.
              </Text>
              {(order.declineReason || order.cancellationReason) && (
                <Text type="secondary">Reason: {order.declineReason || order.cancellationReason}</Text>
              )}
            </Space>
          </SectionCard>
        )}

        {/* Patient & Order Info */}
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <SectionCard
              title={
                <Space>
                  <UserOutlined style={{ color: BRAND_COLOR }} />
                  Patient Information
                </Space>
              }
            >
              <Descriptions column={1} size="small" labelStyle={{ color: '#8c8c8c', width: 140 }}>
                <Descriptions.Item label="Name">
                  <Text strong>{getPatientName(order)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Date of Birth">
                  {formatDateShort(patient.dob ?? patient.dateOfBirth)}
                </Descriptions.Item>
                <Descriptions.Item label="Gender">
                  {getField(patient, 'gender', 'sex')}
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  {getField(patient, 'email')}
                </Descriptions.Item>
                <Descriptions.Item label="Phone">
                  {getField(patient, 'phone', 'phoneNumber', 'mobile')}
                </Descriptions.Item>
                <Descriptions.Item label="Address">
                  {getField(patient, 'address', 'addressLine1')}
                </Descriptions.Item>
                <Descriptions.Item label="Insurance">
                  {getField(patient, 'insuranceName', 'insurance')}
                </Descriptions.Item>
                <Descriptions.Item label="Member ID">
                  {getField(patient, 'memberId', 'insuranceMemberId')}
                </Descriptions.Item>
              </Descriptions>
            </SectionCard>
          </Col>

          <Col xs={24} lg={12}>
            <SectionCard
              title={
                <Space>
                  <MedicineBoxOutlined style={{ color: BRAND_COLOR }} />
                  Order Information
                </Space>
              }
            >
              <Descriptions column={1} size="small" labelStyle={{ color: '#8c8c8c', width: 140 }}>
                <Descriptions.Item label="ICD-10 Diagnosis">
                  {(() => {
                    const icd = getField(order, 'icd10', 'icd10Code', 'icdCode', 'diagnosisCode');
                    const dx = getField(order, 'diagnosis', 'primaryDiagnosis');
                    if (icd && icd !== '—') return icd;
                    if (dx && dx !== '—') return dx;
                    return '—';
                  })()}
                </Descriptions.Item>
                <Descriptions.Item label="Priority">
                  {order.priority ? (
                    <Tag color={
                      ({ URGENT: 'volcano', HIGH: 'red', STANDARD: 'blue', LOW: 'default' } as Record<string, string>)[
                        order.priority?.toUpperCase()
                      ] || 'default'
                    }>
                      {order.priority}
                    </Tag>
                  ) : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Vendor">
                  {typeof vendor === 'string' ? vendor : getField(vendor, 'name', 'companyName')}
                </Descriptions.Item>
                <Descriptions.Item label="Hospital">
                  {typeof hospital === 'string' ? hospital : getField(hospital, 'name')}
                </Descriptions.Item>
                <Descriptions.Item label="Ordering Physician">
                  {order.physicianDetail?.name
                    ? `${order.physicianDetail.name}${order.physicianDetail.npiNumber ? ` (NPI: ${order.physicianDetail.npiNumber})` : ''}`
                    : getField(order, 'requester', 'physician', 'orderingPhysician', 'physicianName', 'refProvider', 'ref_provider')}
                </Descriptions.Item>
                {(order.facilityDetail?.name || getField(order, 'facility', 'facilityNumber') !== '—') && (
                  <Descriptions.Item label="Facility">
                    {order.facilityDetail?.name
                      ? `${order.facilityDetail.name}${order.facilityDetail.number ? ` (${order.facilityDetail.number})` : ''}`
                      : getField(order, 'facility', 'facilityNumber')}
                  </Descriptions.Item>
                )}
                {(order.departmentDetail?.name || getField(order, 'department') !== '—') && (
                  <Descriptions.Item label="Department">
                    {order.departmentDetail?.name || getField(order, 'department')}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Order Date">
                  {formatDateShort(order.createdAt ?? order.orderDate)}
                </Descriptions.Item>
                <Descriptions.Item label="Last Updated">
                  {formatDate(order.updatedAt)}
                </Descriptions.Item>
                {order.comment && (
                  <Descriptions.Item label="Comments">
                    {order.comment}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </SectionCard>
          </Col>
        </Row>

        {/* Order Items */}
        <SectionCard
          title={
            <Space>
              <UnorderedListOutlined style={{ color: BRAND_COLOR }} />
              Order Items
            </Space>
          }
        >
          {orderItems.length === 0 ? (
            <Text type="secondary">No items found for this order.</Text>
          ) : (
            <Table
              columns={itemColumns}
              components={tableComponents}
              dataSource={orderItems}
              pagination={false}
              size="small"
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4} align="right">
                    <Text strong>Order Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong style={{ color: BRAND_COLOR }}>
                      {orderTotalIsPartial && orderTotal === 0 ? '—' : formatCurrency(orderTotal)}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          )}
        </SectionCard>

        {/* Shipments */}
        {(shipmentsLoading || shipments.length > 0) && (
          <SectionCard
            title={
              <Space>
                <InboxOutlined style={{ color: BRAND_COLOR }} />
                Shipments
              </Space>
            }
          >
            <Table
              dataSource={shipments.map((s: any, i: number) => ({ ...s, key: s.id ?? i }))}
              loading={shipmentsLoading}
              pagination={false}
              size="small"
              locale={{ emptyText: 'No shipments recorded yet.' }}
              columns={[
                {
                  title: '#',
                  dataIndex: 'shipmentSequence',
                  width: 60,
                  render: (v: number, _r: any, idx: number) => v ?? idx + 1,
                },
                {
                  title: 'Carrier',
                  dataIndex: 'carrierCode',
                  width: 100,
                  render: (v: string) => v || '—',
                },
                {
                  title: 'Tracking #',
                  dataIndex: 'trackingNumber',
                  render: (v: string, r: any) =>
                    v ? (
                      r.trackingUrl ? (
                        <a href={r.trackingUrl} target="_blank" rel="noreferrer">
                          {v}
                        </a>
                      ) : (
                        v
                      )
                    ) : (
                      '—'
                    ),
                },
                {
                  title: 'Shipped',
                  dataIndex: 'shippedAt',
                  width: 140,
                  render: (v: string) => formatDate(v),
                },
                {
                  title: 'Delivered',
                  dataIndex: 'deliveredAt',
                  width: 140,
                  render: (v: string) => formatDate(v),
                },
                {
                  title: 'Notes',
                  dataIndex: 'notes',
                  render: (v: string) =>
                    v ? <Text type="secondary">{v}</Text> : <Text type="secondary">—</Text>,
                },
              ]}
            />
          </SectionCard>
        )}

        {/* Order History Timeline */}
        {orderHistory.length > 0 && (
          <SectionCard
            title={
              <Space>
                <HistoryOutlined style={{ color: BRAND_COLOR }} />
                Order History
              </Space>
            }
          >
            <Timeline
              items={orderHistory.map((h: any) => {
                const status = h.status ?? h.orderSubStatus ?? h.event ?? '';
                const cfg = STATUS_CONFIG[status];
                return {
                  color: cfg?.color || 'gray',
                  dot: <ClockCircleOutlined style={{ fontSize: 14 }} />,
                  children: (
                    <div>
                      <Space>
                        {cfg ? (
                          <Badge status={cfg.badgeStatus} text={<Text strong>{cfg.label}</Text>} />
                        ) : (
                          <Text strong>{status || 'Event'}</Text>
                        )}
                      </Space>
                      {h.note && (
                        <div>
                          <Text type="secondary">{h.note}</Text>
                        </div>
                      )}
                      {h.reason && (
                        <div>
                          <Text type="secondary">Reason: {h.reason}</Text>
                        </div>
                      )}
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDate(h.createdAt ?? h.timestamp ?? h.date)}
                          {h.performedBy?.name && ` · ${h.performedBy.name}`}
                          {h.user?.name && ` · ${h.user.name}`}
                        </Text>
                      </div>
                    </div>
                  ),
                };
              })}
            />
          </SectionCard>
        )}
        {/* DME Document Packet (Session 13 — Feature 1) */}
        <DmeDocPacket orderId={resolvedId!} canEdit={true} />

        {/* LCD coverage history (auto-hides when no checks) */}
        <LcdCheckHistory orderId={resolvedId!} />

        {/* DME rental schedule (auto-hides when no periods) */}
        <DmeRentalSchedule orderId={resolvedId!} />

        {/* Backorders (auto-hides when none) */}
        <BackordersPanel orderId={resolvedId!} />

        {/* Goods Receipts (Feature 11) */}
        <SectionCard
          title={
            <Space>
              <InboxOutlined style={{ color: BRAND_COLOR }} />
              Goods Receipts
              {receipts.length > 0 && <Tag>{receipts.length}</Tag>}
            </Space>
          }
          extra={
            _canWrite('goods-receipts') ? (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/goods-receipts?orderId=${resolvedId}`)}
                style={{ background: BRAND_COLOR, borderColor: BRAND_COLOR }}
              >
                New Receipt
              </Button>
            ) : null
          }
        >
          {receipts.length === 0 ? (
            <Text type="secondary">
              {receiptsLoading ? 'Loading…' : 'No goods receipts logged yet. Click "New Receipt" to record what arrived.'}
            </Text>
          ) : (
            <Table
              dataSource={receipts.map((r) => ({ ...r, key: r.id }))}
              loading={receiptsLoading}
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'GRN #',
                  dataIndex: 'receiptNumber',
                  width: 160,
                  render: (v: string) => <strong>{v}</strong>,
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  width: 100,
                  render: (s: string) => (
                    <Tag color={s === 'POSTED' ? 'green' : s === 'CANCELLED' ? 'red' : 'default'}>{s}</Tag>
                  ),
                },
                {
                  title: 'Received',
                  dataIndex: 'receivedAt',
                  render: (v: string) => formatDate(v),
                },
                {
                  title: 'Carrier',
                  dataIndex: 'carrier',
                  width: 110,
                  render: (v: string | null) => v ?? '—',
                },
                {
                  title: 'Tracking',
                  dataIndex: 'trackingNumber',
                  width: 140,
                  render: (v: string | null) => v ?? '—',
                },
              ]}
            />
          )}
        </SectionCard>
      </Space>

      {/* Assign Vendor Modal */}
      <Modal
        title="Assign Vendor"
        open={assignVendorVisible}
        onCancel={() => {
          setAssignVendorVisible(false);
          setSelectedVendorId('');
        }}
        onOk={handleAssignVendor}
        okText="Assign"
        okButtonProps={{ loading: actionLoading, style: { background: BRAND_COLOR, borderColor: BRAND_COLOR } }}
        cancelButtonProps={{ disabled: actionLoading }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text>
            Choose from your hospital's contracted vendors. The order will advance to{' '}
            <strong>Vendor Assigned</strong> and the vendor will be notified to confirm receipt.
          </Text>
        </div>
        <Select
          placeholder="Search contracted vendors…"
          style={{ width: '100%' }}
          value={selectedVendorId || undefined}
          onChange={(val) => setSelectedVendorId(val)}
          showSearch
          optionFilterProp="label"
          notFoundContent={vendorList.length === 0 ? 'Loading…' : 'No approved vendors found for this hospital'}
          options={vendorList.map((v: any) => ({ label: v.name, value: v.id }))}
        />
        {vendorList.length === 0 && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            Loading contracted vendors…
          </Text>
        )}
      </Modal>

      {/* Status Update Modal */}
      <Modal
        title={`Confirm: ${STATUS_CONFIG[nextStatus]?.label || nextStatus}`}
        open={statusModalVisible}
        onCancel={() => {
          setStatusModalVisible(false);
          setStatusReason('');
        }}
        onOk={confirmStatusUpdate}
        okText="Confirm"
        okButtonProps={{
          loading: actionLoading,
          danger: nextStatus === 'CANCELLED',
          style: nextStatus !== 'CANCELLED'
            ? { background: BRAND_COLOR, borderColor: BRAND_COLOR }
            : undefined,
        }}
        cancelButtonProps={{ disabled: actionLoading }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            Are you sure you want to update this order to{' '}
            <Text strong>{STATUS_CONFIG[nextStatus]?.label || nextStatus}</Text>?
          </Text>
          {(nextStatus === 'VENDOR_DECLINED' || nextStatus === 'CANCELLED') && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <Text type="secondary">
                Please provide a reason {nextStatus === 'CANCELLED' ? '(required)' : '(optional)'}:
              </Text>
              <TextArea
                rows={3}
                placeholder="Enter reason..."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
              />
            </>
          )}
        </Space>
      </Modal>
    </PageWrapper>
  );
};

export default SupplyOrderDetail;
