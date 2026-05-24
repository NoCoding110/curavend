/**
 * Contract Detail page — replaces the old drawer with a full route.
 *
 * Sections:
 *   - Header: name, status badge, parties, dates, action buttons
 *   - Tabs: Overview, Line Items, Document, Revisions, History
 *
 * Status-gated actions:
 *   DRAFT + drafter         → Edit, Submit, Delete
 *   PENDING_APPROVAL + drafter   → Withdraw
 *   PENDING_APPROVAL + reviewer  → Approve, Reject, Request Changes
 *   REJECTED + drafter|admin     → Reopen
 *   ACTIVE + either party        → Amend, Terminate
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBreadcrumbOverride } from '../../../contexts/BreadcrumbContext';
import {
  Card,
  Tabs,
  Tag,
  Button,
  Space,
  Typography,
  Descriptions,
  Spin,
  message,
  Modal,
  Input,
  Table,
  Timeline,
  Empty,
  Tooltip,
  Upload,
  InputNumber,
  Popconfirm,
  Divider,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  RollbackOutlined,
  StopOutlined,
  ArrowLeftOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  PlusOutlined,
  SendOutlined,
  UploadOutlined,
  HistoryOutlined,
  DownloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { useUserRoles } from '../../../hooks/useUserRoles';
import {
  contractsApi,
  type ContractDetail as ContractDetailDto,
  type ContractItem,
  type ContractRevision,
  type ContractHistoryRow,
  type ContractStatus,
} from '../../../api/contracts';
import { uploadFile } from '../../../api/client';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store/store';

const { Title, Text } = Typography;

const PageWrap = styled.div`
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
`;

const STATUS_COLORS: Record<ContractStatus, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'gold',
  APPROVED: 'blue',
  ACTIVE: 'green',
  EXPIRED: 'red',
  TERMINATED: 'red',
  REJECTED: 'volcano',
  SUPERSEDED: 'purple',
};

function StatusBadge({ status }: { status: ContractStatus }) {
  return <Tag color={STATUS_COLORS[status]} style={{ fontWeight: 600 }}>{status}</Tag>;
}

const ContractDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isHospital, isVendor } = useUserRoles();
  const authToken = useSelector((s: RootState) => s.auth.token);

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractDetailDto | null>(null);
  const [items, setItems] = useState<ContractItem[]>([]);
  const [revisions, setRevisions] = useState<ContractRevision[]>([]);
  const [history, setHistory] = useState<ContractHistoryRow[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  useBreadcrumbOverride(
    contract
      ? [
          { title: 'Contracts & Pricing', to: '/contract-pricing' },
          { title: (contract as any).contractName || (contract as any).name || 'Contract detail' },
        ]
      : null,
  );

  // Modals
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesComment, setChangesComment] = useState('');
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');

  // Item editor (DRAFT only)
  const [editingItem, setEditingItem] = useState<ContractItem | null>(null);
  const [newItemModal, setNewItemModal] = useState(false);
  const [newItem, setNewItem] = useState<{ hcpcCode: string; description: string; rate: number; quantity: number | null }>({
    hcpcCode: '', description: '', rate: 0, quantity: null,
  });

  // ── Load ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [c, it, rev, h] = await Promise.all([
        contractsApi.get(id),
        contractsApi.listItems(id),
        contractsApi.listRevisions(id),
        contractsApi.listHistory(id),
      ]);
      setContract(c);
      setItems(it.items ?? []);
      setRevisions(rev.items ?? []);
      setHistory(h.items ?? []);
    } catch (err: any) {
      message.error(`Could not load contract: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ── Document download ───────────────────────────────────────────────
  const downloadFile = async (s3key: string | null | undefined, fileName?: string) => {
    if (!s3key) {
      message.warning('No document attached to this contract.');
      return;
    }
    const apiHost = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://curavend-api.metabilityllc1.workers.dev/api').replace(/\/api$/, '');
    const fullUrl = s3key.startsWith('http') ? s3key : `${apiHost}${s3key.startsWith('/') ? '' : '/'}${s3key}`;
    try {
      const resp = await fetch(fullUrl, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'contract.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      message.error(`Download failed: ${err.message}`);
    }
  };

  // ── Action handlers ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!id) return;
    try {
      await contractsApi.submit(id);
      message.success('Submitted for approval.');
      await loadAll();
    } catch (err: any) {
      message.error(`Submit failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleWithdraw = async () => {
    if (!id) return;
    try {
      await contractsApi.withdraw(id);
      message.success('Withdrawn back to draft.');
      await loadAll();
    } catch (err: any) {
      message.error(`Withdraw failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleApprove = async () => {
    if (!id) return;
    try {
      await contractsApi.approve(id);
      message.success('Approved.');
      await loadAll();
    } catch (err: any) {
      message.error(`Approve failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleReject = async () => {
    if (!id) return;
    if (!rejectReason.trim()) {
      message.warning('Please provide a reason.');
      return;
    }
    try {
      await contractsApi.reject(id, rejectReason.trim());
      message.success('Rejected.');
      setRejectOpen(false);
      setRejectReason('');
      await loadAll();
    } catch (err: any) {
      message.error(`Reject failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleRequestChanges = async () => {
    if (!id) return;
    if (!changesComment.trim()) {
      message.warning('Please add a comment describing the requested changes.');
      return;
    }
    try {
      await contractsApi.requestChanges(id, changesComment.trim());
      message.success('Changes requested.');
      setChangesOpen(false);
      setChangesComment('');
      await loadAll();
    } catch (err: any) {
      message.error(`Request changes failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleReopen = async () => {
    if (!id) return;
    try {
      await contractsApi.reopen(id);
      message.success('Reopened to draft.');
      await loadAll();
    } catch (err: any) {
      message.error(`Reopen failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleTerminate = async () => {
    if (!id) return;
    try {
      await contractsApi.terminate(id, terminateReason.trim());
      message.success('Contract terminated.');
      setTerminateOpen(false);
      setTerminateReason('');
      await loadAll();
    } catch (err: any) {
      message.error(`Terminate failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleAmend = async () => {
    if (!id) return;
    try {
      const r = await contractsApi.amend(id);
      message.success('Amendment draft created.');
      navigate(`/contracts/${r.id}`);
    } catch (err: any) {
      message.error(`Amend failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleDelete = async () => {
    if (!id) return;
    try {
      await contractsApi.delete(id);
      message.success('Deleted.');
      navigate('/contract-pricing');
    } catch (err: any) {
      message.error(`Delete failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  // ── Items CRUD ──────────────────────────────────────────────────────
  const handleAddItem = async () => {
    if (!id) return;
    if (!newItem.hcpcCode.trim()) {
      message.warning('HCPC code is required.');
      return;
    }
    try {
      await contractsApi.addItem(id, {
        hcpcCode: newItem.hcpcCode.trim().toUpperCase(),
        description: newItem.description || null,
        negotiatedRate: Number(newItem.rate),
        quantity: newItem.quantity,
      });
      setNewItemModal(false);
      setNewItem({ hcpcCode: '', description: '', rate: 0, quantity: null });
      await loadAll();
    } catch (err: any) {
      message.error(`Add failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleUpdateItem = async (item: ContractItem, patch: Partial<ContractItem>) => {
    if (!id) return;
    try {
      await contractsApi.updateItem(id, item.id, patch as any);
      setEditingItem(null);
      await loadAll();
    } catch (err: any) {
      message.error(`Update failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };
  const handleDeleteItem = async (item: ContractItem) => {
    if (!id) return;
    try {
      await contractsApi.deleteItem(id, item.id);
      await loadAll();
    } catch (err: any) {
      message.error(`Delete failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  // ── Replace contract document (DRAFT only) ──────────────────────────
  const handleFileReplace = async (file: File) => {
    if (!id) return false;
    try {
      const r: any = await uploadFile('/uploads', file);
      const newKey = r.url ?? r.key;
      await contractsApi.update(id, { s3key: newKey });
      message.success('Document updated.');
      await loadAll();
    } catch (err: any) {
      message.error(`Upload failed: ${err?.response?.data?.error ?? err.message}`);
    }
    return false;
  };

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} size="large" />;
  if (!contract) {
    return (
      <PageWrap>
        <Empty description="Contract not found" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/contract-pricing')} icon={<ArrowLeftOutlined />}>Back to list</Button>
        </div>
      </PageWrap>
    );
  }

  const isDrafter = contract.permissions.isDrafter || isAdmin;
  const canReview = contract.permissions.canReview;
  const canWrite = contract.permissions.canWrite;
  const isDraftEditable = contract.status === 'DRAFT' && canWrite;

  return (
    <PageWrap>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contract-pricing')}>Back</Button>
            <Title level={3} style={{ margin: 0 }}>
              {contract.name ?? `Contract ${contract.id.slice(0, 8)}`}
            </Title>
            <StatusBadge status={contract.status} />
            {contract.parentContractId && (
              <Tag color="purple">Amendment of <a onClick={() => navigate(`/contracts/${contract.parentContractId}`)}>{contract.parentContractId.slice(0, 8)}</a></Tag>
            )}
          </Space>
          <Descriptions column={3} size="small" colon={false} style={{ marginTop: 8 }}>
            <Descriptions.Item label="Hospital">{contract.hospital ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Vendor">{contract.vendor ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Initiated by">{contract.initiatedBy ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Start">{contract.startDate}</Descriptions.Item>
            <Descriptions.Item label="End">{contract.endDate}</Descriptions.Item>
            <Descriptions.Item label="Updated">{new Date(contract.updatedAt).toLocaleString()}</Descriptions.Item>
          </Descriptions>

          {contract.status === 'REJECTED' && contract.rejectedReason && (
            <div style={{ background: '#fff1f0', padding: 12, borderRadius: 4, borderLeft: '3px solid #ff4d4f' }}>
              <WarningOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
              <Text strong>Rejection reason: </Text>{contract.rejectedReason}
            </div>
          )}
          {contract.status === 'TERMINATED' && contract.terminationReason && (
            <div style={{ background: '#fff1f0', padding: 12, borderRadius: 4, borderLeft: '3px solid #ff4d4f' }}>
              <StopOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
              <Text strong>Terminated:</Text> {contract.terminationReason} <Text type="secondary">({contract.terminatedAt})</Text>
            </div>
          )}

          {/* Action buttons */}
          <Space wrap style={{ marginTop: 8 }}>
            {/* DRAFT + drafter (or admin who can write) */}
            {contract.status === 'DRAFT' && canWrite && (
              <>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSubmit}
                  disabled={items.length === 0}
                >
                  Submit for approval
                </Button>
                <Popconfirm title="Delete this contract permanently?" onConfirm={handleDelete}>
                  <Button danger icon={<DeleteOutlined />}>Delete</Button>
                </Popconfirm>
              </>
            )}
            {contract.status === 'PENDING_APPROVAL' && isDrafter && (
              <Button icon={<RollbackOutlined />} onClick={handleWithdraw}>Withdraw</Button>
            )}
            {contract.status === 'PENDING_APPROVAL' && canReview && (
              <>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleApprove}>Approve</Button>
                <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejectOpen(true)}>Reject</Button>
                <Button icon={<EditOutlined />} onClick={() => setChangesOpen(true)}>Request changes</Button>
              </>
            )}
            {contract.status === 'REJECTED' && canWrite && (
              <Button icon={<RollbackOutlined />} onClick={handleReopen}>Reopen as Draft</Button>
            )}
            {(contract.status === 'ACTIVE' || contract.status === 'APPROVED') && canWrite && (
              <>
                <Button icon={<EditOutlined />} onClick={handleAmend}>Amend</Button>
                <Button danger icon={<StopOutlined />} onClick={() => setTerminateOpen(true)}>Terminate</Button>
              </>
            )}
            {contract.s3key && (
              <Button icon={<DownloadOutlined />} onClick={() => downloadFile(contract.s3key, contract.name ?? 'contract.pdf')}>
                Download document
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <Descriptions column={2} bordered>
                  <Descriptions.Item label="Status">{contract.status}</Descriptions.Item>
                  <Descriptions.Item label="Current revision">{contract.currentRevisionId ? revisions.find((r) => r.id === contract.currentRevisionId)?.revisionNumber ?? '—' : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Hospital">{contract.hospital ?? contract.hospitalId ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Vendor">{contract.vendor ?? contract.vendorId ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Start">{contract.startDate}</Descriptions.Item>
                  <Descriptions.Item label="End">{contract.endDate}</Descriptions.Item>
                  <Descriptions.Item label="Initiated by">{contract.initiatedBy ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Items">{items.length}</Descriptions.Item>
                  <Descriptions.Item label="Created">{new Date(contract.createdAt).toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="Updated">{new Date(contract.updatedAt).toLocaleString()}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'items',
              label: `Line Items (${items.length})`,
              children: (
                <>
                  {isDraftEditable && (
                    <div style={{ marginBottom: 12 }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewItemModal(true)}>
                        Add line item
                      </Button>
                    </div>
                  )}
                  <Table
                    dataSource={items}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    locale={{ emptyText: isDraftEditable ? 'No items yet — click "Add line item" to add one.' : 'No line items.' }}
                    columns={[
                      {
                        title: 'HCPC code',
                        dataIndex: 'hcpcCode',
                        width: 130,
                      },
                      {
                        title: 'Description',
                        dataIndex: 'description',
                        render: (v: string | null) => v || <Text type="secondary">—</Text>,
                      },
                      {
                        title: 'Negotiated rate',
                        dataIndex: 'negotiatedRate',
                        width: 140,
                        render: (v: number) => `$${Number(v).toFixed(2)}`,
                      },
                      {
                        title: 'Qty cap',
                        dataIndex: 'quantity',
                        width: 100,
                        render: (v) => v ?? <Text type="secondary">—</Text>,
                      },
                      {
                        title: '',
                        width: 100,
                        render: (_v, row: ContractItem) =>
                          isDraftEditable ? (
                            <Space>
                              <Button size="small" icon={<EditOutlined />} onClick={() => setEditingItem(row)} />
                              <Popconfirm title="Delete this item?" onConfirm={() => handleDeleteItem(row)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                              </Popconfirm>
                            </Space>
                          ) : null,
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'document',
              label: 'Document',
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {contract.s3key ? (
                    <Space>
                      <FilePdfOutlined style={{ fontSize: 28, color: '#ff4d4f' }} />
                      <span>Document attached.</span>
                      <Button icon={<DownloadOutlined />} onClick={() => downloadFile(contract.s3key, contract.name ?? 'contract.pdf')}>
                        Download
                      </Button>
                    </Space>
                  ) : (
                    <Empty description="No document attached." />
                  )}
                  {isDraftEditable && (
                    <>
                      <Divider style={{ margin: '8px 0' }} />
                      <Upload
                        beforeUpload={(file) => {
                          void handleFileReplace(file as File);
                          return false;
                        }}
                        accept=".pdf,.doc,.docx"
                        showUploadList={false}
                      >
                        <Button icon={<UploadOutlined />}>{contract.s3key ? 'Replace document' : 'Upload document'}</Button>
                      </Upload>
                    </>
                  )}
                </Space>
              ),
            },
            {
              key: 'revisions',
              label: `Revisions (${revisions.length})`,
              children: revisions.length === 0 ? <Empty description="No submissions yet — this contract has not been submitted for approval." /> : (
                <Timeline
                  items={revisions.map((r) => ({
                    color: r.reviewDecision === 'APPROVED' ? 'green' : r.reviewDecision === 'REJECTED' ? 'red' : r.reviewDecision === 'CHANGES_REQUESTED' ? 'orange' : 'blue',
                    children: (
                      <div>
                        <Space>
                          <Text strong>Revision #{r.revisionNumber}</Text>
                          {r.reviewDecision && <Tag color={r.reviewDecision === 'APPROVED' ? 'green' : r.reviewDecision === 'REJECTED' ? 'red' : 'orange'}>{r.reviewDecision}</Tag>}
                        </Space>
                        <div>
                          <Text type="secondary">
                            Submitted {new Date(r.submittedAt).toLocaleString()} by {r.submittedByEmail ?? r.submittedByUserId}
                          </Text>
                        </div>
                        {r.reviewedAt && (
                          <div>
                            <Text type="secondary">
                              Reviewed {new Date(r.reviewedAt).toLocaleString()}
                            </Text>
                          </div>
                        )}
                        {r.reviewComment && (
                          <div style={{ marginTop: 4, padding: '6px 10px', background: '#fafafa', borderRadius: 4 }}>
                            <Text>“{r.reviewComment}”</Text>
                          </div>
                        )}
                      </div>
                    ),
                  }))}
                />
              ),
            },
            {
              key: 'history',
              label: 'History',
              children: history.length === 0 ? <Empty /> : (
                <Timeline
                  items={history.map((h) => ({
                    color: 'blue',
                    children: (
                      <div>
                        <Text>{h.description}</Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(h.createdAt).toLocaleString()}{h.changedByEmail ? ` by ${h.changedByEmail}` : ''}
                          </Text>
                        </div>
                      </div>
                    ),
                  }))}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      <Modal
        title="Reject contract"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={handleReject}
        okText="Reject"
        okType="danger"
      >
        <p>Please provide a reason for rejection. This will be visible to the drafter.</p>
        <Input.TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
      </Modal>

      <Modal
        title="Request changes"
        open={changesOpen}
        onCancel={() => setChangesOpen(false)}
        onOk={handleRequestChanges}
        okText="Send back to drafter"
      >
        <p>Describe what needs to change. The drafter will edit and resubmit as a new revision.</p>
        <Input.TextArea rows={4} value={changesComment} onChange={(e) => setChangesComment(e.target.value)} />
      </Modal>

      <Modal
        title="Terminate contract"
        open={terminateOpen}
        onCancel={() => setTerminateOpen(false)}
        onOk={handleTerminate}
        okText="Terminate"
        okType="danger"
      >
        <p>This will immediately end the contract. Provide a reason for the record.</p>
        <Input.TextArea rows={4} value={terminateReason} onChange={(e) => setTerminateReason(e.target.value)} />
      </Modal>

      <Modal
        title="Add line item"
        open={newItemModal}
        onCancel={() => setNewItemModal(false)}
        onOk={handleAddItem}
        okText="Add"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="HCPC code (e.g. L1832)" value={newItem.hcpcCode}
            onChange={(e) => setNewItem({ ...newItem, hcpcCode: e.target.value })} />
          <Input placeholder="Description (optional)" value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
          <InputNumber style={{ width: '100%' }} min={0} step={0.01}
            placeholder="Negotiated rate ($)" value={newItem.rate}
            onChange={(v) => setNewItem({ ...newItem, rate: typeof v === 'number' ? v : 0 })} />
          <InputNumber style={{ width: '100%' }} min={0}
            placeholder="Quantity cap (optional)" value={newItem.quantity ?? undefined}
            onChange={(v) => setNewItem({ ...newItem, quantity: typeof v === 'number' ? v : null })} />
        </Space>
      </Modal>

      <Modal
        title={`Edit ${editingItem?.hcpcCode ?? 'item'}`}
        open={!!editingItem}
        onCancel={() => setEditingItem(null)}
        onOk={() => editingItem && handleUpdateItem(editingItem, editingItem)}
        okText="Save"
      >
        {editingItem && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input value={editingItem.hcpcCode} onChange={(e) => setEditingItem({ ...editingItem, hcpcCode: e.target.value })} placeholder="HCPC code" />
            <Input value={editingItem.description ?? ''} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} placeholder="Description" />
            <InputNumber style={{ width: '100%' }} min={0} step={0.01}
              value={editingItem.negotiatedRate}
              onChange={(v) => setEditingItem({ ...editingItem, negotiatedRate: typeof v === 'number' ? v : 0 })} />
            <InputNumber style={{ width: '100%' }} min={0}
              value={editingItem.quantity ?? undefined}
              onChange={(v) => setEditingItem({ ...editingItem, quantity: typeof v === 'number' ? v : null })} />
          </Space>
        )}
      </Modal>
    </PageWrap>
  );
};

export default ContractDetailPage;
