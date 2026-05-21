import React, { useEffect, useState } from 'react';
import { Button, Card, Modal, Space, Table, Tabs, Tag, Typography, message, Form, Input, InputNumber, Statistic, Row, Col, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const ConsignmentClosets: React.FC = () => {
  const [closets, setClosets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<any>(null);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);

  // Cycle Count state
  const [cycleCountOpen, setCycleCountOpen] = useState(false);
  const [cycleCountLoading, setCycleCountLoading] = useState(false);
  const [cycleCountForm] = Form.useForm();
  const [cycleCountHistory, setCycleCountHistory] = useState<any[]>([]);

  const baseClosetsColumns = [
    { title: 'Department', dataIndex: 'department_name', render: (v: any) => v ?? '-' },
    { title: 'Hospital', dataIndex: 'hospital_id' },
    { title: 'Vendor', dataIndex: 'vendor_id' },
    { title: 'Created', dataIndex: 'created_at', render: (v: any) => v ? new Date(v).toLocaleDateString() : '-' },
  ];
  const baseItemsColumns = [
    { title: 'HCPC', dataIndex: 'hcpc_code' },
    { title: 'Description', dataIndex: 'description' },
    { title: 'PAR', dataIndex: 'par' },
    { title: 'On Hand', dataIndex: 'on_hand' },
  ];
  const baseActivityColumns = [
    { title: 'Type', dataIndex: 'change_type', render: (v: any) => <Tag>{v}</Tag> },
    { title: 'Field', dataIndex: 'field' },
    { title: 'Previous', dataIndex: 'previous_value' },
    { title: 'New', dataIndex: 'new_value' },
    { title: 'Change', dataIndex: 'change' },
    { title: 'When', dataIndex: 'timestamp', render: (v: any) => v ? new Date(v).toLocaleString() : '-' },
  ];
  const baseMetricsColumns = [
    { title: 'Type', dataIndex: 'change_type' },
    { title: 'Count', dataIndex: 'count' },
  ];
  const { columns: closetsColumns, components: closetsComponents } = useResizableColumns(baseClosetsColumns as any[]);
  const { columns: itemsColumns, components: itemsComponents } = useResizableColumns(baseItemsColumns as any[]);
  const { columns: activityColumns, components: activityComponents } = useResizableColumns(baseActivityColumns as any[]);
  const { columns: metricsColumns, components: metricsComponents } = useResizableColumns(baseMetricsColumns as any[]);

  const loadList = async () => {
    setLoading(true);
    try {
      const d = await get<any>('/consignment');
      setClosets(d.items ?? []);
    } catch (err) {
      message.error('Failed to load closets');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadList(); }, []);

  const loadDetail = async (id: string) => {
    setActiveId(id);
    try {
      const [detail, logs, m] = await Promise.all([
        get<any>(`/consignment/${id}`),
        get<any>(`/consignment/${id}/activity-log`),
        get<any>(`/consignment/${id}/usage-metrics`),
      ]);
      setActiveDetail(detail);
      setActivityLog(logs.items ?? []);
      setMetrics(m.metrics ?? []);
    } catch (err) {
      message.error('Failed to load closet details');
    }
  };

  const createCloset = async () => {
    const values = await form.validateFields();
    try {
      await post('/consignment', values);
      message.success('Closet created');
      setCreateOpen(false);
      form.resetFields();
      loadList();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Creation failed');
    }
  };

  const openCycleCount = async () => {
    if (!activeId) { message.warning('Select a closet first'); return; }
    // Reload closet detail to get latest item on-hand counts
    await loadDetail(activeId);
    setCycleCountOpen(true);
    // Pre-fill counted = on_hand (common default — clerk adjusts variance)
    const items = activeDetail?.items ?? [];
    const initialValues: any = {};
    items.forEach((item: any) => { initialValues[`counted_${item.id}`] = item.on_hand ?? 0; });
    cycleCountForm.setFieldsValue(initialValues);
    // Load history
    try {
      const raw: any = await get(`/consignment/${activeId}/cycle-count-history`);
      setCycleCountHistory(raw?.reports ?? []);
    } catch { setCycleCountHistory([]); }
  };

  const submitCycleCount = async () => {
    if (!activeId || !activeDetail?.items?.length) return;
    setCycleCountLoading(true);
    try {
      const values = cycleCountForm.getFieldsValue();
      const counts = (activeDetail.items as any[]).map((item: any) => ({
        itemId: item.id,
        expected: item.on_hand ?? 0,
        counted: Number(values[`counted_${item.id}`] ?? 0),
        reason: values[`reason_${item.id}`] ?? null,
      }));
      await post(`/consignment/${activeId}/cycle-count`, { counts, hospitalVendorId: activeDetail.hospital_vendor_id ?? null });
      message.success('Cycle count submitted');
      setCycleCountOpen(false);
      cycleCountForm.resetFields();
      loadDetail(activeId);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Cycle count failed');
    } finally {
      setCycleCountLoading(false);
    }
  };

  // Summary stats for selected closet
  const totalItems = activeDetail?.items?.length ?? 0;
  const belowPar = (activeDetail?.items ?? []).filter((i: any) => (i.on_hand ?? 0) < (i.par ?? 0)).length;
  const atPar = totalItems - belowPar;

  return (
    <PageWrapper>
      <Title level={3}>Consignment Closets</Title>
      <Tabs
        items={[
          {
            key: 'closets',
            label: 'Closets',
            children: (
              <Card
                extra={
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                    Add Closet
                  </Button>
                }
              >
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={closets}
                  onRow={(r) => ({ onClick: () => loadDetail(r.id) })}
                  columns={closetsColumns}
                  components={closetsComponents}
                />
                {activeDetail && (
                  <Card style={{ marginTop: 16 }} title={`Items in ${activeDetail.department_name ?? 'Closet'}`}>
                    <Table
                      rowKey="id"
                      pagination={false}
                      dataSource={activeDetail.items ?? []}
                      columns={itemsColumns}
                      components={itemsComponents}
                    />
                  </Card>
                )}
              </Card>
            ),
          },
          {
            key: 'activity',
            label: 'Activity Log',
            children: (
              <Table
                rowKey="id"
                dataSource={activityLog}
                columns={activityColumns}
                components={activityComponents}
              />
            ),
          },
          {
            key: 'metrics',
            label: 'Usage Metrics',
            children: (
              <Table
                rowKey="change_type"
                dataSource={metrics}
                columns={metricsColumns}
                components={metricsComponents}
              />
            ),
          },
          {
            key: 'cycle-count',
            label: 'Cycle Count',
            children: (
              <Card
                extra={
                  <Button type="primary" icon={<CheckCircleOutlined />} onClick={openCycleCount} disabled={!activeId}>
                    Start Cycle Count
                  </Button>
                }
              >
                {activeDetail ? (
                  <>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={8}>
                        <Statistic title="Total Items" value={totalItems} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="At or Above PAR" value={atPar} prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="Below PAR" value={belowPar} prefix={<WarningOutlined style={{ color: belowPar > 0 ? '#fa8c16' : '#52c41a' }} />} />
                      </Col>
                    </Row>
                    <Table
                      rowKey="id"
                      pagination={false}
                      dataSource={activeDetail.items ?? []}
                      columns={[
                        { title: 'HCPC', dataIndex: 'hcpc_code' },
                        { title: 'Description', dataIndex: 'description' },
                        { title: 'PAR', dataIndex: 'par' },
                        { title: 'On Hand', dataIndex: 'on_hand',
                          render: (v: number, r: any) => (
                            <Tag color={(v ?? 0) < (r.par ?? 0) ? 'red' : 'green'}>{v ?? 0}</Tag>
                          ),
                        },
                        { title: 'Variance', key: 'variance',
                          render: (_: any, r: any) => {
                            const diff = (r.on_hand ?? 0) - (r.par ?? 0);
                            return <Tag color={diff < 0 ? 'red' : 'green'}>{diff >= 0 ? '+' : ''}{diff}</Tag>;
                          },
                        },
                      ]}
                    />
                  </>
                ) : (
                  <Text type="secondary">Select a closet from the Closets tab to view and start a cycle count.</Text>
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* Create Closet Modal */}
      <Modal title="Create Consignment Closet" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createCloset} okText="Create">
        <Form form={form} layout="vertical">
          <Form.Item name="hospitalId" label="Hospital ID" rules={[{ required: true }]}>
            <Input placeholder="hosp-001" />
          </Form.Item>
          <Form.Item name="vendorId" label="Vendor ID" rules={[{ required: true }]}>
            <Input placeholder="vend-001" />
          </Form.Item>
          <Form.Item name="departmentName" label="Department">
            <Input placeholder="Orthopedics" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Cycle Count Modal */}
      <Modal
        title={`Cycle Count — ${activeDetail?.department_name ?? 'Closet'}`}
        open={cycleCountOpen}
        onCancel={() => setCycleCountOpen(false)}
        onOk={submitCycleCount}
        okText="Submit Count"
        confirmLoading={cycleCountLoading}
        width={700}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Enter the physical counted quantity for each item. On-hand values will be updated to match your count.
        </Text>
        <Form form={cycleCountForm} layout="vertical">
          {(activeDetail?.items ?? []).map((item: any) => (
            <Card key={item.id} size="small" style={{ marginBottom: 8 }}>
              <Row gutter={12} align="middle">
                <Col span={6}><Text strong>{item.hcpc_code}</Text></Col>
                <Col span={7}><Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text></Col>
                <Col span={4}><Text>PAR: {item.par ?? 0} | On Hand: {item.on_hand ?? 0}</Text></Col>
                <Col span={4}>
                  <Form.Item name={`counted_${item.id}`} style={{ marginBottom: 0 }} rules={[{ required: true }]}>
                    <InputNumber min={0} placeholder="Count" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={3}>
                  <Form.Item name={`reason_${item.id}`} style={{ marginBottom: 0 }}>
                    <Input placeholder="Reason" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}
        </Form>
      </Modal>
    </PageWrapper>
  );
};

export default ConsignmentClosets;
