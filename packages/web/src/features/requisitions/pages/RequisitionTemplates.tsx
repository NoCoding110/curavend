/**
 * Requisition templates — reusable carts.
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Row,
  Col,
  Divider,
} from 'antd';
import { PlusOutlined, DeleteOutlined, RocketOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { requisitionTemplatesApi, REQUISITION_PRIORITIES, type RequisitionTemplate, type RequisitionTemplateItem } from '../../../api/requisitions';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

export const RequisitionTemplates: React.FC = () => {
  const nav = useNavigate();
  const [rows, setRows] = useState<RequisitionTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<(RequisitionTemplate & { items: RequisitionTemplateItem[] }) | null>(null);
  const [createForm] = Form.useForm();
  const [draftItems, setDraftItems] = useState<any[]>([]);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await requisitionTemplatesApi.list();
      setRows(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); }, []);

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ defaultPriority: 'NORMAL' });
    setDraftItems([]);
    setCreateOpen(true);
  };
  const addDraftLine = () => setDraftItems((arr) => [...arr, { hcpcCode: '', description: '', defaultQuantity: 1 }]);
  const updateDraftLine = (idx: number, k: string, v: any) =>
    setDraftItems((arr) => arr.map((l, i) => (i === idx ? { ...l, [k]: v } : l)));
  const removeDraftLine = (idx: number) =>
    setDraftItems((arr) => arr.filter((_, i) => i !== idx));

  const submit = async () => {
    try {
      const v = await createForm.validateFields();
      const items = draftItems
        .filter((l) => l.hcpcCode && l.description)
        .map((l) => ({
          hcpcCode: String(l.hcpcCode).toUpperCase(),
          description: l.description,
          defaultQuantity: Number(l.defaultQuantity ?? 1),
          notes: l.notes,
        }));
      if (items.length === 0) {
        message.warning('Add at least one item');
        return;
      }
      await requisitionTemplatesApi.create({ ...v, items });
      message.success('Template created');
      setCreateOpen(false);
      void fetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const r = await requisitionTemplatesApi.get(id);
      setDetail(r);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const instantiate = async (tplId: string) => {
    try {
      const r = await requisitionTemplatesApi.instantiate(tplId);
      message.success(`Created ${r.requisitionNumber}`);
      nav('/requisitions');
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const remove = async (id: string) => {
    try {
      await requisitionTemplatesApi.remove(id);
      message.success('Template deactivated');
      void fetch();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  return (
    <PageWrap>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Requisition templates</Title>
          <Text type="secondary">Reusable carts for recurring restocks — pick one, tweak quantities, spawn a fresh draft.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New template</Button>
      </Space>

      <Card size="small">
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={[
            { title: 'Name', dataIndex: 'name', render: (v, r) => <a onClick={() => openDetail(r.id)}><strong>{v}</strong></a> },
            { title: 'Category', dataIndex: 'category', width: 140 },
            { title: 'Priority', dataIndex: 'defaultPriority', width: 100, render: (v: string) => <Tag>{v}</Tag> },
            { title: 'Times used', dataIndex: 'timesUsed', width: 110 },
            {
              title: '',
              width: 200,
              render: (_, r) => (
                <Space>
                  <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => instantiate(r.id)}>
                    Instantiate
                  </Button>
                  <Popconfirm title="Deactivate template?" onConfirm={() => remove(r.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          pagination={{ pageSize: 25 }}
        />
      </Card>

      <Modal
        title="New requisition template"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={submit}
        okText="Create"
        width={820}
      >
        <Form form={createForm} layout="vertical">
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input placeholder="e.g. OR Daily Restock" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="category" label="Category"><Input placeholder="e.g. OR" /></Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="defaultPriority" label="Priority">
                <Select options={REQUISITION_PRIORITIES.map((p) => ({ value: p, label: p }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Divider>Items</Divider>
          <Space direction="vertical" style={{ width: '100%' }}>
            {draftItems.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items" />
            ) : (
              draftItems.map((l, idx) => (
                <Row key={idx} gutter={8}>
                  <Col span={4}><Input placeholder="HCPC" value={l.hcpcCode} onChange={(e) => updateDraftLine(idx, 'hcpcCode', e.target.value)} /></Col>
                  <Col span={12}><Input placeholder="Description" value={l.description} onChange={(e) => updateDraftLine(idx, 'description', e.target.value)} /></Col>
                  <Col span={3}><InputNumber placeholder="Qty" min={1} style={{ width: '100%' }} value={l.defaultQuantity} onChange={(v) => updateDraftLine(idx, 'defaultQuantity', v)} /></Col>
                  <Col span={4}><Input placeholder="Notes" value={l.notes} onChange={(e) => updateDraftLine(idx, 'notes', e.target.value)} /></Col>
                  <Col span={1}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeDraftLine(idx)} /></Col>
                </Row>
              ))
            )}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addDraftLine} block>Add line</Button>
          </Space>
        </Form>
      </Modal>

      <Drawer title={detail?.name ?? ''} open={!!detail} onClose={() => setDetail(null)} width={620}>
        {detail && (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              {detail.category ? <Tag color="blue">{detail.category}</Tag> : null}
              <Tag>{detail.defaultPriority}</Tag>
              <Tag>Used {detail.timesUsed}× </Tag>
            </Space>
            {detail.description && <Paragraph>{detail.description}</Paragraph>}
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detail.items}
              columns={[
                { title: 'HCPC', dataIndex: 'hcpcCode', width: 90 },
                { title: 'Description', dataIndex: 'description' },
                { title: 'Default qty', dataIndex: 'defaultQuantity', width: 110 },
              ]}
            />
            <Button type="primary" icon={<RocketOutlined />} block style={{ marginTop: 16 }} onClick={() => instantiate(detail.id)}>
              Instantiate as requisition
            </Button>
          </>
        )}
      </Drawer>
    </PageWrap>
  );
};

// Tiny local Paragraph helper to avoid circular destructure pitfalls
const Paragraph: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Typography.Paragraph>{children}</Typography.Paragraph>
);

export default RequisitionTemplates;
