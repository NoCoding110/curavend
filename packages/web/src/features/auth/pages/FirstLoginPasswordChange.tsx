import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, message, Typography, Alert } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { post } from '../../../api/client';

const { Title, Paragraph } = Typography;

const FirstLoginPasswordChange: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await post('/api/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('Password changed — please log in with your new password');
      // Clear session and redirect to login
      sessionStorage.clear();
      navigate('/login');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 16px' }}>
      <Card>
        <Title level={3}>Change Your Password</Title>
        <Alert
          message="For security, you must set a new password before continuing."
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
        <Paragraph type="secondary">
          Password must be at least 12 characters and include uppercase, lowercase, a digit, and a
          special character.
        </Paragraph>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="currentPassword"
            label="Current (temporary) password"
            rules={[{ required: true }]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New password"
            rules={[
              { required: true },
              { min: 12, message: 'Minimum 12 characters' },
              {
                validator: (_, v) =>
                  v &&
                  /[A-Z]/.test(v) &&
                  /[a-z]/.test(v) &&
                  /\d/.test(v) &&
                  /[^A-Za-z0-9]/.test(v)
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error('Must include uppercase, lowercase, digit, and special character'),
                      ),
              },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm new password"
            rules={[{ required: true }]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Change Password
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default FirstLoginPasswordChange;
