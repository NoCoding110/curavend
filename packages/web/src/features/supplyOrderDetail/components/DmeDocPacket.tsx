/**
 * DME document packet panel — drops into the order detail page below
 * Shipments / Goods Receipts. Shows the required-doc checklist with
 * received/missing/expired status and upload affordances.
 */
import React, { useEffect, useState } from 'react';
import {
  Card,
  Space,
  Tag,
  Button,
  Table,
  Progress,
  Typography,
  Empty,
  message,
  Popconfirm,
  Modal,
  Form,
  Input,
  Select,
  Upload,
  Alert,
} from 'antd';
import {
  FileTextOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
  CheckOutlined,
  FilePdfOutlined,
  DownloadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { DwoSignatureDrawer } from './DwoSignatureDrawer';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  dmeDocumentsApi,
  DME_DOCUMENT_TYPES,
  type DmeOrderDocument,
  type DmeDocPacketStatus,
  type DmeDocStatus,
} from '../../../api/dmeDocuments';
import { post } from '../../../api/client';

interface DmeDocPacketProps {
  orderId: string;
  canEdit?: boolean;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  DWO: 'Detailed Written Order',
  SWO: 'Standard Written Order',
  CMN: 'Certificate of Medical Necessity',
  FACE_TO_FACE: 'Face-to-Face Encounter',
  SLEEP_STUDY: 'Sleep Study',
  OXIMETRY: 'Oximetry / Qualifying Test',
  LMN: 'Letter of Medical Necessity',
  PROGRESS_NOTES: 'Progress Notes',
  PHOTO: 'Photographs',
  AOB: 'Assignment of Benefits',
  DELIVERY_TICKET: 'Delivery Ticket',
  PROOF_OF_DELIVERY: 'Proof of Delivery',
  OTHER: 'Other',
};

const STATUS_COLOR: Record<DmeDocStatus, string> = {
  MISSING: 'default',
  RECEIVED: 'green',
  EXPIRED: 'orange',
  REJECTED: 'red',
  NOT_APPLICABLE: 'default',
};

export const DmeDocPacket: React.FC<DmeDocPacketProps> = ({ orderId, canEdit = true }) => {
  const [packet, setPacket] = useState<DmeDocPacketStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadDoc, setUploadDoc] = useState<DmeOrderDocument | null>(null);
  const [uploadForm] = Form.useForm();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [rejectModal, setRejectModal] = useState<{ doc: DmeOrderDocument | null; reason: string }>({
    doc: null,
    reason: '',
  });
  const [signOpen, setSignOpen] = useState(false);

  const fetchPacket = async () => {
    setLoading(true);
    try {
      const r = await dmeDocumentsApi.forOrder(orderId);
      setPacket(r);
    } catch (err: any) {
      // Non-fatal — order may not have any DME docs at all
      setPacket({ total: 0, received: 0, missing: 0, rejected: 0, complete: false, docs: [] });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void fetchPacket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const materialize = async () => {
    try {
      const r = await dmeDocumentsApi.materialize(orderId);
      if (r.created === 0 && r.totalRequired === 0) {
        message.info('No DME document requirements apply to this order. (Add an ad-hoc doc below if needed.)');
      } else if (r.created === 0) {
        message.info('Document packet already up to date');
      } else {
        message.success(`Created ${r.created} missing document slots`);
      }
      void fetchPacket();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed to materialize');
    }
  };

  // Upload via existing /api/uploads (presigned put then record blobKey)
  const handleUpload = async (file: File) => {
    if (!uploadDoc) return false;
    try {
      // 1. Get a presigned upload via /api/uploads
      const formData = new FormData();
      formData.append('file', file);
      const presigned = await post<{ key: string }>('/uploads', { fileName: file.name, mimeType: file.type });
      // Upload to R2 — using a direct fetch since /uploads usually returns a key + url
      // (Implementation depends on uploads.ts shape; for now record the returned key directly.)
      const v = await uploadForm.validateFields();
      await dmeDocumentsApi.upload(uploadDoc.id, {
        blobKey: presigned.key,
        fileName: file.name,
        mimeType: file.type,
        signedAt: v.signedAt ? dayjs(v.signedAt).format('YYYY-MM-DD') : undefined,
        signedByName: v.signedByName,
        notes: v.notes,
      });
      message.success('Document uploaded');
      setUploadDoc(null);
      void fetchPacket();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Upload failed');
    }
    return false; // prevent default Upload component behaviour
  };

  const markReceived = async (doc: DmeOrderDocument) => {
    try {
      await dmeDocumentsApi.markReceived(doc.id, 'Provider attested receipt');
      message.success('Marked as received');
      void fetchPacket();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const confirmReject = async () => {
    if (!rejectModal.doc || !rejectModal.reason.trim()) {
      message.warning('Reason required');
      return;
    }
    try {
      await dmeDocumentsApi.markRejected(rejectModal.doc.id, rejectModal.reason.trim());
      message.success('Marked as rejected');
      setRejectModal({ doc: null, reason: '' });
      void fetchPacket();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const removeAdHoc = async (doc: DmeOrderDocument) => {
    try {
      await dmeDocumentsApi.remove(doc.id);
      message.success('Document removed');
      void fetchPacket();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const submitAdHoc = async () => {
    try {
      const v = await addForm.validateFields();
      await dmeDocumentsApi.addAdHoc(orderId, v.documentType, v.notes);
      message.success('Document slot added');
      setAddOpen(false);
      addForm.resetFields();
      void fetchPacket();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const columns: ColumnsType<DmeOrderDocument> = [
    {
      title: 'Document',
      dataIndex: 'documentType',
      render: (t: string, r) => (
        <Space direction="vertical" size={0}>
          <strong>{DOC_TYPE_LABEL[t] ?? t}</strong>
          {r.notes && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.notes}</Typography.Text>}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (s: DmeDocStatus) => <Tag color={STATUS_COLOR[s]}>{s.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Signed',
      dataIndex: 'signedAt',
      width: 110,
      render: (v: string | null) => (v ? dayjs(v).format('MMM D, YYYY') : '—'),
    },
    {
      title: 'Expires',
      dataIndex: 'expiresAt',
      width: 130,
      render: (v: string | null) => {
        if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
        const d = dayjs(v);
        const daysLeft = d.diff(dayjs(), 'day');
        return (
          <Space size={4}>
            <span>{d.format('MMM D, YYYY')}</span>
            {daysLeft <= 0 ? (
              <Tag color="red">Expired</Tag>
            ) : daysLeft < 30 ? (
              <Tag color="orange">{daysLeft}d</Tag>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '',
      width: 250,
      render: (_: any, r: DmeOrderDocument) => {
        if (!canEdit) return null;
        if (r.status === 'RECEIVED') {
          return (
            <Space>
              <Button size="small" icon={<CloseCircleOutlined />} onClick={() => setRejectModal({ doc: r, reason: '' })}>
                Reject
              </Button>
              {r.fileName && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.fileName}
                </Typography.Text>
              )}
            </Space>
          );
        }
        if (r.status === 'MISSING' || r.status === 'EXPIRED' || r.status === 'REJECTED') {
          return (
            <Space>
              <Button size="small" type="primary" icon={<UploadOutlined />} onClick={() => setUploadDoc(r)}>
                Upload
              </Button>
              <Button size="small" icon={<CheckOutlined />} onClick={() => markReceived(r)}>
                Attest
              </Button>
              {!r.requirementId && (
                <Popconfirm title="Remove this ad-hoc doc?" onConfirm={() => removeAdHoc(r)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Space>
          );
        }
        return null;
      },
    },
  ];

  const pct = packet && packet.total > 0 ? Math.round((packet.received / packet.total) * 100) : 0;

  return (
    <Card
      size="small"
      title={
        <Space>
          <FileTextOutlined style={{ color: '#1BAEE5' }} />
          <span>DME Document Packet</span>
          {packet && packet.total > 0 && (
            <Tag color={packet.complete ? 'green' : packet.missing > 0 ? 'orange' : 'default'}>
              {packet.received} / {packet.total} received
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button
            size="small"
            icon={<FilePdfOutlined />}
            onClick={() => window.open(`/api/dme-bundle/${orderId}/dwo.pdf`, '_blank')}
          >
            DWO PDF
          </Button>
          {canEdit && (
            <Button size="small" icon={<EditOutlined />} onClick={() => setSignOpen(true)}>
              Sign DWO
            </Button>
          )}
          <Button
            size="small"
            icon={<DownloadOutlined />}
            type={packet?.complete ? 'primary' : 'default'}
            disabled={!packet || packet.total === 0}
            onClick={() => window.open(`/api/dme-bundle/${orderId}/claim-bundle.pdf`, '_blank')}
          >
            Claim bundle
          </Button>
          {canEdit && (
            <>
              <Button size="small" onClick={materialize}>Refresh requirements</Button>
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddOpen(true); }}>
                Add ad-hoc
              </Button>
            </>
          )}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {packet && packet.total > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Progress
            percent={pct}
            status={packet.complete ? 'success' : packet.rejected > 0 ? 'exception' : 'active'}
            strokeColor={packet.complete ? '#52c41a' : packet.rejected > 0 ? '#cf1322' : '#1BAEE5'}
            size="small"
          />
        </div>
      )}
      {packet?.complete && (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          message="Documentation packet is complete — order is claim-ready"
          style={{ marginBottom: 12 }}
        />
      )}
      {packet && packet.missing > 0 && (
        <Alert
          type="warning"
          icon={<ExclamationCircleOutlined />}
          message={`${packet.missing} document${packet.missing > 1 ? 's' : ''} still needed before claim submission`}
          style={{ marginBottom: 12 }}
        />
      )}
      {packet && packet.total === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No DME documents required yet. Click 'Refresh requirements' to resolve from the order's HCPC items."
        />
      ) : (
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={packet?.docs ?? []}
          columns={columns}
          pagination={false}
        />
      )}

      {/* Upload modal */}
      <Modal
        title={uploadDoc ? `Upload ${DOC_TYPE_LABEL[uploadDoc.documentType]}` : ''}
        open={!!uploadDoc}
        onCancel={() => setUploadDoc(null)}
        footer={null}
      >
        <Form form={uploadForm} layout="vertical">
          <Form.Item label="Signed date" name="signedAt">
            <Input type="date" />
          </Form.Item>
          <Form.Item label="Signed by" name="signedByName">
            <Input placeholder="e.g. Dr. Jane Smith, MD" />
          </Form.Item>
          <Form.Item label="Notes" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Upload beforeUpload={handleUpload} showUploadList={false} maxCount={1}>
            <Button type="primary" icon={<UploadOutlined />}>
              Select file
            </Button>
          </Upload>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            File is uploaded to encrypted R2 storage and linked to this document slot.
          </Typography.Paragraph>
        </Form>
      </Modal>

      {/* Add ad-hoc modal */}
      <Modal
        title="Add ad-hoc document"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={submitAdHoc}
        okText="Add"
      >
        <Form form={addForm} layout="vertical">
          <Form.Item name="documentType" label="Document type" rules={[{ required: true }]}>
            <Select
              showSearch
              options={DME_DOCUMENT_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] ?? t }))}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Why this is being added outside the catalog" />
          </Form.Item>
        </Form>
      </Modal>

      <DwoSignatureDrawer
        orderId={orderId}
        open={signOpen}
        onClose={() => setSignOpen(false)}
        onSigned={() => void fetchPacket()}
      />

      {/* Reject modal */}
      <Modal
        title={rejectModal.doc ? `Reject ${DOC_TYPE_LABEL[rejectModal.doc.documentType]}` : ''}
        open={!!rejectModal.doc}
        onCancel={() => setRejectModal({ doc: null, reason: '' })}
        onOk={confirmReject}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea
          rows={3}
          value={rejectModal.reason}
          onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
          placeholder="Why this document fails (e.g. F2F more than 6 months old)"
        />
      </Modal>
    </Card>
  );
};

export default DmeDocPacket;
