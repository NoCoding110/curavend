/**
 * SKU group management — vendor-only page. List groups, create/edit, attach
 * SKUs as variants.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Tag,
  message,
  Popconfirm,
  Drawer,
  Descriptions,
  Image,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { skuGroupsApi, type SkuGroup, type SkuGroupDetail } from '../../../api/skuGroups';
import { useUserRoles } from '../../../hooks/useUserRoles';

const { Title, Text } = Typography;
const PageWrap = styled.div`padding: 24px;`;

const SkuGroups: React.FC = () => {
  const { isAdmin, isVendor, userData } = useUserRoles();
  const [items, setItems] = useState<SkuGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SkuGroup | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SkuGroupDetail | null>(null);
  const [form] = Form.useForm();

  const canWrite = isAdmin || isVendor;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await skuGroupsApi.list({ limit: 200 });
      setItems(resp.items ?? []);
    } catch (err: any) {
      message.error(`Failed to load: ${err?.response?.data?.error ?? err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setEditorOpen(true);
  };
  const openEdit = (row: SkuGroup) => {
    setEditing(row);
    let salient: string[] = [];
    try { if (row.salientFeatures) salient = JSON.parse(row.salientFeatures); } catch { /* ignore */ }
    form.setFieldsValue({
      groupName: row.groupName,
      tagline: row.tagline,
      longDescription: row.longDescription,
      brandManufacturer: row.brandManufacturer,
      coverImageUrl: row.coverImageUrl,
      datasheetUrl: row.datasheetUrl,
      ifuUrl: row.ifuUrl,
      msdsUrl: row.msdsUrl,
      videoUrl: row.videoUrl,
      salientFeaturesText: salient.join('\n'),
    });
    setEditorOpen(true);
  };

  const openDetail = async (id: string) => {
    setDetail(null);
    setDetailOpen(true);
    try {
      const d = await skuGroupsApi.get(id);
      setDetail(d);
    } catch (err: any) {
      message.error(`Could not load: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  const handleSave = async () => {
    let values: any;
    try { values = await form.validateFields(); } catch { return; }
    const salient = (values.salientFeaturesText ?? '')
      .split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
    const payload = {
      groupName: values.groupName,
      tagline: values.tagline,
      longDescription: values.longDescription,
      brandManufacturer: values.brandManufacturer,
      coverImageUrl: values.coverImageUrl,
      datasheetUrl: values.datasheetUrl,
      ifuUrl: values.ifuUrl,
      msdsUrl: values.msdsUrl,
      videoUrl: values.videoUrl,
      salientFeatures: salient.length ? salient : undefined,
    };
    try {
      if (editing) {
        await skuGroupsApi.update(editing.id, payload);
        message.success('Group updated');
      } else {
        await skuGroupsApi.create({ ...payload, vendorId: userData?.vendorId ?? undefined });
        message.success('Group created');
      }
      setEditorOpen(false);
      form.resetFields();
      await load();
    } catch (err: any) {
      message.error(`Save failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  const handleDelete = async (row: SkuGroup) => {
    try {
      await skuGroupsApi.delete(row.id);
      message.success('Deleted');
      await load();
    } catch (err: any) {
      message.error(`Delete failed: ${err?.response?.data?.error ?? err.message}`);
    }
  };

  return (
    <PageWrap>
      <Card style={{ marginBottom: 16 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>SKU Groups</Title>
            <Text type="secondary">Marketing parent for product variants</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} />
            {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New group</Button>}
          </Space>
        </Space>
      </Card>

      <Card>
        <Table<SkuGroup>
          loading={loading}
          dataSource={items}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          columns={[
            { title: 'Group Name', dataIndex: 'groupName', render: (v) => <Text strong>{v}</Text> },
            { title: 'Tagline', dataIndex: 'tagline', render: (v) => v ?? <Text type="secondary">—</Text> },
            { title: 'Brand', dataIndex: 'brandManufacturer', width: 160, render: (v) => v ?? '—' },
            { title: 'Active', dataIndex: 'isActive', width: 80, align: 'center', render: (n) => <Tag color={n ? 'green' : 'default'}>{n ? 'Yes' : 'No'}</Tag> },
            {
              title: '', width: 180,
              render: (_, r) => (
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>View</Button>
                  {canWrite && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />}
                  {canWrite && (
                    <Popconfirm title="Delete this group? Detach SKUs first." onConfirm={() => handleDelete(r)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
          locale={{ emptyText: 'No SKU groups yet.' }}
        />
      </Card>

      {/* Editor modal */}
      <Modal
        title={editing ? `Edit "${editing.groupName}"` : 'New SKU group'}
        open={editorOpen}
        onCancel={() => { setEditorOpen(false); form.resetFields(); }}
        onOk={handleSave}
        width={680}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="groupName" label="Group name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. ProBrace Elite XYZ" />
          </Form.Item>
          <Form.Item name="tagline" label="Tagline" tooltip="One-line marketing description.">
            <Input placeholder="Premium knee orthotic for sport" />
          </Form.Item>
          <Form.Item name="longDescription" label="Long description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="brandManufacturer" label="Brand / Manufacturer">
            <Input />
          </Form.Item>
          <Form.Item name="salientFeaturesText" label="Salient features (one per line)">
            <Input.TextArea rows={3} placeholder={'Adjustable straps\nLightweight aluminum\nSizes S/M/L/XL'} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="coverImageUrl" label="Cover image URL" style={{ flex: 1 }}>
              <Input placeholder="https://…" />
            </Form.Item>
            <Form.Item name="videoUrl" label="Video URL" style={{ flex: 1 }}>
              <Input placeholder="https://…" />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="datasheetUrl" label="Datasheet URL" style={{ flex: 1 }}>
              <Input placeholder="https://…" />
            </Form.Item>
            <Form.Item name="ifuUrl" label="IFU URL" style={{ flex: 1 }}>
              <Input placeholder="https://…" />
            </Form.Item>
            <Form.Item name="msdsUrl" label="MSDS URL" style={{ flex: 1 }}>
              <Input placeholder="https://…" />
            </Form.Item>
          </Space.Compact>
        </Form>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        title={detail?.groupName ?? 'SKU group'}
        width={640}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      >
        {detail ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {detail.coverImageUrl && (
              <Image src={detail.coverImageUrl} alt={detail.groupName} style={{ maxHeight: 220 }} fallback="" />
            )}
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Tagline">{detail.tagline ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Description">{detail.longDescription ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Brand">{detail.brandManufacturer ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Datasheet">
                {detail.datasheetUrl ? <a href={detail.datasheetUrl} target="_blank" rel="noreferrer">{detail.datasheetUrl}</a> : '—'}
              </Descriptions.Item>
            </Descriptions>
            <div>
              <Text strong>Child SKUs ({detail.skus.length})</Text>
              <Table
                size="small"
                pagination={false}
                dataSource={detail.skus}
                rowKey="id"
                columns={[
                  { title: 'Vendor SKU', dataIndex: 'vendorSku', width: 200 },
                  { title: 'HCPC', dataIndex: 'hcpcCode', width: 100 },
                  { title: 'Description', dataIndex: 'description' },
                  { title: 'Variant', dataIndex: 'variantAttributes', render: (v) => v ? <Tag>{v}</Tag> : '—' },
                ]}
              />
            </div>
          </Space>
        ) : <Text type="secondary">Loading…</Text>}
      </Drawer>
    </PageWrap>
  );
};

export default SkuGroups;
