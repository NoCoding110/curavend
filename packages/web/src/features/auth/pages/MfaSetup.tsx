import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Form, Input, message, Steps, Typography, Space, Alert } from 'antd';
import { post } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;

const MfaSetup: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');

  // Retrieve setup token stored after login (advisory MFA nudge)
  const setupToken = sessionStorage.getItem('mfaSetupToken') ?? localStorage.getItem('mfaSetupToken') ?? '';

  const initSetup = async () => {
    if (!setupToken) {
      message.error('No MFA setup token found. Please log in again.');
      return;
    }
    setLoading(true);
    try {
      const res: any = await post('/api/auth/mfa/init-setup', { mfaSetupToken: setupToken });
      setQrDataUrl(res.qrDataUrl);
      setSecret(res.secret);
      setMfaToken(res.mfaToken ?? setupToken);
      setStep(1);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to initialise MFA setup');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!code || code.length !== 6) {
      message.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    try {
      await post('/api/auth/mfa/verify', { mfaToken, code });
      sessionStorage.removeItem('mfaSetupToken');
      localStorage.removeItem('mfaSetupToken');
      message.success('MFA enabled successfully');
      setStep(2);
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Invalid code — try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 16px' }}>
      <Card>
        <Title level={3}>Set Up Two-Factor Authentication</Title>
        <Steps
          current={step}
          items={[
            { title: 'Generate QR' },
            { title: 'Scan & Verify' },
            { title: 'Done' },
          ]}
          style={{ marginBottom: 32 }}
        />

        {step === 0 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Paragraph>
              Secure your account with an authenticator app (Google Authenticator, Authy, 1Password, etc.).
            </Paragraph>
            <Button type="primary" block loading={loading} onClick={initSetup}>
              Generate QR Code
            </Button>
            <Button block onClick={() => navigate('/')}>
              Skip for now
            </Button>
          </Space>
        )}

        {step === 1 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Paragraph>Scan this QR code with your authenticator app:</Paragraph>
            {qrDataUrl && (
              <div style={{ textAlign: 'center' }}>
                <img src={qrDataUrl} alt="MFA QR code" style={{ width: 200, height: 200 }} />
              </div>
            )}
            {secret && (
              <Alert
                message={`Manual entry key: ${secret}`}
                type="info"
                showIcon
                style={{ fontSize: 12 }}
              />
            )}
            <Form.Item label="Verification code" style={{ marginTop: 16 }}>
              <Input
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onPressEnter={verifyCode}
                size="large"
                style={{ letterSpacing: 8, textAlign: 'center' }}
              />
            </Form.Item>
            <Button type="primary" block loading={loading} onClick={verifyCode}>
              Verify &amp; Enable MFA
            </Button>
          </Space>
        )}

        {step === 2 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert message="MFA is now enabled on your account." type="success" showIcon />
            <Button type="primary" block onClick={() => navigate('/')}>
              Continue to Dashboard
            </Button>
          </Space>
        )}
      </Card>
    </div>
  );
};

export default MfaSetup;
