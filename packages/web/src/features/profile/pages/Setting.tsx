import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Table,
  Tag,
  Badge,
  Drawer,
  Form,
  Input,
  Select,
  Switch,
  Divider,
  Descriptions,
  message,
  Spin,
  Popconfirm,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SettingOutlined,
  EditOutlined,
  BellOutlined,
  CrownOutlined,
  UserOutlined,
  SearchOutlined,
  StopOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import { usersApi } from '../../../api/users';
import { useResizableColumns } from '../../../components/table/useResizableColumns';

const { Title, Text } = Typography;
const { Option } = Select;

const PageWrapper = styled.div`
  padding: 24px;
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

const FilterBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
`;

// ── Constants ──────────────────────────────────────────────────────────────────

type UserType = 'ADMIN' | 'HOSPITAL' | 'VENDOR' | 'PROVIDER';
type UserRole =
  | 'ACCOUNT_MANAGER'
  | 'FACILITY_ACCOUNT_MANAGER'
  | 'FACILITY_USER'
  | 'VENDOR_ACCOUNT_MANAGER'
  | 'VENDOR_USER'
  | 'PROVIDER_EXECUTIVE_ADMIN'
  | 'PROVIDER_USER'
  | 'ACCOUNT_MANAGER_USER'
  | 'SUPER_VENDOR';

const USER_TYPE_OPTIONS: { value: UserType; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'PROVIDER', label: 'Provider' },
];

const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'ACCOUNT_MANAGER', label: 'Account Manager' },
  { value: 'FACILITY_ACCOUNT_MANAGER', label: 'Facility Account Manager' },
  { value: 'FACILITY_USER', label: 'Facility User' },
  { value: 'VENDOR_ACCOUNT_MANAGER', label: 'Vendor Account Manager' },
  { value: 'VENDOR_USER', label: 'Vendor User' },
  { value: 'PROVIDER_EXECUTIVE_ADMIN', label: 'Provider Executive Admin' },
  { value: 'PROVIDER_USER', label: 'Provider User' },
  { value: 'ACCOUNT_MANAGER_USER', label: 'Account Manager User' },
  { value: 'SUPER_VENDOR', label: 'Super Vendor' },
];

const USER_TYPE_COLOR: Record<UserType, string> = {
  ADMIN: 'red',
  HOSPITAL: 'green',
  VENDOR: 'orange',
  PROVIDER: 'purple',
};

const USER_TYPE_LABEL: Record<UserType, string> = {
  ADMIN: 'Admin',
  HOSPITAL: 'Hospital',
  VENDOR: 'Vendor',
  PROVIDER: 'Provider',
};

const ROLE_LABEL: Record<UserRole, string> = {
  ACCOUNT_MANAGER: 'Account Manager',
  FACILITY_ACCOUNT_MANAGER: 'Facility Account Manager',
  FACILITY_USER: 'Facility User',
  VENDOR_ACCOUNT_MANAGER: 'Vendor Account Manager',
  VENDOR_USER: 'Vendor User',
  PROVIDER_EXECUTIVE_ADMIN: 'Provider Executive Admin',
  PROVIDER_USER: 'Provider User',
  ACCOUNT_MANAGER_USER: 'Account Manager User',
  SUPER_VENDOR: 'Super Vendor',
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  userType: UserType;
  isActive: boolean;
  createdAt: string;
}

const PAGE_SIZE = 10;

// ── Component ──────────────────────────────────────────────────────────────────

const Setting: React.FC = () => {
  // ── Users state ──────────────────────────────────────────────
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });

  // ── Filters ──────────────────────────────────────────────────
  const [filterUserType, setFilterUserType] = useState<UserType | ''>('');
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');
  const [searchText, setSearchText] = useState('');

  // ── Drawer state ─────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [userForm] = Form.useForm();

  // ── Notification settings ────────────────────────────────────
  const [notifications, setNotifications] = useState({
    orderUpdates: true,
    billingAlerts: true,
    inventoryAlerts: true,
    messageNotifications: true,
    emailDigest: false,
  });

  // ── Fetch users ───────────────────────────────────────────────
  const fetchUsers = useCallback(
    async (page: number, pageSize: number, userType: string, role: string, search: string) => {
      setUsersLoading(true);
      try {
        const params: Record<string, any> = {
          limit: pageSize,
          offset: (page - 1) * pageSize,
        };
        if (userType) params.userType = userType;
        if (role) params.role = role;
        if (search.trim()) params.search = search.trim();

        const data = await usersApi.list(params);
        const items: any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? data?.users ?? []);
        const total: number = Array.isArray(data)
          ? items.length
          : (data?.total ?? data?.count ?? items.length);

        setUsers(
          items.map((u: any) => ({
            id: u.id ?? u._id,
            name: u.name ?? u.fullName ?? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
            email: u.email ?? '',
            role: u.role as UserRole,
            userType: (u.userType ?? u.type) as UserType,
            isActive: u.isActive ?? u.active ?? u.userStatus === 'ACTIVE',
            createdAt: u.createdAt ?? '',
          })),
        );
        setPagination((prev) => ({ ...prev, current: page, pageSize, total }));
      } catch (err: any) {
        message.error(err?.response?.data?.message ?? 'Failed to load users.');
      } finally {
        setUsersLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchUsers(1, pagination.pageSize, filterUserType, filterRole, searchText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserType, filterRole]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(1, pagination.pageSize, filterUserType, filterRole, searchText);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const handleTableChange = (pag: TablePaginationConfig) => {
    const page = pag.current ?? 1;
    const size = pag.pageSize ?? PAGE_SIZE;
    fetchUsers(page, size, filterUserType, filterRole, searchText);
  };

  // ── Open drawer ───────────────────────────────────────────────
  const openAddDrawer = () => {
    setEditingUser(null);
    userForm.resetFields();
    setDrawerOpen(true);
  };

  const openEditDrawer = (user: UserRecord) => {
    setEditingUser(user);
    userForm.setFieldsValue({
      name: user.name,
      email: user.email,
      role: user.role,
      userType: user.userType,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingUser(null);
    userForm.resetFields();
  };

  // ── Save user ─────────────────────────────────────────────────
  const handleSaveUser = async () => {
    try {
      const values = await userForm.validateFields();
      setDrawerLoading(true);

      if (editingUser) {
        // Update
        const payload: Record<string, any> = {
          name: values.name,
          role: values.role,
          userType: values.userType,
        };
        if (values.password) payload.password = values.password;

        await usersApi.update(editingUser.id, payload);
        message.success('User updated successfully.');
      } else {
        // Create
        await usersApi.create({
          name: values.name,
          email: values.email,
          password: values.password,
          role: values.role,
          userType: values.userType,
        });
        message.success('User created successfully.');
      }

      closeDrawer();
      fetchUsers(1, pagination.pageSize, filterUserType, filterRole, searchText);
    } catch (err: any) {
      if (err?.errorFields) return; // form validation
      message.error(err?.response?.data?.message ?? 'Failed to save user.');
    } finally {
      setDrawerLoading(false);
    }
  };

  // ── Toggle active ─────────────────────────────────────────────
  const handleToggleActive = async (user: UserRecord) => {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      message.success(
        `User ${!user.isActive ? 'activated' : 'deactivated'} successfully.`,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)),
      );
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Failed to update user status.');
    }
  };

  // ── Table columns ─────────────────────────────────────────────
  const baseUserColumns: ColumnsType<UserRecord> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          {name}
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: UserRole) => (
        <Tag color="blue">{ROLE_LABEL[role] ?? role}</Tag>
      ),
    },
    {
      title: 'User Type',
      dataIndex: 'userType',
      key: 'userType',
      render: (type: UserType) => (
        <Tag color={USER_TYPE_COLOR[type] ?? 'default'}>
          {USER_TYPE_LABEL[type] ?? type}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (isActive: boolean) =>
        isActive ? (
          <Badge status="success" text="Active" />
        ) : (
          <Badge status="default" text="Inactive" />
        ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => (val ? dayjs(val).format('YYYY-MM-DD') : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: UserRecord) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditDrawer(record)}
            />
          </Tooltip>
          <Popconfirm
            title={record.isActive ? 'Deactivate this user?' : 'Activate this user?'}
            onConfirm={() => handleToggleActive(record)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title={record.isActive ? 'Deactivate' : 'Activate'}>
              <Button
                type="link"
                size="small"
                danger={record.isActive}
                icon={record.isActive ? <StopOutlined /> : <CheckOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];
  const { columns: userColumns, components: tableComponents } = useResizableColumns(baseUserColumns as any[]);

  return (
    <PageWrapper>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space>
          <SettingOutlined style={{ fontSize: 24 }} />
          <Title level={3} style={{ margin: 0 }}>
            Settings
          </Title>
        </Space>

        {/* ── User Management ────────────────────────────────── */}
        <SectionCard
          title={
            <Space>
              <UserOutlined />
              User Management
            </Space>
          }
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddDrawer}>
              Add User
            </Button>
          }
        >
          <FilterBar>
            <Input
              placeholder="Search users..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
            <Select
              placeholder="Filter by User Type"
              value={filterUserType || undefined}
              onChange={(val) => setFilterUserType(val ?? '')}
              allowClear
              style={{ width: 200 }}
            >
              {USER_TYPE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="Filter by Role"
              value={filterRole || undefined}
              onChange={(val) => setFilterRole(val ?? '')}
              allowClear
              style={{ width: 240 }}
            >
              {USER_ROLE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </FilterBar>

          <Spin spinning={usersLoading}>
            <Table
              columns={userColumns}
              components={tableComponents}
              dataSource={users}
              rowKey="id"
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                showSizeChanger: true,
                pageSizeOptions: ['10', '25', '50'],
                showTotal: (total, range) =>
                  `${range[0]}-${range[1]} of ${total} users`,
              }}
              onChange={handleTableChange}
              size="middle"
            />
          </Spin>
        </SectionCard>

        {/* ── Notification Settings ──────────────────────────── */}
        <SectionCard
          title={
            <Space>
              <BellOutlined />
              Notification Settings
            </Space>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {[
              {
                key: 'orderUpdates' as const,
                label: 'Order Updates',
                desc: 'Get notified when order status changes',
              },
              {
                key: 'billingAlerts' as const,
                label: 'Billing Alerts',
                desc: 'Receive alerts for invoice and payment updates',
              },
              {
                key: 'inventoryAlerts' as const,
                label: 'Inventory Alerts',
                desc: 'Get notified for low stock and PAR level breaches',
              },
              {
                key: 'messageNotifications' as const,
                label: 'Message Notifications',
                desc: 'Get notified for new messages',
              },
              {
                key: 'emailDigest' as const,
                label: 'Daily Email Digest',
                desc: 'Receive a daily summary email of all activity',
              },
            ].map((item, idx, arr) => (
              <React.Fragment key={item.key}>
                <Row justify="space-between" align="middle">
                  <Col>
                    <div>
                      <Text strong>{item.label}</Text>
                      <br />
                      <Text type="secondary">{item.desc}</Text>
                    </div>
                  </Col>
                  <Col>
                    <Switch
                      checked={notifications[item.key]}
                      onChange={(checked) =>
                        setNotifications((prev) => ({ ...prev, [item.key]: checked }))
                      }
                    />
                  </Col>
                </Row>
                {idx < arr.length - 1 && <Divider style={{ margin: '8px 0' }} />}
              </React.Fragment>
            ))}
          </Space>
        </SectionCard>

        {/* ── Plan & Subscription ────────────────────────────── */}
        <SectionCard
          title={
            <Space>
              <CrownOutlined />
              Plan & Subscription
            </Space>
          }
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Current Plan">
              <Tag color="gold">Professional</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Billing Cycle">Monthly</Descriptions.Item>
            <Descriptions.Item label="Next Billing Date">
              January 1, 2025
            </Descriptions.Item>
            <Descriptions.Item label="Users Included">10</Descriptions.Item>
            <Descriptions.Item label="Features">
              <Space size={[4, 4]} wrap>
                <Tag>Orders</Tag>
                <Tag>Billing</Tag>
                <Tag>Inventory</Tag>
                <Tag>Messaging</Tag>
                <Tag>Reports</Tag>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          <Divider />
          <Button type="link" style={{ paddingLeft: 0 }}>
            Upgrade Plan
          </Button>
        </SectionCard>
      </Space>

      {/* ── Add / Edit User Drawer ──────────────────────────────── */}
      <Drawer
        title={editingUser ? 'Edit User' : 'Add New User'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={480}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button type="primary" loading={drawerLoading} onClick={handleSaveUser}>
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </Space>
        }
      >
        <Form form={userForm} layout="vertical">
          <Form.Item
            name="name"
            label="Full Name"
            rules={[{ required: true, message: 'Please enter the full name.' }]}
          >
            <Input placeholder="Enter full name" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter an email address.' },
              { type: 'email', message: 'Please enter a valid email address.' },
            ]}
          >
            <Input
              placeholder="user@example.com"
              disabled={!!editingUser}
              autoComplete="off"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
            rules={
              editingUser
                ? []
                : [
                    { required: true, message: 'Please enter a password.' },
                    { min: 8, message: 'Password must be at least 8 characters.' },
                  ]
            }
          >
            <Input.Password
              placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="role"
            label="Role"
            rules={[{ required: true, message: 'Please select a role.' }]}
          >
            <Select placeholder="Select role" showSearch optionFilterProp="label">
              {USER_ROLE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="userType"
            label="User Type"
            rules={[{ required: true, message: 'Please select a user type.' }]}
          >
            <Select placeholder="Select user type">
              {USER_TYPE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Drawer>
    </PageWrapper>
  );
};

export default Setting;
