import React, { useEffect, useState } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  message,
  Modal,
  Input,
  Tabs,
  Table,
} from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { labsApi } from '../../../api/labs';
import { workflowsApi } from '../../../api/workflows';
import { Form } from 'antd';

const { Title } = Typography;

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'default',
  READY_FOR_APPROVAL: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  SHIPPED: 'blue',
  DELIVERED: 'cyan',
  COMPLETED: 'success',
  CANCELLED: 'default',
};

const LabOrderDetail: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any | null>(null);
  const [workflow, setWorkflow] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // Workflow control modals
  const [wfTerminateOpen, setWfTerminateOpen] = useState(false);
  const [wfTerminateReason, setWfTerminateReason] = useState('');
  const [wfEventOpen, setWfEventOpen] = useState(false);
  const [wfEventForm] = Form.useForm();

  const refresh = async (opts: { showSpinner?: boolean } = {}) => {
    if (opts.showSpinner) setLoading(true);
    try {
      const [o, w] = await Promise.all([labsApi.getOrder(id), labsApi.getWorkflow(id)]);
      setOrder(o.data);
      setWorkflow(w.data);
    } finally {
      if (opts.showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    if (id) refresh({ showSpinner: true });
    const interval = setInterval(() => {
      // Only poll while the workflow is still in-flight; never show spinner
      // on background refreshes (would re-mount the tabs and reset active tab).
      if (id && workflow && (workflow.status === 'PENDING' || workflow.status === 'RUNNING')) {
        refresh();
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const approve = async () => {
    try {
      await labsApi.approveOrder(id);
      message.success('Order approved');
      refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Approve failed');
    }
  };

  const handleWorkflowTerminate = async () => {
    if (!wfTerminateReason || wfTerminateReason.trim().length < 3) {
      message.error('Reason must be at least 3 characters');
      return;
    }
    if (!workflow?.id) return;
    try {
      await workflowsApi.terminate(workflow.id, wfTerminateReason.trim());
      message.success('Workflow terminated');
      setWfTerminateOpen(false);
      setWfTerminateReason('');
      refresh();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Terminate failed');
    }
  };

  const handleWorkflowRaiseEvent = async (values: any) => {
    if (!workflow?.id) return;
    let payload: any = undefined;
    if (values.payload?.trim()) {
      try {
        payload = JSON.parse(values.payload);
      } catch {
        message.error('Payload must be valid JSON');
        return;
      }
    }
    try {
      const result = await workflowsApi.raiseEvent(workflow.id, values.eventName, payload);
      message.success(result.resumed ? 'Event raised — workflow resumed' : 'Event stored');
      setWfEventOpen(false);
      wfEventForm.resetFields();
      refresh();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Raise event failed');
    }
  };

  const handleWorkflowPurge = () => {
    if (!workflow?.id) return;
    Modal.confirm({
      title: 'Purge workflow history?',
      content: `This permanently deletes the workflow instance and all its activity log + events. The lab order itself is NOT affected.`,
      okType: 'danger',
      onOk: async () => {
        try {
          await workflowsApi.purge(workflow.id);
          message.success('Workflow purged');
          refresh();
        } catch (err: any) {
          message.error(err?.response?.data?.error || 'Purge failed');
        }
      },
    });
  };

  const reject = async () => {
    if (!rejectReason || rejectReason.trim().length < 3) {
      message.error('Reason must be at least 3 characters');
      return;
    }
    try {
      await labsApi.rejectOrder(id, rejectReason.trim());
      message.success('Order rejected');
      setRejectModal(false);
      setRejectReason('');
      refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Reject failed');
    }
  };

  if (loading || !order) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  const tests = (() => {
    try {
      return order.testList ? JSON.parse(order.testList) : [];
    } catch {
      return [];
    }
  })();
  const dxCodes = (() => {
    try {
      return order.dxCodeList ? JSON.parse(order.dxCodeList) : [];
    } catch {
      return [];
    }
  })();

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/labs/orders')}>← Back to Orders</Button>
        <Title level={3} style={{ margin: 0 }}>Lab Order {order.orderNumber}</Title>
        <Tag color={STATUS_COLORS[order.status]} style={{ fontSize: 14 }}>{order.status}</Tag>
      </Space>

      {order.status === 'READY_FOR_APPROVAL' && (
        <Card style={{ marginBottom: 16, background: '#fffbe6', borderColor: '#ffe58f' }}>
          <Space>
            <strong>Awaiting approval.</strong>
            <Button type="primary" onClick={approve}>Approve</Button>
            <Button danger onClick={() => setRejectModal(true)}>Reject</Button>
          </Space>
        </Card>
      )}
      {order.status === 'REJECTED' && order.rejectionReason && (
        <Card style={{ marginBottom: 16, background: '#fff2f0', borderColor: '#ffccc7' }}>
          <strong>Rejection reason:</strong> {order.rejectionReason}
        </Card>
      )}

      <Tabs
        defaultActiveKey="info"
        items={[
          {
            key: 'info',
            label: 'Order Info',
            children: (
              <Card>
                <Descriptions column={2} bordered>
                  <Descriptions.Item label="Order #">{order.orderNumber}</Descriptions.Item>
                  <Descriptions.Item label="LC Reference">{order.lcOrderReference || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Patient">{`${order.patientName ?? ''} ${order.patientLastName ?? ''}`.trim() || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Email">{order.patientEmail || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Phone">{order.patientPhone || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Address">
                    {[order.patientAddress, order.patientCity, order.patientState, order.patientZip].filter(Boolean).join(', ') || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Created">{new Date(order.createdAt).toLocaleString()}</Descriptions.Item>
                  <Descriptions.Item label="Carrier / Tracking">
                    {order.carrier || '—'} / {order.trackingNumber || '—'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'tests',
            label: `Tests (${tests.length})`,
            children: (
              <Card>
                <Table
                  dataSource={tests as any[]}
                  rowKey={(_, i) => String(i)}
                  pagination={false}
                  columns={[
                    { title: 'Test Code', dataIndex: 'testCode', key: 'testCode' },
                    { title: 'Test Name', dataIndex: 'testName', key: 'testName' },
                  ]}
                />
                <Title level={5} style={{ marginTop: 24 }}>Diagnosis Codes</Title>
                {dxCodes.length === 0 ? (
                  <em>No DX codes</em>
                ) : (
                  <ul>
                    {dxCodes.map((d: any, i: number) => (
                      <li key={i}>{d?.code ?? d}</li>
                    ))}
                  </ul>
                )}
              </Card>
            ),
          },
          {
            key: 'qc',
            label: 'Fulfillment & QC',
            children: (
              <Card>
                <Descriptions column={2} bordered size="small" title="External fulfillment">
                  <Descriptions.Item label="Vendor">{order.externalVendorName || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Vendor Status">
                    {order.externalVendorStatus ? (
                      <Tag color={order.externalVendorStatus === 'shipped' || order.externalVendorStatus === 'in_process' ? 'blue' : 'default'}>
                        {order.externalVendorStatus}
                      </Tag>
                    ) : (
                      '—'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="External Order #">{order.externalOrderRef || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Tracking #">{order.trackingNumber || '—'}</Descriptions.Item>
                </Descriptions>
                <Descriptions column={2} bordered size="small" title="QC" style={{ marginTop: 16 }}>
                  <Descriptions.Item label="QC Status">
                    <Tag color={order.qcStatus === 'FAILED' ? 'red' : order.qcStatus === 'PASSED' ? 'green' : 'default'}>
                      {order.qcStatus || 'PENDING'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Attempt #">{order.qcAttemptCount ?? 0} / 3</Descriptions.Item>
                  <Descriptions.Item label="Permanently Failed">
                    {order.qcPermanentlyFailed === 1 ? <Tag color="red">YES</Tag> : 'No'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Failure Reason" span={2}>
                    {order.qcFailureReason || '—'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'assets',
            label: 'PDF Assets',
            children: (
              <Card>
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {workflow && (
                    <Card size="small" type="inner" title="Asset Generation Workflow">
                      <p><strong>Status:</strong> <Tag color={
                        workflow.status === 'COMPLETED' ? 'green' :
                        workflow.status === 'FAILED' || workflow.status === 'TERMINATED' ? 'red' :
                        workflow.status === 'WAITING_FOR_EVENT' ? 'gold' :
                        'blue'
                      }>{workflow.status}</Tag></p>
                      <p><strong>Current step:</strong> {workflow.currentStep ?? '—'}</p>
                      <p><strong>Progress:</strong> {workflow.stepIndex}/{workflow.totalSteps}</p>
                      {workflow.waitingForEvent && (
                        <p><strong>Waiting for event:</strong> <code>{workflow.waitingForEvent}</code>{workflow.eventWaitExpiresAt ? ` (expires ${new Date(workflow.eventWaitExpiresAt).toLocaleString()})` : ''}</p>
                      )}
                      {workflow.customStatus && (() => {
                        let parsed: any = workflow.customStatus;
                        if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { /* keep string */ } }
                        return (
                          <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 8 }}>
                            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Custom status</div>
                            <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                              {typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed)}
                            </pre>
                          </div>
                        );
                      })()}
                      {workflow.terminatedAt && (
                        <p style={{ color: '#d4380d' }}><strong>Terminated:</strong> {workflow.terminateReason} <em>({new Date(workflow.terminatedAt).toLocaleString()})</em></p>
                      )}
                      {workflow.errorMessage && <p style={{ color: 'red' }}><strong>Error:</strong> {workflow.errorMessage}</p>}
                      <Space style={{ marginTop: 8 }}>
                        {(workflow.status === 'PENDING' || workflow.status === 'RUNNING' || workflow.status === 'WAITING_FOR_EVENT') && (
                          <Button size="small" danger onClick={() => setWfTerminateOpen(true)}>
                            Terminate
                          </Button>
                        )}
                        {(workflow.status === 'PENDING' || workflow.status === 'RUNNING' || workflow.status === 'WAITING_FOR_EVENT') && (
                          <Button size="small" onClick={() => {
                            if (workflow.waitingForEvent) wfEventForm.setFieldValue('eventName', workflow.waitingForEvent);
                            setWfEventOpen(true);
                          }}>
                            Raise Event
                          </Button>
                        )}
                        {(workflow.status === 'COMPLETED' || workflow.status === 'FAILED' || workflow.status === 'TERMINATED') && (
                          <Button size="small" danger type="text" onClick={handleWorkflowPurge}>
                            Purge history
                          </Button>
                        )}
                      </Space>
                    </Card>
                  )}
                  <Card size="small" type="inner" title="Download PDFs">
                    <Space wrap>
                      <Button disabled={!order.trfBlobKey} href={labsApi.trfPdfUrl(id)} target="_blank">TRF</Button>
                      <Button disabled={!order.shippingLabelBlobKey} href={labsApi.shippingLabelPdfUrl(id)} target="_blank">Shipping Label</Button>
                      <Button disabled={!order.returnLabelBlobKey} href={labsApi.returnLabelPdfUrl(id)} target="_blank">Return Label</Button>
                      <Button disabled={!order.stickersBlobKey} href={labsApi.stickersPdfUrl(id)} target="_blank">Stickers</Button>
                      <Button type="primary" disabled={!order.consolidatedAssetsBlobKey} href={labsApi.consolidatedPdfUrl(id)} target="_blank">Consolidated</Button>
                    </Space>
                  </Card>
                </Space>
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="Reject Lab Order"
        open={rejectModal}
        onOk={reject}
        onCancel={() => setRejectModal(false)}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <p>Provide a reason for rejection (min 3 chars):</p>
        <Input.TextArea
          rows={4}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="e.g. Missing dx codes; please re-submit"
        />
      </Modal>

      <Modal
        title="Terminate workflow"
        open={wfTerminateOpen}
        onOk={handleWorkflowTerminate}
        onCancel={() => setWfTerminateOpen(false)}
        okText="Terminate"
        okButtonProps={{ danger: true }}
      >
        <p>This stops the asset-generation workflow. Already-generated assets are kept; pending steps will not run.</p>
        <Input.TextArea
          rows={3}
          value={wfTerminateReason}
          onChange={(e) => setWfTerminateReason(e.target.value)}
          placeholder="Why are you terminating?"
        />
      </Modal>

      <Modal
        title="Raise workflow event"
        open={wfEventOpen}
        onOk={() => wfEventForm.submit()}
        onCancel={() => setWfEventOpen(false)}
        okText="Raise"
      >
        {workflow?.waitingForEvent && (
          <p>
            Workflow is waiting for <code>{workflow.waitingForEvent}</code>. Sending this event resumes execution.
          </p>
        )}
        <Form form={wfEventForm} layout="vertical" onFinish={handleWorkflowRaiseEvent}>
          <Form.Item
            label="Event name"
            name="eventName"
            rules={[{ required: true }]}
            initialValue={workflow?.waitingForEvent ?? ''}
          >
            <Input placeholder="e.g. HUMAN_APPROVAL" />
          </Form.Item>
          <Form.Item label="Payload (optional JSON, ≤16 KB)" name="payload">
            <Input.TextArea rows={4} placeholder='{"approver":"admin","decision":"go"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default LabOrderDetail;
