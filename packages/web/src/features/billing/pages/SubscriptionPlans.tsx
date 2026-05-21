import React, { useEffect, useState } from 'react';
import { Button, Card, Col, message, Modal, Row, Tag, Typography, List } from 'antd';
import { CheckCircleOutlined, CrownOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { get, post } from '../../../api/client';

const { Title, Text, Paragraph } = Typography;
const PageWrapper = styled.div`padding: 24px;`;

const SubscriptionPlans: React.FC = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await get<any>('/subscriptions/plans');
        setPlans(d.items ?? []);
      } catch (err: any) {
        message.error('Failed to load plans');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectPlan = async (plan: any) => {
    try {
      const res: any = await post('/subscriptions', { planId: plan.id });
      if (res?.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        Modal.info({
          title: 'Subscription Pending',
          content: (
            <div>
              <Paragraph>Your subscription to <strong>{plan.name}</strong> has been recorded.</Paragraph>
              <Paragraph type="secondary">
                Stripe payment processing is not currently configured. An administrator will activate your subscription manually.
              </Paragraph>
            </div>
          ),
        });
      }
    } catch (err: any) {
      if (err?.response?.status === 503) {
        Modal.info({
          title: 'Payment Not Configured',
          content: err.response.data.error,
        });
      } else {
        message.error(err?.response?.data?.error || 'Plan selection failed');
      }
    }
  };

  const getPlanFeatures = (planName: string): string[] => {
    const name = planName.toLowerCase();
    if (name.includes('free')) return ['Up to 10 orders/mo', 'Basic reporting', 'Email support'];
    if (name.includes('standard')) return ['Unlimited orders', 'Advanced reporting', 'AI order parsing', 'Priority email support'];
    if (name.includes('pro')) return ['Everything in Standard', 'API access', 'SSO integration', 'Dedicated support', 'Custom integrations'];
    return [];
  };

  return (
    <PageWrapper>
      <Title level={3}>Subscription Plans</Title>
      <Paragraph type="secondary">
        Choose the plan that fits your team. Upgrade or downgrade at any time.
      </Paragraph>
      <Row gutter={16}>
        {plans.map((p) => {
          const highlighted = p.name?.toLowerCase() === 'standard';
          return (
            <Col span={8} key={p.id}>
              <Card
                loading={loading}
                style={{
                  border: highlighted ? '2px solid #1BAEE5' : undefined,
                  height: '100%',
                }}
              >
                {highlighted && <Tag color="blue" icon={<CrownOutlined />}>Most Popular</Tag>}
                <Title level={4}>{p.name}</Title>
                <div style={{ fontSize: 32, fontWeight: 700, margin: '8px 0' }}>
                  ${p.price ?? 0}
                  <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}> /mo</Text>
                </div>
                <Text type="secondary">{p.description}</Text>
                <List
                  style={{ margin: '16px 0' }}
                  dataSource={getPlanFeatures(p.name)}
                  renderItem={(item) => (
                    <List.Item style={{ padding: '4px 0', border: 'none' }}>
                      <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                      {item}
                    </List.Item>
                  )}
                />
                <Button
                  type={highlighted ? 'primary' : 'default'}
                  block
                  size="large"
                  onClick={() => selectPlan(p)}
                >
                  Select Plan
                </Button>
              </Card>
            </Col>
          );
        })}
      </Row>
    </PageWrapper>
  );
};

export default SubscriptionPlans;
