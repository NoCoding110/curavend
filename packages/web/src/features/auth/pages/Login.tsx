import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Alert,
  Card,
  Form,
  Input,
  Button,
  Typography,
  message,
  Divider,
  Space,
  Modal,
} from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import OtpInput from 'react-otp-input';
import { authApi } from '../../../api/auth';
import { setCredentials } from '../../../store/slices/authSlice';
import { TurnstileWidget, TurnstileHandle } from '../components/TurnstileWidget';

const { Title, Text, Link } = Typography;

const LoginWrapper = styled.div`
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
  letter-spacing: 1px;
`;

const StyledCard = styled(Card)`
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);

  .ant-card-body {
    padding: 32px;
  }
`;

type LoginStep =
  | 'credentials'
  | 'mfa'
  | 'mfa-setup'
  | 'change-password'
  | 'membership'
  | 'email-otp-request'
  | 'email-otp-verify';

const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [changePasswordForm] = Form.useForm();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [mfaToken, setMfaToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [changePasswordToken, setChangePasswordToken] = useState('');
  const [mfaQrData, setMfaQrData] = useState<{
    uri: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [phiModalVisible, setPhiModalVisible] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<any>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const turnstileEnabled = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  // Phase F — multi-org login picker
  const [memberships, setMemberships] = useState<any[]>([]);
  const [partialToken, setPartialToken] = useState<string>('');
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('sessionTimedOut')) {
      setSessionExpired(true);
      sessionStorage.removeItem('sessionTimedOut');
    }
  }, []);

  const handleLogin = async (values: { email: string; password: string }) => {
    if (turnstileEnabled && !turnstileToken) {
      message.warning('Please complete the bot-protection check.');
      return;
    }
    setLoading(true);
    try {
      const response = await authApi.login(values, turnstileToken);

      if (response.requiresPasswordChange) {
        setChangePasswordToken(response.changePasswordToken || '');
        setStep('change-password');
        return;
      }

      if (response.requiresMfa) {
        setMfaToken(response.mfaToken || '');
        // Check if MFA needs setup
        try {
          const setupData = await authApi.setupMfa({
            mfaToken: response.mfaToken!,
          });
          setMfaQrData(setupData);
          setStep('mfa-setup');
        } catch {
          setStep('mfa');
        }
        return;
      }

      if (response.requiresMembershipSelection && response.memberships && response.partialToken) {
        setMemberships(response.memberships);
        setPartialToken(response.partialToken);
        setStep('membership');
        return;
      }

      completeLogin(response);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Login failed');
      // A consumed Turnstile token can't be replayed — reset on any failure
      // so the next attempt gets a fresh one.
      turnstileRef.current?.reset();
      setTurnstileToken('');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (otpCode.length !== 6) return;
    setLoading(true);
    try {
      const response = await authApi.verifyMfa({
        code: otpCode,
        mfaToken,
      });
      if (response.requiresMembershipSelection && response.memberships && response.partialToken) {
        setMemberships(response.memberships);
        setPartialToken(response.partialToken);
        setStep('membership');
        return;
      }
      completeLogin(response);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Invalid code');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (values: {
    newPassword: string;
    confirmPassword: string;
  }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await authApi.changePassword({
        currentPassword: form.getFieldValue('password'),
        newPassword: values.newPassword,
        changePasswordToken,
      });
      completeLogin(response);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = (response: any) => {
    if (response.accessToken && response.user) {
      // If the user already acknowledged PHI for this browser session,
      // skip the modal and proceed immediately.
      if (sessionStorage.getItem('hasAgreedToPHIAccess')) {
        dispatch(
          setCredentials({
            token: response.accessToken,
            refreshToken: response.refreshToken,
            userData: response.user,
          }),
        );
        const dest = response.user?.userType === 'LAB' ? '/labs' : '/dashboard';
        navigate(dest);
        return;
      }
      setPendingLogin(response);
      setPhiModalVisible(true);
    }
  };

  // Phase F — multi-org membership selection handler
  const handleSelectMembership = async (membershipId: string) => {
    setLoading(true);
    try {
      const response = await authApi.selectMembership({
        membershipId,
        partialToken,
      });
      completeLogin(response);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to enter selected organization');
    } finally {
      setLoading(false);
    }
  };

  const handlePhiConsent = () => {
    if (pendingLogin) {
      dispatch(
        setCredentials({
          token: pendingLogin.accessToken,
          refreshToken: pendingLogin.refreshToken,
          userData: pendingLogin.user,
        }),
      );
      // Remember for this browser session so subsequent logins skip the modal.
      sessionStorage.setItem('hasAgreedToPHIAccess', '1');
      setPhiModalVisible(false);
      // Lab users land on their own portal; everyone else hits the main dashboard.
      const dest = pendingLogin.user?.userType === 'LAB' ? '/labs' : '/dashboard';
      navigate(dest);
    }
  };

  return (
    <LoginWrapper>
      <LogoText>Curavend</LogoText>
      <Text type="secondary" style={{ marginBottom: 24 }}>
        Healthcare Supply Chain Management
      </Text>

      <StyledCard>
        {step === 'credentials' && (
          <>
            {sessionExpired && (
              <Alert
                type="warning"
                message="Your session expired. Please sign in again."
                showIcon
                style={{ marginBottom: 16 }}
                closable
                onClose={() => setSessionExpired(false)}
              />
            )}
            <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
              Login to Curavend
            </Title>
            <Form form={form} layout="vertical" onFinish={handleLogin}>
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Please enter a valid email' },
                ]}
              >
                <Input
                  prefix={<MailOutlined />}
                  placeholder="Email address"
                  size="large"
                  autoComplete="email"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[
                  { required: true, message: 'Please enter your password' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Password"
                  size="large"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                  <TurnstileWidget
                    ref={turnstileRef}
                    onVerify={setTurnstileToken}
                    onError={() => setTurnstileToken('')}
                  />
                </div>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  Sign In
                </Button>
              </Form.Item>
              <div style={{ textAlign: 'center' }}>
                <Link onClick={() => navigate('/forgot-password')}>
                  Forgot Password?
                </Link>
              </div>
              <Divider plain style={{ fontSize: 12, color: '#999' }}>or</Divider>
              <Button
                block
                onClick={() => setStep('email-otp-request')}
              >
                Sign in with Email Code
              </Button>
            </Form>
          </>
        )}

        {step === 'mfa-setup' && mfaQrData && (
          <>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 16 }}>
              Set Up Two-Factor Authentication
            </Title>
            <Text style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
              Scan this QR code with Google Authenticator or any TOTP app
            </Text>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <img
                src={mfaQrData.qrCodeDataUrl}
                alt="MFA QR Code"
                style={{ width: 200, height: 200 }}
              />
            </div>
            <Text
              style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}
            >
              Then enter the 6-digit code below:
            </Text>
            <div
              style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}
            >
              <OtpInput
                value={otpCode}
                onChange={setOtpCode}
                numInputs={6}
                renderInput={(props) => (
                  <input
                    {...props}
                    style={{
                      width: 48,
                      height: 48,
                      margin: '0 4px',
                      fontSize: 20,
                      borderRadius: 4,
                      border: '1px solid #d9d9d9',
                      textAlign: 'center',
                    }}
                  />
                )}
              />
            </div>
            <Button
              type="primary"
              block
              size="large"
              loading={loading}
              disabled={otpCode.length !== 6}
              onClick={handleMfaVerify}
            >
              Verify & Continue
            </Button>
          </>
        )}

        {step === 'mfa' && (
          <>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 16 }}>
              Two-Factor Authentication
            </Title>
            <Text style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
              Enter the 6-digit code from your authenticator app
            </Text>
            <div
              style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}
            >
              <OtpInput
                value={otpCode}
                onChange={setOtpCode}
                numInputs={6}
                renderInput={(props) => (
                  <input
                    {...props}
                    style={{
                      width: 48,
                      height: 48,
                      margin: '0 4px',
                      fontSize: 20,
                      borderRadius: 4,
                      border: '1px solid #d9d9d9',
                      textAlign: 'center',
                    }}
                  />
                )}
              />
            </div>
            <Button
              type="primary"
              block
              size="large"
              loading={loading}
              disabled={otpCode.length !== 6}
              onClick={handleMfaVerify}
            >
              Verify
            </Button>
          </>
        )}

        {step === 'change-password' && (
          <>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 16 }}>
              Change Password
            </Title>
            <Text style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
              You must change your password before continuing
            </Text>
            <Form
              form={changePasswordForm}
              layout="vertical"
              onFinish={handleChangePassword}
            >
              <Form.Item
                name="newPassword"
                label="New Password"
                rules={[
                  { required: true, message: 'Please enter new password' },
                  { min: 8, message: 'Password must be at least 8 characters' },
                ]}
              >
                <Input.Password size="large" placeholder="New password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Confirm Password"
                rules={[
                  { required: true, message: 'Please confirm your password' },
                ]}
              >
                <Input.Password size="large" placeholder="Confirm password" />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  Change Password & Continue
                </Button>
              </Form.Item>
            </Form>
          </>
        )}

        {step === 'email-otp-request' && (
          <>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 16 }}>
              Sign in with Email Code
            </Title>
            <Text style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
              We'll send a 6-digit verification code to your email.
            </Text>
            <Form layout="vertical" onFinish={async (values: { email: string }) => {
              setLoading(true);
              try {
                const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://curavend-api.metabilityllc1.workers.dev/api'}/auth/email-otp/send`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: values.email, purpose: 'MFA_LOGIN' }),
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Failed');
                setMfaToken(values.email); // reuse mfaToken state to remember email
                setStep('email-otp-verify');
                message.success('Code sent — check your inbox');
              } catch (err: any) {
                message.error(err.message || 'Failed to send code');
              } finally {
                setLoading(false);
              }
            }}>
              <Form.Item name="email" rules={[{ required: true }, { type: 'email' }]}>
                <Input prefix={<MailOutlined />} placeholder="Email address" size="large" autoComplete="email" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large">
                Send Code
              </Button>
            </Form>
            <Divider />
            <Button block onClick={() => setStep('credentials')}>← Back to Password Login</Button>
          </>
        )}

        {step === 'email-otp-verify' && (
          <>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 16 }}>
              Enter Email Code
            </Title>
            <Text style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
              Enter the 6-digit code we sent to {mfaToken}
            </Text>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <OtpInput
                value={otpCode}
                onChange={setOtpCode}
                numInputs={6}
                renderInput={(props) => (
                  <input {...props} style={{ width: 48, height: 48, margin: '0 4px', fontSize: 20, borderRadius: 4, border: '1px solid #d9d9d9', textAlign: 'center' }} />
                )}
              />
            </div>
            <Button
              type="primary"
              block
              size="large"
              loading={loading}
              disabled={otpCode.length !== 6}
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://curavend-api.metabilityllc1.workers.dev/api'}/auth/email-otp/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: mfaToken, code: otpCode, purpose: 'MFA_LOGIN' }),
                  });
                  if (!res.ok) throw new Error((await res.json()).error || 'Verify failed');
                  const data = await res.json();
                  message.success('Verified. Please complete the password sign-in to receive your session.');
                  // For minimal scope: bounce to password login (the email OTP issues only a short-lived step token,
                  // not a full session). A future enhancement could issue full tokens directly when the user opts in.
                  setStep('credentials');
                  setOtpCode('');
                } catch (err: any) {
                  message.error(err.message || 'Invalid code');
                  setOtpCode('');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Verify
            </Button>
          </>
        )}

        {step === 'membership' && (
          <>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 8 }}>
              Choose an organization
            </Title>
            <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
              Your account belongs to {memberships.length} organizations. Pick one to continue.
            </Text>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {memberships.map((m) => (
                <Button
                  key={m.id}
                  block
                  size="large"
                  loading={loading}
                  onClick={() => handleSelectMembership(m.id)}
                  style={{ height: 'auto', padding: '12px 16px', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{m.label || m.tenantId}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {m.tenantType} · {m.role}
                        {m.isDefault && ' · default'}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: '#1baee5' }}>→</span>
                  </div>
                </Button>
              ))}
            </Space>
          </>
        )}

        <Divider />
        <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
          By logging in, you acknowledge that you are accessing a system that may
          contain Protected Health Information (PHI) and agree to comply with all
          applicable HIPAA regulations.
        </Text>
      </StyledCard>

      {/* PHI Consent Modal */}
      <Modal
        title="PHI Access Acknowledgment"
        open={phiModalVisible}
        onOk={handlePhiConsent}
        closable={false}
        maskClosable={false}
        keyboard={false}
        okText="I Acknowledge & Continue"
        cancelButtonProps={{ style: { display: 'none' } }}
        footer={[
          <Button key="ok" type="primary" onClick={handlePhiConsent} block size="large">
            I Acknowledge & Continue
          </Button>,
        ]}
      >
        <Space direction="vertical" size="middle">
          <Text>
            You are about to access a system that contains Protected Health
            Information (PHI). By proceeding, you acknowledge that:
          </Text>
          <ul>
            <li>
              You are authorized to access PHI in the course of your duties
            </li>
            <li>
              You will only access the minimum necessary information required
            </li>
            <li>
              You will comply with all HIPAA regulations and organizational
              policies
            </li>
            <li>
              Any unauthorized access or disclosure may result in disciplinary
              action and legal penalties
            </li>
          </ul>
        </Space>
      </Modal>
    </LoginWrapper>
  );
};

export default Login;
