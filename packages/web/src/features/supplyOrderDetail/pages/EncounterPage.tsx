import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Row,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  Input,
  Timeline,
} from 'antd';
import SignatureCanvas from 'react-signature-canvas';
import dayjs from 'dayjs';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { encounterApi } from '../../../api/encounter';
import { ordersApi } from '../../../api/orders';
import { uploadFile } from '../../../api/client';
import type { ColumnsType } from 'antd/es/table';
import { useResizableColumns } from '../../../components/table/useResizableColumns';
import { UnifiedAddItemModal } from '../components/UnifiedAddItemModal';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
`;

const StatusBar = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

const BRAND = '#1BAEE5';

interface EncounterItem {
  id: string;
  code: string;
  hcpc_code?: string;
  hcpcCode?: string;
  description: string;
  quantity: number;
  lot_number?: string | null;
  lotNumber?: string | null;
  medicare_fee?: number | null;
  medicareFee?: number | null;
  unit_price?: number | null;
  unitPrice?: number | null;
  is_bundle?: number;
  isBundle?: number;
  bundle_parent_id?: string | null;
  bundleParentId?: string | null;
  item_type?: string;
  itemType?: string;
}

const EncounterPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [encounter, setEncounter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'ASSESSMENT' | 'DELIVERY'>('ASSESSMENT');
  const [activeTabKey, setActiveTabKey] = useState<string>('assessment');

  // POD capture state (Delivery tab)
  const [podReceiver, setPodReceiver] = useState('');
  const [podGuarantor, setPodGuarantor] = useState('');
  const [podDeliveredAt, setPodDeliveredAt] = useState<dayjs.Dayjs | null>(dayjs());
  const [podSaving, setPodSaving] = useState(false);
  const signatureRef = useRef<any>(null);

  const podCardRef = useRef<HTMLDivElement | null>(null);

  const fetchAll = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [o, e] = await Promise.all([ordersApi.get(orderId), encounterApi.get(orderId)]);
      setOrder(o);
      setEncounter(e);
      // Pre-fill POD meta from server
      if (e?.pod) {
        if (e.pod.deliveredBy || e.pod.deliveryAcceptedBy) setPodReceiver(e.pod.deliveredBy || e.pod.deliveryAcceptedBy);
        if (e.pod.deliveryGuarantorName) setPodGuarantor(e.pod.deliveryGuarantorName);
        if (e.pod.deliveryDateTime) setPodDeliveredAt(dayjs(e.pod.deliveryDateTime));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to load encounter');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);


  const handleDelete = async (itemId: string, section: 'ASSESSMENT' | 'DELIVERY') => {
    if (!orderId) return;
    try {
      await encounterApi.deleteItem(orderId, section, itemId);
      message.success('Removed');
      await fetchAll();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to delete');
    }
  };

  const handleConfirm = async (section: 'ASSESSMENT' | 'DELIVERY') => {
    if (!orderId) return;
    try {
      await encounterApi.confirmSection(orderId, section);
      await fetchAll();
      if (section === 'ASSESSMENT') {
        message.success('Assessment confirmed — continue to Delivery');
        setActiveTabKey('delivery');
      } else {
        message.success('Delivery confirmed — capture proof of delivery');
        // Scroll to POD card on next paint
        setTimeout(() => {
          podCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to confirm');
    }
  };

  const buildPodMeta = () => ({
    deliveredBy: podReceiver || undefined,
    deliveryAcceptedBy: podReceiver || undefined,
    deliveryGuarantorName: podGuarantor || undefined,
    deliveryDateTime: podDeliveredAt ? podDeliveredAt.toISOString() : undefined,
  });

  const handlePodUpload = async (file: File) => {
    if (!orderId) return false;
    try {
      const uploadRes = await uploadFile('/uploads', file);
      await encounterApi.uploadPod(orderId, { fileKey: uploadRes.key, ...buildPodMeta() });
      message.success('POD uploaded');
      await fetchAll();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Upload failed');
    }
    return false;
  };

  const handleSaveSignature = async () => {
    if (!orderId) return;
    const pad = signatureRef.current;
    if (!pad || pad.isEmpty?.()) {
      message.error('Please draw the receiver signature before saving');
      return;
    }
    if (!podReceiver.trim()) {
      message.error('Receiver name is required alongside the signature');
      return;
    }
    setPodSaving(true);
    try {
      const dataUrl = pad.getTrimmedCanvas().toDataURL('image/png');
      await encounterApi.uploadPod(orderId, { signatureDataUrl: dataUrl, ...buildPodMeta() });
      message.success('Signature saved');
      await fetchAll();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Save failed');
    } finally {
      setPodSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!orderId) return;
    setSubmitting(true);
    try {
      await encounterApi.submit(orderId);
      message.success('Encounter submitted — order complete');
      navigate(`/provider-orders/${orderId}`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async () => {
    if (!orderId) return;
    try {
      const data = await encounterApi.pdfData(orderId);
      const [{ default: jsPDF }] = await Promise.all([import('jspdf')]);
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Encounter: ${data.order.identifier}`, 14, 20);
      doc.setFontSize(10);
      doc.text(`Patient: ${data.order.patientName}`, 14, 30);
      doc.text(`Diagnosis: ${data.order.diagnosis ?? '-'}`, 14, 36);
      doc.text(`ICD-10: ${data.order.icd10 ?? '-'}`, 14, 42);
      doc.text(`Submitted: ${data.order.encounterSubmittedAt ?? 'Pending'}`, 14, 48);

      let y = 58;
      const writeSection = (title: string, items: any[]) => {
        doc.setFontSize(12);
        doc.text(title, 14, y);
        y += 6;
        doc.setFontSize(9);
        doc.text('HCPCS        Description            Qty    Fee', 14, y);
        y += 5;
        for (const it of items) {
          const line = `${it.hcpc_code ?? it.code}   ${(it.description ?? '').slice(0, 30)}   ${it.quantity}   $${it.medicare_fee ?? 0}`;
          doc.text(line, 14, y);
          y += 5;
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
        }
        y += 4;
      };
      writeSection('Assessment', data.assessment);
      writeSection('Delivery', data.delivery);

      if (data.pod?.signatureDataUrl) {
        if (y > 220) {
          doc.addPage();
          y = 20;
        }
        doc.text('Signature:', 14, y);
        try {
          doc.addImage(data.pod.signatureDataUrl, 'PNG', 14, y + 2, 80, 30);
        } catch { /* empty */ }
      }

      doc.save(`encounter-${data.order.identifier}.pdf`);
    } catch (err: any) {
      message.error('PDF generation failed');
    }
  };

  // --- Columns ------------------------------------------------------------
  const makeCols = (section: 'ASSESSMENT' | 'DELIVERY'): ColumnsType<EncounterItem> => [
    {
      title: 'Origin',
      dataIndex: 'added_by',
      render: (_: any, r: any) => {
        const origin = r.added_by ?? r.addedBy ?? 'HOSPITAL';
        return origin === 'VENDOR'
          ? <Tag color="blue">Vendor Added</Tag>
          : <Tag color="green">Hospital Requested</Tag>;
      },
    },
    {
      title: 'Type',
      dataIndex: 'item_type',
      render: (v: string, r: any) => <Tag color={(r.item_type ?? r.itemType) === 'LOT' ? 'purple' : 'blue'}>{r.item_type ?? r.itemType ?? 'NON_LOT'}</Tag>,
    },
    { title: 'HCPCS', dataIndex: 'hcpc_code', render: (v, r: any) => r.hcpc_code ?? r.hcpcCode ?? r.code },
    { title: 'Lot #', dataIndex: 'lot_number', render: (v, r: any) => r.lot_number ?? r.lotNumber ?? '-' },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      render: (v, r: any) => (
        <InputNumber
          size="small"
          min={1}
          value={r.quantity ?? 1}
          onBlur={async (e: any) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val !== r.quantity) {
              await encounterApi.updateItem(orderId!, section, r.id, { quantity: val });
              await fetchAll();
            }
          }}
        />
      ),
    },
    { title: 'Fee', dataIndex: 'medicare_fee', render: (v, r: any) => `$${(r.medicare_fee ?? r.medicareFee ?? 0).toFixed(2)}` },
    {
      title: 'Actions',
      render: (_: any, r: any) => (
        <Popconfirm title="Delete item?" onConfirm={() => handleDelete(r.id, section)}>
          <Button icon={<DeleteOutlined />} danger size="small" />
        </Popconfirm>
      ),
    },
  ];

  const { columns: assessmentColumns, components: assessmentTableComponents } = useResizableColumns(makeCols('ASSESSMENT') as any[]);
  const { columns: deliveryColumns, components: deliveryTableComponents } = useResizableColumns(makeCols('DELIVERY') as any[]);

  const assessmentItems = encounter?.assessment ?? [];
  const deliveryItems = encounter?.delivery ?? [];
  const ts = encounter?.timestamps ?? {};

  const canSubmit = !!(ts.assessmentConfirmedAt && ts.deliveryConfirmedAt && (encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl));

  const renderSection = (section: 'ASSESSMENT' | 'DELIVERY', items: any[], confirmedAt: string | null) => {
    const sectionColumns = section === 'ASSESSMENT' ? assessmentColumns : deliveryColumns;
    const sectionTableComponents = section === 'ASSESSMENT' ? assessmentTableComponents : deliveryTableComponents;
    return (
      <div>
        {confirmedAt && (
          <Alert
            message={`${section} confirmed at ${new Date(confirmedAt).toLocaleString()} — still editable per NKP-20`}
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Space style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setActiveSection(section);
              setAddItemOpen(true);
            }}
          >
            Add Item
          </Button>
          <Button icon={<CheckCircleOutlined />} onClick={() => handleConfirm(section)}>
            Confirm {section}
          </Button>
          <Button icon={<FilePdfOutlined />} onClick={downloadPdf}>
            Download Encounter PDF
          </Button>
        </Space>
        <Table
          size="small"
          rowKey="id"
          columns={sectionColumns}
          components={sectionTableComponents}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="No items added yet" /> }}
        />
      </div>
    );
  };

  return (
    <PageWrapper>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Space>

      <Card loading={loading}>
        <Title level={3}>Encounter: {order?.identifier ?? '…'}</Title>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Patient">
            {order?.patientName} {order?.patientLastName}
          </Descriptions.Item>
          <Descriptions.Item label="Diagnosis">{order?.diagnosis ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="ICD-10">{order?.icd10 ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={BRAND}>{order?.orderSubStatus}</Tag>
          </Descriptions.Item>
        </Descriptions>

        <StatusBar style={{ marginTop: 24 }}>
          <Tag color={ts.assessmentConfirmedAt ? 'green' : 'default'}>
            Assessment: {ts.assessmentConfirmedAt ? 'Confirmed' : 'Pending'}
          </Tag>
          <Tag color={ts.deliveryConfirmedAt ? 'green' : 'default'}>
            Delivery: {ts.deliveryConfirmedAt ? 'Confirmed' : 'Pending'}
          </Tag>
          <Tag color={encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl ? 'green' : 'default'}>
            POD: {encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl ? 'Uploaded' : 'Missing'}
          </Tag>
          <Tag color={ts.encounterSubmittedAt ? 'blue' : 'default'}>
            Encounter: {ts.encounterSubmittedAt ? 'Submitted' : 'In Progress'}
          </Tag>
        </StatusBar>

        <Tabs
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          items={[
            {
              key: 'assessment',
              label: 'Assessment',
              children: renderSection('ASSESSMENT', assessmentItems, ts.assessmentConfirmedAt),
            },
            {
              key: 'delivery',
              label: 'Delivery',
              children: (
                <div>
                  {renderSection('DELIVERY', deliveryItems, ts.deliveryConfirmedAt)}
                  <div ref={podCardRef}>
                    <Card title="Proof of Delivery" size="small" style={{ marginTop: 16 }}>
                      <Row gutter={16}>
                        <Col xs={24} md={8}>
                          <Text type="secondary">Received by</Text>
                          <Input
                            placeholder="Receiver's full name"
                            value={podReceiver}
                            onChange={(e) => setPodReceiver(e.target.value)}
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Text type="secondary">Guarantor name (optional)</Text>
                          <Input
                            placeholder="Guarantor name"
                            value={podGuarantor}
                            onChange={(e) => setPodGuarantor(e.target.value)}
                          />
                        </Col>
                        <Col xs={24} md={8}>
                          <Text type="secondary">Delivered at</Text>
                          <DatePicker
                            showTime
                            style={{ width: '100%' }}
                            value={podDeliveredAt}
                            onChange={(v) => setPodDeliveredAt(v)}
                          />
                        </Col>
                      </Row>

                      <div style={{ marginTop: 16 }}>
                        <Text type="secondary">Receiver signature</Text>
                        <div style={{ border: '1px dashed #d9d9d9', borderRadius: 4, padding: 4, background: '#fafafa' }}>
                          <SignatureCanvas
                            ref={signatureRef}
                            penColor="#1f1f1f"
                            canvasProps={{ width: 520, height: 160, style: { background: '#fff', width: '100%', maxWidth: 520 } }}
                          />
                        </div>
                        <Space style={{ marginTop: 8 }}>
                          <Button onClick={() => signatureRef.current?.clear?.()}>Clear</Button>
                          <Button type="primary" loading={podSaving} onClick={handleSaveSignature}>
                            Save Signature
                          </Button>
                          <Upload beforeUpload={handlePodUpload as any} showUploadList={false}>
                            <Button icon={<UploadOutlined />}>or Upload POD File</Button>
                          </Upload>
                        </Space>
                      </div>

                      {(encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl) && (
                        <Alert
                          type="success"
                          showIcon
                          style={{ marginTop: 16 }}
                          message={
                            <Space direction="vertical" size={0}>
                              {encounter?.pod?.fileKey && <Text>File: {encounter.pod.fileKey}</Text>}
                              {encounter?.pod?.signatureDataUrl && <Text>Signature on file</Text>}
                              {encounter?.pod?.deliveredBy && <Text>Received by: {encounter.pod.deliveredBy}</Text>}
                              {encounter?.pod?.deliveryDateTime && (
                                <Text>Delivered: {new Date(encounter.pod.deliveryDateTime).toLocaleString()}</Text>
                              )}
                            </Space>
                          }
                        />
                      )}
                    </Card>
                  </div>
                </div>
              ),
            },
            {
              key: 'history',
              label: 'Audit Log',
              children: (
                <Timeline
                  items={(encounter?.auditLog ?? []).map((a: any) => ({
                    children: (
                      <div>
                        <Tag>{a.section}</Tag>
                        <Text strong>{a.action}</Text>
                        <br />
                        <Text type="secondary">
                          {new Date(a.created_at).toLocaleString()} — user {a.changed_by_user_id?.slice(0, 8)}
                        </Text>
                      </div>
                    ),
                  }))}
                />
              ),
            },
          ]}
        />

        <Card size="small" style={{ marginTop: 24, background: '#fafafa' }}>
          <Row align="middle" justify="space-between" gutter={[16, 16]}>
            <Col xs={24} md={16}>
              <Space direction="vertical" size={4}>
                <Text strong>Submission checklist</Text>
                <Space>
                  <Tag icon={ts.assessmentConfirmedAt ? <CheckCircleOutlined /> : null}
                       color={ts.assessmentConfirmedAt ? 'green' : 'default'}>
                    {ts.assessmentConfirmedAt ? '✓' : '○'} Assessment confirmed
                  </Tag>
                  <Tag icon={ts.deliveryConfirmedAt ? <CheckCircleOutlined /> : null}
                       color={ts.deliveryConfirmedAt ? 'green' : 'default'}>
                    {ts.deliveryConfirmedAt ? '✓' : '○'} Delivery confirmed
                  </Tag>
                  <Tag icon={(encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl) ? <CheckCircleOutlined /> : null}
                       color={(encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl) ? 'green' : 'default'}>
                    {(encounter?.pod?.fileKey || encounter?.pod?.signatureDataUrl) ? '✓' : '○'} Proof of delivery captured
                  </Tag>
                </Space>
                {!canSubmit && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Complete all three steps above to enable submission.
                  </Text>
                )}
              </Space>
            </Col>
            <Col xs={24} md={8} style={{ textAlign: 'right' }}>
              <Button
                type="primary"
                size="large"
                loading={submitting}
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                Submit Encounter
              </Button>
            </Col>
          </Row>
        </Card>
      </Card>

      <UnifiedAddItemModal
        open={addItemOpen}
        orderId={orderId!}
        vendorId={order?.vendorId}
        section={activeSection}
        onClose={() => setAddItemOpen(false)}
        onAdded={fetchAll}
      />
    </PageWrapper>
  );
};

export default EncounterPage;
