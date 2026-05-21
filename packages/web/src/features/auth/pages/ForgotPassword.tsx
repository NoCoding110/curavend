import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { authApi } from '../../../api/auth';
import { TurnstileWidget, TurnstileHandle } from '../components/TurnstileWidget';

const { Title, Text, Link } = Typography;

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

const ForgotPassword: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const turnstileEnabled = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

  const handleSubmit = async (values: { email: string }) => {
    if (turnstileEnabled && !turnstileToken) {
      message.warning('Please complete the bot-protection check.');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(values, turnstileToken);
      setSent(true);
      message.success('Reset code sent to your email');
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to send reset code');
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
          Forgot Password
        </Title>
        {!sent ? (
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Text style={{ display: 'block', marginBottom: 16 }}>
              Enter your email address and we'll send you a code to reset your password.
            </Text>
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please enter your email' },
                { type: 'email', message: 'Please enter a valid email' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="Email address" size="large" />
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
                Send Reset Code
              </Button>
            </Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link onClick={() => navigate('/login')}>Back to Login</Link>
            </div>
          </Form>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <Text>A reset code has been sent to your email.</Text>
            <br />
            <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate('/reset-password')}>
              Enter Reset Code
            </Button>
          </div>
        )}
      </StyledCard>
    </Wrapper>
  );
};

export default ForgotPassword;
