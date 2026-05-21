import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Card,
  Row,
  Col,
  Button,
  Typography,
  Space,
  Form,
  Input,
  Descriptions,
  Avatar,
  Tag,
  message,
  Alert,
  Divider,
} from 'antd';
import {
  UserOutlined,
  EditOutlined,
  LockOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import type { RootState } from '../../../store/store';
import { setUserData } from '../../../store/slices/authSlice';
import { put, post } from '../../../api/client';

const { Title, Text } = Typography;

const PageWrapper = styled.div`
  padding: 24px;
  max-width: 860px;
`;

const SectionCard = styled(Card)`
  border-radius: 12px;
  margin-bottom: 16px;
`;

const AvatarSection = styled.div`
  text-align: center;
  margin-bottom: 24px;
`;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  hospital: 'Hospital Admin',
  vendor: 'Vendor',
  superVendor: 'Super Vendor',
  provider: 'Provider',
};

const Profile: React.FC = () => {
  const dispatch = useDispatch();
  const userData = useSelector((state: RootState) => state.auth.userData);

  const [editing, setEditing] = useState(false);
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const startEditing = () => {
    profileForm.setFieldsValue({
      name: userData?.name || '',
      contact: (userData as any)?.contact || '',
    });
    setEditing(true);
    setProfileError(null);
  };

  const cancelEditing = () => {
    profileForm.resetFields();
    setEditing(false);
    setProfileError(null);
  };

  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      if (!userData?.id) return;
      setProfileLoading(true);
      setProfileError(null);
      await put(`/users/${userData.id}`, {
        name: values.name,
        contact: values.contact,
      });
      dispatch(setUserData({ name: values.name }));
      message.success('Profile updated successfully.');
      setEditing(false);
    } catch (err: any) {
      if (err?.response) {
        setProfileError(err?.response?.data?.message || 'Failed to update profile.');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();
      setPasswordLoading(true);
      setPasswordError(null);
      await post('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password changed successfully.');
      passwordForm.resetFields();
    } catch (err: any) {
      if (err?.response) {
        setPasswordError(err?.response?.data?.message || 'Failed to change password.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const displayRole =
    ROLE_LABELS[userData?.role || ''] ||
    ROLE_LABELS[userData?.userType || ''] ||
    userData?.role ||
    'User';

  return (
    <PageWrapper>
      <Title level={3} style={{ marginBottom: 24 }}>
        My Profile
      </Title>

      {/* Profile Information */}
      <SectionCard
        title="Profile Information"
        extra={
          !editing ? (
            <Button icon={<EditOutlined />} onClick={startEditing}>
              Edit
            </Button>
          ) : (
            <Space>
              <Button icon={<CloseOutlined />} onClick={cancelEditing}>
                Cancel
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={profileLoading}
                onClick={handleSaveProfile}
              >
                Save
              </Button>
            </Space>
          )
        }
      >
        <AvatarSection>
          <Avatar
            size={80}
            icon={<UserOutlined />}
            style={{ background: '#1677ff' }}
          />
          <div style={{ marginTop: 10 }}>
            <Text strong style={{ fontSize: 18 }}>
              {userData?.name || 'User'}
            </Text>
            <br />
            <Tag color="blue" style={{ marginTop: 4 }}>
              {displayRole}
            </Tag>
          </div>
        </AvatarSection>

        <Divider style={{ margin: '16px 0' }} />

        {profileError && (
          <Alert
            message={profileError}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setProfileError(null)}
          />
        )}

        {!editing ? (
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Full Name">
              {userData?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {userData?.email || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Role">{displayRole}</Descriptions.Item>
            <Descriptions.Item label="Account Type">
              {userData?.userType
                ? userData.userType.charAt(0).toUpperCase() + userData.userType.slice(1)
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Contact Phone">
              {(userData as any)?.contact || '—'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form form={profileForm} layout="vertical">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="name"
                  label="Full Name"
                  rules={[{ required: true, message: 'Name is required' }]}
                >
                  <Input placeholder="Enter your name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Email">
                  <Input
                    value={userData?.email || ''}
                    disabled
                    readOnly
                    style={{ background: '#f5f5f5' }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Email cannot be changed here.
                  </Text>
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="contact" label="Contact Phone">
                  <Input placeholder="e.g., (555) 123-4567" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
      </SectionCard>

      {/* Change Password */}
      <SectionCard
        title={
          <Space>
            <LockOutlined />
            <span>Change Password</span>
          </Space>
        }
      >
        {passwordError && (
          <Alert
            message={passwordError}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setPasswordError(null)}
          />
        )}

        <Form form={passwordForm} layout="vertical" style={{ maxWidth: 420 }}>
          <Form.Item
            name="currentPassword"
            label="Current Password"
            rules={[{ required: true, message: 'Current password is required' }]}
          >
            <Input.Password placeholder="Enter current password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[
              { required: true, message: 'New password is required' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password placeholder="Enter new password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm New Password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm your new password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Passwords do not match'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              icon={<LockOutlined />}
              loading={passwordLoading}
              onClick={handleChangePassword}
            >
              Update Password
            </Button>
          </Form.Item>
        </Form>
      </SectionCard>
    </PageWrapper>
  );
};

export default Profile;
