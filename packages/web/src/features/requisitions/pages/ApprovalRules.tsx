/**
 * Approval routing rules — list / create / edit / preview.
 *
 * Each rule pairs `(triggerType, conditions JSON)` with `(approver descriptor)`.
 * Lower priority = evaluated first. The first matching rule routes the object.
 */
import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ExperimentOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import {
  approvalRulesApi,
  APPROVAL_RULE_TRIGGERS,
  type ApprovalRule,
} from '../../../api/requisitions';
import { get } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const PageWrap = styled.div`padding: 24px;`;

interface UserOption {
  id: string;
  name: string;
  email: string;
}

export const ApprovalRulesPage: React.FC = () => {
  const [rules, setRules] = useState<ApprovalRule[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [trigger, setTrigger] = useState<string>('REQUISITION');
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState<ApprovalRule | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [form] = Form.useForm();
  const [previewForm] = Form.useForm();
  const [previewResult, setPreviewResult] = useState<any[]>([]);

  const fetch = async () => {
    setLoading(true);
    try {
      const r = await approvalRulesApi.list({ triggerType: trigger });
      setRules(r.items ?? []);
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void fetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [trigger]);

  useEffect(() => {
    (async () => {
      try {
        const [u, g] = await Promise.all([
          get<{ items: UserOption[] }>('/users'),
          get<{ items: Array<{ id: string; name: string }> }>('/user-groups'),
        ]);
        setUsers(u.items ?? []);
        setGroups(g.items ?? []);
      } catch (err) { /* noop */ }
    })();
  }, []);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      triggerType: trigger,
      priority: 100,
      isActive: true,
      isTerminal: true,
      approverType: 'USER',
    });
    setCreateOpen(true);
  };

  const openEdit = (rule: ApprovalRule) => {
    const cond = JSON.parse(rule.conditionsJson ?? '{}');
    const apv = JSON.parse(rule.approverJson ?? '{}');
    form.setFieldsValue({
      name: rule.name,
      description: rule.description,
      triggerType: rule.triggerType,
      priority: rule.priority,
      isActive: rule.isActive === 1,
      isTerminal: rule.isTerminal === 1,
      // conditions
      amountGteUsd: cond.amountGteUsd,
      amountLtUsd: cond.amountLtUsd,
      priorityAny: cond.priority,
      containsOffFormulary: cond.containsOffFormulary,
      containsRestricted: cond.containsRestricted,
      containsPriorAuth: cond.containsPriorAuth,
      // approver
      approverType: apv.type,
      approverId: apv.id,
    });
    setEditOpen(rule);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      const conditions: any = {};
      if (v.amountGteUsd != null) conditions.amountGteUsd = v.amountGteUsd;
      if (v.amountLtUsd != null) conditions.amountLtUsd = v.amountLtUsd;
      if (v.priorityAny?.length) conditions.priority = v.priorityAny;
      if (v.containsOffFormulary) conditions.containsOffFormulary = true;
      if (v.containsRestricted) conditions.containsRestricted = true;
      if (v.containsPriorAuth) conditions.containsPriorAuth = true;

      const approver = { type: v.approverType, id: v.approverId };
      const payload = {
        name: v.name,
        description: v.description,
        triggerType: v.triggerType,
        priority: v.priority,
        isActive: v.isActive,
        isTerminal: v.isTerminal,
        conditions,
        approver,
      };
      if (editOpen) {
        await approvalRulesApi.update(editOpen.id, payload);
        message.success('Rule updated');
        setEditOpen(null);
      } else {
        await approvalRulesApi.create(payload);
        message.success('Rule created');
        setCreateOpen(false);
      }
      void fetch();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const remove = async (id: string) => {
    try {
      await approvalRulesApi.remove(id);
      message.success('Deleted');
      void fetch();
    } catch (err: any) {
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  const runPreview = async () => {
    try {
      const v = await previewForm.validateFields();
      const r = await approvalRulesApi.preview({
        triggerType: v.triggerType,
        sample: {
          amountUsd: v.amountUsd ?? 0,
          priority: v.priority ?? 'NORMAL',
          containsOffFormulary: v.containsOffFormulary,
          containsRestricted: v.containsRestricted,
          containsPriorAuth: v.containsPriorAuth,
        },
      });
      setPreviewResult(r.approvers ?? []);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error ?? 'Failed');
    }
  };

  return (
    <PageWrap>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Approval routing rules</Title>
          <Text type="secondary">
            Declarative engine that picks the right approver based on amount, priority, off-formulary status, and more.
          </Text>
        </div>
        <Space>
          <Select
            style={{ width: 180 }}
            value={trigger}
            onChange={setTrigger}
            options={APPROVAL_RULE_TRIGGERS.map((t) => ({ value: t, label: t }))}
          />
          <Button icon={<ExperimentOutlined />} onClick={() => { previewForm.setFieldsValue({ triggerType: trigger }); setPreviewOpen(true); setPreviewResult([]); }}>
            Preview
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add rule</Button>
        </Space>
      </Space>

      <Card size="small">
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rules}
          columns={[
            { title: 'Priority', dataIndex: 'priority', width: 80, sorter: (a, b) => a.priority - b.priority },
            { title: 'Name', dataIndex: 'name', render: (v, r) => <a onClick={() => openEdit(r)}>{v}</a> },
            {
              title: 'Conditions',
              render: (_, r) => {
                const c = JSON.parse(r.conditionsJson ?? '{}');
                const bits: string[] = [];
                if (c.amountGteUsd != null) bits.push(`≥ $${c.amountGteUsd}`);
                if (c.amountLtUsd != null) bits.push(`< $${c.amountLtUsd}`);
                if (c.priority?.length) bits.push(`Priority ${c.priority.join('/')}`);
                if (c.containsOffFormulary) bits.push('Off-formulary');
                if (c.containsRestricted) bits.push('Restricted');
                if (c.containsPriorAuth) bits.push('PA');
                return bits.length ? bits.join(' · ') : <Text type="secondary">Always matches</Text>;
              },
            },
            {
              title: 'Approver',
              width: 240,
              render: (_, r) => {
                const a = JSON.parse(r.approverJson ?? '{}');
                if (a.type === 'USER') {
                  const u = users.find((x) => x.id === a.id);
                  return <Tag color="blue">{u?.name ?? a.id}</Tag>;
                }
                if (a.type === 'GROUP') {
                  const g = groups.find((x) => x.id === a.id);
                  return <Tag color="purple">Group: {g?.name ?? a.id}</Tag>;
                }
                return <Tag>Role: {a.id}</Tag>;
              },
            },
            {
              title: 'Active',
              dataIndex: 'isActive',
              width: 80,
              render: (v: number) => (v ? <Tag color="green">ON</Tag> : <Tag>OFF</Tag>),
            },
            {
              title: '',
              width: 80,
              render: (_, r) => (
                <Space>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                  <Popconfirm title="Delete?" onConfirm={() => remove(r.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          pagination={false}
        />
      </Card>

      {/* ── Create / Edit drawer ───────────────────────────────────── */}
      <Drawer
        title={editOpen ? `Edit rule: ${editOpen.name}` : 'New approval rule'}
        open={createOpen || !!editOpen}
        onClose={() => { setCreateOpen(false); setEditOpen(null); }}
        width={560}
        extra={
          <Space>
            <Button onClick={() => { setCreateOpen(false); setEditOpen(null); }}>Cancel</Button>
            <Button type="primary" onClick={submit}>{editOpen ? 'Save' : 'Create'}</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. High-value requisitions need Director" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="triggerType" label="Trigger" style={{ width: 160 }}>
              <Select options={APPROVAL_RULE_TRIGGERS.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
            <Form.Item name="priority" label="Priority" style={{ width: 110 }} tooltip="Lower = evaluated first">
              <InputNumber min={1} max={9999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="isTerminal" label="Terminal" valuePropName="checked" tooltip="Stop evaluating after this match"><Switch /></Form.Item>
          </Space>
          <Card size="small" title="Conditions" style={{ marginBottom: 12 }}>
            <Space style={{ width: '100%' }} direction="vertical">
              <Space>
                <Form.Item name="amountGteUsd" label="Amount ≥ $" style={{ marginBottom: 8 }}>
                  <InputNumber min={0} step={100} />
                </Form.Item>
                <Form.Item name="amountLtUsd" label="Amount < $" style={{ marginBottom: 8 }}>
                  <InputNumber min={0} step={100} />
                </Form.Item>
              </Space>
              <Form.Item name="priorityAny" label="Priority is any of" style={{ marginBottom: 8 }}>
                <Select
                  mode="multiple"
                  allowClear
                  options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: p }))}
                />
              </Form.Item>
              <Space wrap>
                <Form.Item name="containsOffFormulary" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch /> <Text style={{ marginLeft: 4 }}>Contains off-formulary</Text>
                </Form.Item>
                <Form.Item name="containsRestricted" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch /> <Text style={{ marginLeft: 4 }}>Contains restricted</Text>
                </Form.Item>
                <Form.Item name="containsPriorAuth" valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Switch /> <Text style={{ marginLeft: 4 }}>Requires prior auth</Text>
                </Form.Item>
              </Space>
            </Space>
          </Card>
          <Card size="small" title="Approver">
            <Space style={{ width: '100%' }}>
              <Form.Item name="approverType" label="Type" style={{ width: 130 }}>
                <Select options={[{ value: 'USER', label: 'User' }, { value: 'GROUP', label: 'Group' }, { value: 'ROLE', label: 'Role' }]} />
              </Form.Item>
              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const t = getFieldValue('approverType');
                  if (t === 'USER') {
                    return (
                      <Form.Item name="approverId" label="User" rules={[{ required: true }]} style={{ flex: 1, minWidth: 300 }}>
                        <Select showSearch optionFilterProp="label" options={users.map((u) => ({ value: u.id, label: `${u.name} <${u.email}>` }))} />
                      </Form.Item>
                    );
                  }
                  if (t === 'GROUP') {
                    return (
                      <Form.Item name="approverId" label="Group" rules={[{ required: true }]} style={{ flex: 1, minWidth: 300 }}>
                        <Select showSearch optionFilterProp="label" options={groups.map((g) => ({ value: g.id, label: g.name }))} />
                      </Form.Item>
                    );
                  }
                  return (
                    <Form.Item name="approverId" label="Role" rules={[{ required: true }]} style={{ flex: 1, minWidth: 300 }}>
                      <Input placeholder="e.g. FACILITY_ACCOUNT_MANAGER" />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Space>
          </Card>
        </Form>
      </Drawer>

      {/* ── Preview drawer ─────────────────────────────────────────── */}
      <Drawer
        title="Preview routing"
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        width={520}
      >
        <Paragraph type="secondary">
          Enter a sample requisition shape and see which rules match (in evaluation order).
        </Paragraph>
        <Form form={previewForm} layout="vertical">
          <Form.Item name="triggerType" label="Trigger"><Select options={APPROVAL_RULE_TRIGGERS.map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="amountUsd" label="Amount $"><InputNumber min={0} step={100} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="priority" label="Priority">
            <Select options={['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="containsOffFormulary" valuePropName="checked"><Switch /> <Text style={{ marginLeft: 4 }}>Off-formulary</Text></Form.Item>
            <Form.Item name="containsRestricted" valuePropName="checked"><Switch /> <Text style={{ marginLeft: 4 }}>Restricted</Text></Form.Item>
            <Form.Item name="containsPriorAuth" valuePropName="checked"><Switch /> <Text style={{ marginLeft: 4 }}>PA</Text></Form.Item>
          </Space>
          <Button type="primary" onClick={runPreview}>Run preview</Button>
        </Form>
        {previewResult.length > 0 ? (
          <>
            <Title level={5} style={{ marginTop: 16 }}>Matched approvers</Title>
            {previewResult.map((a, i) => {
              if (a.type === 'USER') {
                const u = users.find((x) => x.id === a.id);
                return <Tag key={i} color="blue">{u?.name ?? a.id}</Tag>;
              }
              if (a.type === 'GROUP') {
                const g = groups.find((x) => x.id === a.id);
                return <Tag key={i} color="purple">Group: {g?.name ?? a.id}</Tag>;
              }
              return <Tag key={i}>Role: {a.id}</Tag>;
            })}
          </>
        ) : null}
      </Drawer>
    </PageWrap>
  );
};

export default ApprovalRulesPage;
