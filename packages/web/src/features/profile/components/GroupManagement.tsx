/**
 * GroupManagement — UI card for managing user groups within a tenant.
 *
 * Mounted inside the Settings page. Mirrors the visual style of the
 * existing User Management card.
 *
 * Three tabs in the edit drawer:
 *   - Members:        searchable user multi-select; add/remove
 *   - Permissions:    reuses PermissionsMatrix with a group-target adapter
 *   - Notifications:  read-only list of `notification_preferences` rows that
 *                     route to this group + a button to add a new route
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  TeamOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType } from 'antd/es/table';
import { usersApi } from '../../../api/users';
import {
  userGroupsApi,
  USER_GROUP_KINDS,
  type UserGroup,
  type UserGroupDetail,
  type UserGroupKind,
} from '../../../api/userGroups';
import { useGroupsInMyTenant, useGroupDetail } from '../../../hooks/useGroups';
import { PermissionsMatrix, type PermissionsAdapter } from '../../hospitalManagement/components/PermissionsMatrix';

const { Title, Text, Paragraph } = Typography;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

const KIND_LABEL: Record<UserGroupKind, string> = {
  PERMISSION_BUNDLE: 'Permission bundle',
  SCOPED_TEAM: 'Scoped team',
  NOTIFICATION_ROUTE: 'Notification route',
  COMPOSITE: 'Composite',
};

const KIND_COLOR: Record<UserGroupKind, string> = {
  PERMISSION_BUNDLE: 'blue',
  SCOPED_TEAM: 'purple',
  NOTIFICATION_ROUTE: 'orange',
  COMPOSITE: 'default',
};

export const GroupManagement: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const { groups, loading, error, refetch } = useGroupsInMyTenant(refreshToken);

  const handleDelete = useCallback(
    async (g: UserGroup) => {
      try {
        await userGroupsApi.remove(g.id);
        message.success(`Group "${g.name}" deleted`);
        refetch();
      } catch (err: any) {
        message.error(err?.response?.data?.message || err?.message || 'Failed to delete group');
      }
    },
    [refetch],
  );

  const columns: ColumnsType<UserGroup> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {row.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Kind',
      dataIndex: 'groupKind',
      key: 'groupKind',
      width: 160,
      render: (k: UserGroupKind, row) => (
        <Space size={4}>
          <Tag color={KIND_COLOR[k]}>{KIND_LABEL[k]}</Tag>
          {row.isSystemDefault && <Tag color="gold">Default</Tag>}
        </Space>
      ),
    },
    {
      title: 'Scope',
      key: 'scope',
      width: 220,
      render: (_: unknown, row) => {
        const bits: string[] = [];
        if (row.facilityId) bits.push(`Facility ${row.facilityId.slice(0, 6)}…`);
        if (row.departmentId) bits.push(`Dept ${row.departmentId.slice(0, 6)}…`);
        if (row.vendorLocationId) bits.push(`Location ${row.vendorLocationId.slice(0, 6)}…`);
        if (bits.length === 0) return <Text type="secondary">All</Text>;
        return <Text type="secondary">{bits.join(' · ')}</Text>;
      },
    },
    {
      title: '# Members',
      dataIndex: 'memberCount',
      key: 'memberCount',
      width: 100,
      align: 'right',
      render: (n: number) => n ?? 0,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_: unknown, row) => (
        <Space>
          <Tooltip title="Open">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setEditingId(row.id)} />
          </Tooltip>
          <Popconfirm
            title={row.isSystemDefault ? 'System-default groups cannot be deleted.' : `Delete "${row.name}"?`}
            disabled={row.isSystemDefault}
            onConfirm={() => handleDelete(row)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title={row.isSystemDefault ? 'Default group — cannot delete' : 'Delete'}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={row.isSystemDefault} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <SectionCard
        title={
          <Space>
            <TeamOutlined />
            <span>User Groups</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Add Group
          </Button>
        }
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Bundle permissions, scope users to a sub-org (facility / department / vendor location), and target
          notifications to a named team. Members inherit the group's permissions on top of their own.
        </Paragraph>
        {error && (
          <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
            {error}
          </Text>
        )}
        <Table<UserGroup>
          rowKey="id"
          dataSource={groups}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No groups yet — click "Add Group" to create one.' }}
        />
      </SectionCard>

      {createOpen && (
        <CreateGroupModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refetch();
          }}
        />
      )}

      <Drawer
        title="Group details"
        open={editingId != null}
        onClose={() => setEditingId(null)}
        width={720}
        destroyOnClose
      >
        {editingId && <GroupDetailDrawer groupId={editingId} onChanged={refetch} />}
      </Drawer>
    </>
  );
};

// ─── Create modal ──────────────────────────────────────────────────────────

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onCreated }) => {
  const [form] = Form.useForm<{
    name: string;
    description?: string;
    groupKind: UserGroupKind;
  }>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    let values: { name: string; description?: string; groupKind: UserGroupKind };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await userGroupsApi.create(values);
      message.success(`Group "${values.name}" created`);
      onCreated();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Add Group"
      open
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Create"
      confirmLoading={submitting}
    >
      <Form layout="vertical" form={form} initialValues={{ groupKind: 'COMPOSITE' as UserGroupKind }}>
        <Form.Item
          name="name"
          label="Group name"
          rules={[{ required: true, message: 'Group name is required' }]}
        >
          <Input placeholder="e.g. Boston Procurement Team" autoFocus />
        </Form.Item>
        <Form.Item name="description" label="Description (optional)">
          <Input.TextArea rows={2} placeholder="What this group is used for" />
        </Form.Item>
        <Form.Item name="groupKind" label="Kind">
          <Select>
            {USER_GROUP_KINDS.map((k) => (
              <Select.Option key={k} value={k}>
                {KIND_LABEL[k]}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

// ─── Detail drawer (3 tabs) ────────────────────────────────────────────────

interface GroupDetailDrawerProps {
  groupId: string;
  onChanged: () => void;
}

const GroupDetailDrawer: React.FC<GroupDetailDrawerProps> = ({ groupId, onChanged }) => {
  const [refreshToken, setRefreshToken] = useState(0);
  const { detail, loading, error, refetch } = useGroupDetail(groupId, refreshToken);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm] = Form.useForm<{ name: string; description?: string; groupKind: UserGroupKind }>();

  useEffect(() => {
    if (detail) {
      metaForm.setFieldsValue({
        name: detail.name,
        description: detail.description ?? '',
        groupKind: detail.groupKind,
      });
    }
  }, [detail, metaForm]);

  const saveMeta = async () => {
    let values: { name: string; description?: string; groupKind: UserGroupKind };
    try {
      values = await metaForm.validateFields();
    } catch {
      return;
    }
    try {
      await userGroupsApi.update(groupId, values);
      message.success('Group updated');
      setEditingMeta(false);
      setRefreshToken((n) => n + 1);
      onChanged();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to update group');
    }
  };

  const adapter: PermissionsAdapter = {
    subjectLabel: 'Group',
    async load() {
      const resp = await userGroupsApi.getPermissions(groupId);
      return { effective: resp.permissions, subjectMeta: detail?.name ?? '' };
    },
    async save(body) {
      const resp = await userGroupsApi.updatePermissions(groupId, body);
      return resp.permissions;
    },
  };

  if (loading && !detail) return <Text type="secondary">Loading…</Text>;
  if (error) return <Text type="danger">{error}</Text>;
  if (!detail) return null;

  return (
    <>
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
        {editingMeta ? (
          <Form form={metaForm} layout="vertical">
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="groupKind" label="Kind">
              <Select>
                {USER_GROUP_KINDS.map((k) => (
                  <Select.Option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Space>
              <Button type="primary" onClick={saveMeta}>
                Save
              </Button>
              <Button onClick={() => setEditingMeta(false)}>Cancel</Button>
            </Space>
          </Form>
        ) : (
          <>
            <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
              <Title level={4} style={{ margin: 0 }}>
                {detail.name}{' '}
                <Tag color={KIND_COLOR[detail.groupKind]} style={{ marginLeft: 4 }}>
                  {KIND_LABEL[detail.groupKind]}
                </Tag>
                {detail.isSystemDefault && <Tag color="gold">Default</Tag>}
              </Title>
              <Button icon={<EditOutlined />} onClick={() => setEditingMeta(true)} size="small">
                Edit
              </Button>
            </Space>
            {detail.description && <Text type="secondary">{detail.description}</Text>}
          </>
        )}
      </Space>

      <Tabs
        defaultActiveKey="members"
        items={[
          {
            key: 'members',
            label: `Members (${detail.members.length})`,
            children: (
              <MembersTab
                detail={detail}
                onChanged={() => {
                  setRefreshToken((n) => n + 1);
                  onChanged();
                }}
              />
            ),
          },
          {
            key: 'permissions',
            label: 'Permissions',
            children: <PermissionsMatrix adapter={adapter} />,
          },
        ]}
      />
    </>
  );
};

// ─── Members tab ──────────────────────────────────────────────────────────

interface MembersTabProps {
  detail: UserGroupDetail;
  onChanged: () => void;
}

const MembersTab: React.FC<MembersTabProps> = ({ detail, onChanged }) => {
  const [adding, setAdding] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>(
    [],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load all users in the caller's tenant when the picker opens.
  useEffect(() => {
    if (!adding) return;
    let cancelled = false;
    usersApi
      .list({ page: 1, limit: 100 })
      .then((resp: any) => {
        if (cancelled) return;
        const list = (resp.users ?? resp.items ?? resp).map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }));
        // Exclude users already in the group.
        const memberIds = new Set(detail.members.map((m) => m.userId));
        setCandidateUsers(list.filter((u: { id: string }) => !memberIds.has(u.id)));
      })
      .catch((err: any) => {
        message.error(err?.response?.data?.message || err?.message || 'Failed to load users');
      });
    return () => {
      cancelled = true;
    };
  }, [adding, detail.members]);

  const handleAdd = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      await userGroupsApi.addMembers(detail.id, selectedIds);
      message.success(`${selectedIds.length} member(s) added`);
      setAdding(false);
      setSelectedIds([]);
      onChanged();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to add members');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await userGroupsApi.removeMember(detail.id, userId);
      message.success('Member removed');
      onChanged();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to remove member');
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<UsergroupAddOutlined />} onClick={() => setAdding(true)} type="primary">
          Add members
        </Button>
      </Space>

      <Table
        rowKey="userId"
        dataSource={detail.members}
        pagination={{ pageSize: 8 }}
        size="small"
        locale={{ emptyText: 'No members yet.' }}
        columns={[
          { title: 'Name', dataIndex: 'name', render: (v: string | null) => v || '—' },
          { title: 'Email', dataIndex: 'email', render: (v: string | null) => v || '—' },
          { title: 'Role', dataIndex: 'role', render: (v: string | null) => v && <Tag>{v}</Tag> },
          {
            title: 'Actions',
            width: 90,
            render: (_: unknown, row: any) => (
              <Popconfirm title={`Remove ${row.name || row.email}?`} onConfirm={() => handleRemove(row.userId)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Modal
        title="Add members"
        open={adding}
        onCancel={() => {
          setAdding(false);
          setSelectedIds([]);
        }}
        onOk={handleAdd}
        confirmLoading={submitting}
        okText="Add"
        okButtonProps={{ disabled: selectedIds.length === 0 }}
      >
        <Text type="secondary">Pick one or more users in your tenant to add.</Text>
        <Select
          mode="multiple"
          showSearch
          style={{ width: '100%', marginTop: 12 }}
          placeholder="Search users by name or email"
          value={selectedIds}
          onChange={setSelectedIds}
          optionFilterProp="label"
          options={candidateUsers.map((u) => ({
            value: u.id,
            label: `${u.name} (${u.email})`,
          }))}
        />
      </Modal>
    </div>
  );
};

export default GroupManagement;
