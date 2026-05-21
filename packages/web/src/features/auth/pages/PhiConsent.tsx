import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Checkbox, Divider, message, Typography, Alert, Space } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { post } from '../../../api/client';

const { Title, Paragraph, Text } = Typography;

const PhiConsent: React.FC = () => {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const userId = sessionStorage.getItem('userId') ?? '';

  const handleAcknowledge = async () => {
    if (!agreed) {
      message.error('You must agree before continuing');
      return;
    }
    setLoading(true);
    try {
      await post(`/api/users/${userId}/phi-consent`, {});
      sessionStorage.setItem('hasAgreedToPHIAccess', '1');
      message.success('PHI access acknowledged');
      navigate('/');
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Failed to record consent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 16px' }}>
      <Card>
        <Space>
          <SafetyOutlined style={{ fontSize: 28, color: '#1BAEE5' }} />
          <Title level={3} style={{ margin: 0 }}>
            Protected Health Information (PHI) Access Acknowledgment
          </Title>
        </Space>
        <Divider />

        <Alert
          message="HIPAA Notice"
          description="This system contains Protected Health Information (PHI) as defined under HIPAA §164.501. Unauthorised access, disclosure, or misuse of PHI is a federal violation and may result in civil and criminal penalties."
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Paragraph>By accessing this system, you acknowledge that:</Paragraph>
        <ul>
          <li>
            <Text>
              You are authorised by your organisation to access PHI in connection with your job
              duties.
            </Text>
          </li>
          <li>
            <Text>
              You will only access the minimum necessary PHI required to perform your role.
            </Text>
          </li>
          <li>
            <Text>
              You will not disclose PHI to any unauthorised individuals or use it for personal
              benefit.
            </Text>
          </li>
          <li>
            <Text>
              All access to PHI is logged and subject to audit under HIPAA §164.312(b).
            </Text>
          </li>
          <li>
            <Text>
              You will report any suspected privacy breach or unauthorised access immediately to
              your compliance officer.
            </Text>
          </li>
        </ul>

        <Divider />
        <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)}>
          I have read and understand the above PHI access policy and agree to comply with HIPAA
          requirements.
        </Checkbox>

        <div style={{ marginTop: 24 }}>
          <Button
            type="primary"
            block
            disabled={!agreed}
            loading={loading}
            onClick={handleAcknowledge}
          >
            Acknowledge &amp; Continue
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PhiConsent;
