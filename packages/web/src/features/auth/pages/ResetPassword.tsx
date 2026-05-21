import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { MailOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { authApi } from '../../../api/auth';
import { TurnstileWidget, TurnstileHandle } from '../components/TurnstileWidget';

const { Title, Link } = Typography;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 440px;
  padding: 24px;
`;

const LogoText = styled.div`
  font-size: 32px;
  font-weight: 700;
  color: #1baee5;
  margin-bottom: 8px;
`;

const StyledCard = styled(Card)`
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  .ant-card-body { padding: 32px; }
`;

const ResetPassword: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const turnstileEnabled = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

  const handleSubmit = async (values: { email: string; code: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      message.warning('Please complete the bot-protection check.');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(
        {
          email: values.email,
          code: values.code,
          newPassword: values.newPassword,
        },
        turnstileToken,
      );
      message.success('Password reset successfully');
      navigate('/login');
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to reset password');
      turnstileRef.current?.reset();
      setTurnstileToken('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Wrapper>
      <LogoText>Curavend</LogoText>
      <StyledCard>
        <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
          Reset Password
        </Title>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="email" rules={[{ required: true, type: 'email' }]}>
            <Input prefix={<MailOutlined />} placeholder="Email address" size="large" />
          </Form.Item>
          <Form.Item name="code" rules={[{ required: true, message: 'Enter the code from your email' }]}>
            <Input prefix={<SafetyOutlined />} placeholder="Reset code" size="large" />
          </Form.Item>
          <Form.Item name="newPassword" rules={[{ required: true, min: 8 }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="New password" size="large" />
          </Form.Item>
          <Form.Item name="confirmPassword" rules={[{ required: true }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Confirm password" size="large" />
          </Form.Item>
          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <TurnstileWidget
                ref={turnstileRef}
                onVerify={setTurnstileToken}
                onError={() => setTurnstileToken('')}
              />
            </div>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Reset Password
            </Button>
          </Form.Item>
          <div style={{ textAlign: 'center' }}>
            <Link onClick={() => navigate('/login')}>Back to Login</Link>
          </div>
        </Form>
      </StyledCard>
    </Wrapper>
  );
};

export default ResetPassword;
