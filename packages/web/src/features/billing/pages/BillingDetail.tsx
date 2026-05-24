import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  message,
  Spin,
  Alert,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  SendOutlined,
  DollarOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { invoicesApi } from '../../../api/invoices';
import { matchingApi, type ThreeWayMatch } from '../../../api/receiving';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';
import { usePermissions } from '../../../hooks/usePermissions';

const MATCH_COLOR: Record<string, string> = {
  PERFECT: 'green',
  QTY_VARIANCE: 'orange',
  PRICE_VARIANCE: 'red',
  NO_RECEIPT: 'gold',
  NO_PO: 'magenta',
  CONDITION_BAD: 'red',
  AMBIGUOUS: 'purple',
};

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

import {
  getInvoiceStatusDisplay,
  perspectiveFromUserType,
  type InvoiceStatus,
} from '../invoiceStatusDisplay';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

interface InvoiceItem {
  id: string;
  hcpcCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  spend: number | null;
}

interface Invoice {
  id: string;
  number: string;
  orderId: string;
  status: InvoiceStatus;
  total: number;
  hospital: string;
  vendor: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  items: InvoiceItem[];
  payment?: {
    payeeName: string;
    amountPaid: number;
    paymentDate: string;
    reference: string;
  };
}

const BillingDetail: React.FC = () => {
  const { orderId: id } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const userData = useSelector((state: RootState) => state.auth.userData);
  const { canRead: _canRead, canWrite: _canWrite } = usePermissions();
  const isVendor = userData?.userType === 'VENDOR';
  const isHospital = userData?.userType === 'HOSPITAL';
  const isAdmin = userData?.userType === 'ADMIN';
  const perspective = useMemo(
    () => perspectiveFromUserType(userData?.userType),
    [userData?.userType],
  );

  const [invoice, setInvoice] = useState<Invoice | null>(null);

  useBreadcrumbOverride(
    invoice
      ? [
          { title: 'Invoices', to: '/billing-orders' },
          { title: (invoice as any).number || (invoice as any).invoiceNumber || 'Invoice detail' },
        ]
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Confirm Spend modal
  const [confirmSpendOpen, setConfirmSpendOpen] = useState(false);
  const [confirmSpendForm] = Form.useForm();

  // Mark Paid modal
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidForm] = Form.useForm();

  // 3-way match state (Feature 12 integration)
  const [matches, setMatches] = useState<ThreeWayMatch[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const invoiceId = (invoice as any)?.id ?? null;
  const fetchMatches = useCallback(async () => {
    if (!invoiceId) return;
    try {
      const r = await matchingApi.forInvoice(invoiceId);
      setMatches(r.items ?? []);
    } catch { /* noop */ }
  }, [invoiceId]);
  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const runMatch = async () => {
    if (!invoiceId) return;
    setMatchLoading(true);
    try {
      const r = await matchingApi.run(invoiceId);
      const breakdown = Object.entries(r.byStatus).map(([k, v]) => `${k}=${v}`).join(' · ');
      message.success(`Matched ${r.total} lines. ${breakdown || ''}`);
      await fetchMatches();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to run match');
    } finally {
      setMatchLoading(false);
    }
  };

  const fetchInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await invoicesApi.get(id);
      const inv = data?.invoice ?? data?.data ?? data;

      const rawItems: any[] = inv.items ?? inv.lineItems ?? [];

      setInvoice({
        id: inv.id ?? inv._id,
        number: inv.number ?? inv.invoiceNumber ?? inv.id,
        orderId: inv.orderId ?? inv.order?.id ?? inv.supplyOrderId ?? '—',
        status: inv.status as InvoiceStatus,
        total: Number(inv.total ?? inv.totalAmount ?? 0),
        hospital: inv.hospitalName ?? inv.hospital?.name ?? inv.facilityName ?? inv.hospitalId ?? '—',
        vendor: inv.vendorName ?? inv.vendor?.name ?? inv.vendorId ?? '—',
        createdAt: inv.createdAt ?? '',
        updatedAt: inv.updatedAt ?? '',
        dueDate: inv.dueDate,
        items: rawItems.map((item: any) => ({
          id: item.id ?? item._id ?? String(Math.random()),
          hcpcCode: item.hcpcCode ?? item.code ?? item.productCode ?? '—',
          description: item.description ?? item.productName ?? '—',
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unitPrice ?? item.price ?? 0),
          spend: item.spend != null ? Number(item.spend) : null,
        })),
        payment:
          inv.payment ??
          (inv.payeeName
            ? {
                payeeName: inv.payeeName,
                amountPaid: Number(inv.amountPaid ?? 0),
                paymentDate: inv.paymentDate ?? '',
                reference: inv.paymentReference ?? inv.reference ?? '',
              }
            : undefined),
      });
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Failed to load invoice.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  // ── Confirm Spend ──────────────────────────────────────────────
  const handleConfirmSpend = async () => {
    if (!invoice) return;
    try {
      const values = await confirmSpendForm.validateFields();
      setActionLoading(true);

      // Build spends array from form values keyed by item id
      const spends = invoice.items.map((item) => ({
        itemId: item.id,
        spend: Number(values[`spend_${item.id}`] ?? 0),
      }));

      await invoicesApi.confirmSpend(invoice.id, { spends });
      message.success('Spend confirmed successfully.');
      setConfirmSpendOpen(false);
      confirmSpendForm.resetFields();
      fetchInvoice();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation error, don't close
      message.error(err?.response?.data?.message ?? 'Failed to confirm spend.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Generate Invoice ───────────────────────────────────────────
  const handleGenerate = async () => {
    if (!invoice) return;
    Modal.confirm({
      title: 'Generate Invoice',
      content: 'Are you sure you want to generate the invoice?',
      okText: 'Generate',
      onOk: async () => {
        setActionLoading(true);
        try {
          await invoicesApi.generate(invoice.id);
          message.success('Invoice generated successfully.');
          fetchInvoice();
        } catch (err: any) {
          message.error(err?.response?.data?.message ?? 'Failed to generate invoice.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // ── Send Invoice ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!invoice) return;
    Modal.confirm({
      title: 'Send Invoice',
      content: 'Are you sure you want to send the invoice?',
      okText: 'Send',
      onOk: async () => {
        setActionLoading(true);
        try {
          await invoicesApi.send(invoice.id);
          message.success('Invoice sent successfully.');
          fetchInvoice();
        } catch (err: any) {
          message.error(err?.response?.data?.message ?? 'Failed to send invoice.');
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  // ── Mark Paid ──────────────────────────────────────────────────
  const handleMarkPaid = async () => {
    if (!invoice) return;
    try {
      const values = await markPaidForm.validateFields();
      setActionLoading(true);

      const payload = {
        payeeName: values.payeeName,
        amountPaid: Number(values.amountPaid),
        paymentDate: values.paymentDate
          ? dayjs(values.paymentDate).format('YYYY-MM-DD')
          : undefined,
        reference: values.reference,
      };

      await invoicesApi.markPaid(invoice.id, payload);
      message.success('Invoice marked as paid.');
      setMarkPaidOpen(false);
      markPaidForm.resetFields();
      fetchInvoice();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message ?? 'Failed to mark invoice as paid.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Item columns ───────────────────────────────────────────────
  const baseColumns: ColumnsType<InvoiceItem> = [
    {
      title: 'HCPC Code',
      dataIndex: 'hcpcCode',
      key: 'hcpcCode',
      width: 120,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'center',
      width: 100,
    },
    {
      title: 'Unit Price',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      align: 'right',
      width: 130,
      render: (val: number) => `$${val.toFixed(2)}`,
    },
    {
      title: 'Spend',
      dataIndex: 'spend',
      key: 'spend',
      align: 'right',
      width: 130,
      render: (val: number | null) => (val != null ? `$${val.toFixed(2)}` : '—'),
    },
  ];
  const { columns: itemColumns, components: tableComponents } = useResizableColumns(baseColumns as any[]);

  const grandTotal = invoice?.total ?? 0;

  return (
    <PageWrapper>
      <Spin spinning={loading}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Header */}
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/billing-orders')}>
                  Back
                </Button>
                <Title level={3} style={{ margin: 0 }}>
                  Invoice {invoice?.number ?? id}
                </Title>
                {invoice && (() => {
                  const { label, color } = getInvoiceStatusDisplay(invoice.status, perspective);
                  return <Tag color={color}>{label}</Tag>;
                })()}
              </Space>
            </Col>

            <Col>
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchInvoice}
                  loading={loading}
                >
                  Refresh
                </Button>

                {/* Status-based action buttons — role gated */}

                {/* Hospital confirms the spend amounts after order completes */}
                {invoice?.status === 'ORDER_COMPLETED' && (isHospital || isAdmin) && (
                  <Button
                    icon={<CheckCircleOutlined />}
                    onClick={() => setConfirmSpendOpen(true)}
                    loading={actionLoading}
                  >
                    Confirm Spend
                  </Button>
                )}

                {/* Vendor generates the formal invoice once spend is confirmed */}
                {invoice?.status === 'SPEND_CONFIRMED' && (isVendor || isAdmin) && (
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={handleGenerate}
                    loading={actionLoading}
                  >
                    Generate Invoice
                  </Button>
                )}

                {/* Vendor sends the invoice to the hospital */}
                {invoice?.status === 'INVOICE_GENERATED' && (isVendor || isAdmin) && (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    loading={actionLoading}
                  >
                    Send Invoice to Hospital
                  </Button>
                )}

                {/* Hospital pays via Stripe Checkout */}
                {invoice?.status === 'INVOICE_SENT' && (isHospital || isAdmin) && (
                  <Button
                    type="primary"
                    icon={<DollarOutlined />}
                    onClick={async () => {
                      if (!invoice) return;
                      try {
                        const { url } = await invoicesApi.createCheckoutSession(invoice.id);
                        if (url) window.location.href = url;
                      } catch (err: any) {
                        message.error(`Stripe Checkout: ${err?.response?.data?.error ?? err.message}`);
                      }
                    }}
                  >
                    Pay with Stripe
                  </Button>
                )}

                {/* Hospital marks payment once received (manual) */}
                {invoice?.status === 'INVOICE_SENT' && (isHospital || isAdmin) && (
                  <Button
                    icon={<DollarOutlined />}
                    onClick={() => setMarkPaidOpen(true)}
                    loading={actionLoading}
                  >
                    Record manual payment
                  </Button>
                )}
              </Space>
            </Col>
          </Row>

          {/* Invoice Details */}
          <SectionCard title="Invoice Details">
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Invoice Number">
                    {invoice?.number ?? '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Order Reference">
                    {invoice?.orderId ?? '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Status">
                    {invoice && (() => {
                      const { label, color } = getInvoiceStatusDisplay(invoice.status, perspective);
                      return <Tag color={color}>{label}</Tag>;
                    })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="Subtotal">
                    ${(((invoice as any)?.subtotalCents ?? 0) / 100).toFixed(2)}
                  </Descriptions.Item>
                  <Descriptions.Item label="Tax">
                    ${(((invoice as any)?.taxTotalCents ?? 0) / 100).toFixed(2)}
                    {(invoice as any)?.taxEngineProvider ? (
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                        ({(invoice as any).taxEngineProvider})
                      </Text>
                    ) : null}
                  </Descriptions.Item>
                  {((invoice as any)?.shippingCents ?? 0) > 0 && (
                    <Descriptions.Item label="Shipping">
                      ${(((invoice as any).shippingCents ?? 0) / 100).toFixed(2)}
                    </Descriptions.Item>
                  )}
                  {((invoice as any)?.discountTotalCents ?? 0) > 0 && (
                    <Descriptions.Item label="Discount">
                      −${(((invoice as any).discountTotalCents ?? 0) / 100).toFixed(2)}
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="Grand Total">
                    <Text strong style={{ fontSize: 16 }}>
                      ${(((invoice as any)?.grandTotalCents != null
                        ? (invoice as any).grandTotalCents / 100
                        : grandTotal)).toFixed(2)}
                    </Text>
                    {(invoice as any)?.currencyCode ? (
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                        {(invoice as any).currencyCode}
                      </Text>
                    ) : null}
                  </Descriptions.Item>
                </Descriptions>
              </Col>
              <Col xs={24} md={12}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Hospital">
                    {invoice?.hospital ?? '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Vendor">{invoice?.vendor ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Created At">
                    {invoice?.createdAt ? dayjs(invoice.createdAt).format('YYYY-MM-DD HH:mm') : '—'}
                  </Descriptions.Item>
                  {invoice?.dueDate && (
                    <Descriptions.Item label="Due Date">
                      {dayjs(invoice.dueDate).format('YYYY-MM-DD')}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Col>
            </Row>
          </SectionCard>

          {/* Invoice Items */}
          <SectionCard title="Line Items">
            <Table
              columns={itemColumns}
              components={tableComponents}
              dataSource={invoice?.items ?? []}
              rowKey="id"
              pagination={false}
              size="small"
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4} align="right">
                    <Text strong style={{ fontSize: 15 }}>
                      Total
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong style={{ fontSize: 15 }}>
                      ${grandTotal.toFixed(2)}
                    </Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </SectionCard>

          {/* 3-Way Match (Feature 12) — visible only when user can read goods receipts */}
          {_canRead('goods-receipts') && (
          <SectionCard
            title={
              <Space>
                <CheckCircleOutlined style={{ color: '#1BAEE5' }} />
                3-Way Match
                {matches.length > 0 && <Tag>{matches.length} lines</Tag>}
              </Space>
            }
            extra={
              _canWrite('goods-receipts') ? (
                <Button
                  size="small"
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={matchLoading}
                  onClick={runMatch}
                  disabled={!invoiceId}
                >
                  {matches.length ? 'Re-run' : 'Run match'}
                </Button>
              ) : null
            }
          >
            {matches.length === 0 ? (
              <Text type="secondary">
                Click "Run match" to compare this invoice against the source PO + goods receipts.
                Tolerance: qty exact, price ±2%.
              </Text>
            ) : (
              <>
                <Space wrap style={{ marginBottom: 8 }}>
                  {Object.entries(
                    matches.reduce<Record<string, number>>((acc, m) => {
                      acc[m.matchStatus] = (acc[m.matchStatus] ?? 0) + 1;
                      return acc;
                    }, {}),
                  ).map(([s, n]) => (
                    <Tag key={s} color={MATCH_COLOR[s] ?? 'default'}>
                      {s}: {n}
                    </Tag>
                  ))}
                </Space>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={matches}
                  columns={[
                    { title: 'HCPC', dataIndex: 'hcpcCode', width: 90 },
                    {
                      title: 'Status',
                      dataIndex: 'matchStatus',
                      width: 140,
                      render: (s: string) => <Tag color={MATCH_COLOR[s] ?? 'default'}>{s}</Tag>,
                    },
                    {
                      title: 'Invoice',
                      children: [
                        { title: 'Qty', dataIndex: 'invoiceQuantity', width: 60 },
                        {
                          title: 'Unit $',
                          dataIndex: 'invoiceUnitPriceUsd',
                          width: 80,
                          render: (v: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`),
                        },
                      ],
                    },
                    {
                      title: 'Received',
                      dataIndex: 'receivedQuantity',
                      width: 90,
                      render: (v: number | null) => v ?? '—',
                    },
                    {
                      title: 'Qty var',
                      dataIndex: 'qtyVariance',
                      width: 80,
                      render: (v: number | null) => v ?? '—',
                    },
                    {
                      title: 'Price var %',
                      dataIndex: 'priceVariancePct',
                      width: 100,
                      render: (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`),
                    },
                    {
                      title: 'Resolution',
                      dataIndex: 'resolution',
                      width: 110,
                      render: (r: string | null) =>
                        r ? (
                          <Tag color={r === 'ACCEPTED' ? 'green' : r === 'DISPUTED' ? 'red' : 'blue'}>{r}</Tag>
                        ) : (
                          <Text type="secondary">Pending</Text>
                        ),
                    },
                  ]}
                />
                <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                  Resolve exceptions on the{' '}
                  <a onClick={() => navigate('/match-exceptions')}>Match Exceptions</a> page.
                </Text>
              </>
            )}
          </SectionCard>
          )}

          {/* Payment Details — only when INVOICE_PAID */}
          {invoice?.status === 'INVOICE_PAID' && invoice.payment && (
            <SectionCard title="Payment Details">
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Payee Name">
                  {invoice.payment.payeeName || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Amount Paid">
                  ${Number(invoice.payment.amountPaid).toFixed(2)}
                </Descriptions.Item>
                <Descriptions.Item label="Payment Date">
                  {invoice.payment.paymentDate
                    ? dayjs(invoice.payment.paymentDate).format('YYYY-MM-DD')
                    : '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Reference">
                  {invoice.payment.reference || '—'}
                </Descriptions.Item>
              </Descriptions>
            </SectionCard>
          )}
        </Space>
      </Spin>

      {/* ── Confirm Spend Modal ────────────────────────────────── */}
      <Modal
        title="Confirm Spend"
        open={confirmSpendOpen}
        onOk={handleConfirmSpend}
        onCancel={() => {
          setConfirmSpendOpen(false);
          confirmSpendForm.resetFields();
        }}
        okText="Confirm Spend"
        confirmLoading={actionLoading}
        width={600}
      >
        {invoice && (
          <>
            <Alert
              type="info"
              showIcon
              message="Enter the actual spend amount for each line item."
              style={{ marginBottom: 16 }}
            />
            <Form form={confirmSpendForm} layout="vertical">
              {invoice.items.map((item) => (
                <Form.Item
                  key={item.id}
                  name={`spend_${item.id}`}
                  label={`${item.hcpcCode} — ${item.description} (Unit: $${item.unitPrice.toFixed(2)} × ${item.quantity})`}
                  rules={[{ required: true, message: 'Please enter spend amount.' }]}
                  initialValue={item.spend ?? item.unitPrice * item.quantity}
                >
                  <InputNumber
                    min={0}
                    precision={2}
                    prefix="$"
                    style={{ width: '100%' }}
                    placeholder="Enter spend"
                  />
                </Form.Item>
              ))}
            </Form>
          </>
        )}
      </Modal>

      {/* ── Mark Paid Modal ────────────────────────────────────── */}
      <Modal
        title="Mark Invoice as Paid"
        open={markPaidOpen}
        onOk={handleMarkPaid}
        onCancel={() => {
          setMarkPaidOpen(false);
          markPaidForm.resetFields();
        }}
        okText="Mark as Paid"
        confirmLoading={actionLoading}
        width={500}
      >
        <Form form={markPaidForm} layout="vertical">
          <Form.Item
            name="payeeName"
            label="Payee Name"
            rules={[{ required: true, message: 'Please enter payee name.' }]}
          >
            <Input placeholder="Enter payee name" />
          </Form.Item>
          <Form.Item
            name="amountPaid"
            label="Amount Paid"
            rules={[{ required: true, message: 'Please enter amount paid.' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              prefix="$"
              style={{ width: '100%' }}
              placeholder="0.00"
            />
          </Form.Item>
          <Form.Item
            name="paymentDate"
            label="Payment Date"
            rules={[{ required: true, message: 'Please select payment date.' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reference"
            label="Payment Reference"
            rules={[{ required: false }]}
          >
            <Input placeholder="e.g. check number, transaction ID" />
          </Form.Item>
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default BillingDetail;
