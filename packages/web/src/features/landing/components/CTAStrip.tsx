/**
 * Final CTA — large gradient panel with two buttons.
 */
import React, { useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion, useInView } from 'framer-motion';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Section, Container } from '../lib/primitives';
import { colors, easings } from '../lib/motionTokens';

const CTASection = styled(Section)`
  background: ${colors.bg0};
  padding: 140px 0;
  min-height: 70vh;
`;

const drift = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const Panel = styled(motion.div)`
  position: relative;
  padding: clamp(40px, 6vw, 80px) clamp(28px, 5vw, 64px);
  border-radius: 32px;
  background: linear-gradient(135deg, ${colors.bg2} 0%, ${colors.bg3} 100%);
  border: 1px solid ${colors.hairlineStrong};
  text-align: center;
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: conic-gradient(from 0deg, ${colors.brand}22, transparent 35%, ${colors.accent}22, transparent 70%);
    animation: ${drift} 18s linear infinite;
    pointer-events: none;
    opacity: 0.6;
  }
`;

const Title = styled.h2`
  position: relative;
  font-size: clamp(34px, 5vw, 56px);
  font-weight: 700;
  margin: 0 0 18px 0;
  line-height: 1.05;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, ${colors.text} 0%, ${colors.textDim} 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const Sub = styled.p`
  position: relative;
  font-size: 17px;
  color: ${colors.textDim};
  margin: 0 0 36px 0;
  max-width: 56ch;
  display: inline-block;
`;

const Row = styled.div`
  position: relative;
  display: inline-flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
`;

const Primary = styled(motion.button)`
  padding: 14px 28px;
  border: none;
  background: linear-gradient(135deg, ${colors.brand} 0%, ${colors.accent} 100%);
  color: white;
  font-size: 15px;
  font-weight: 600;
  border-radius: 100px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 32px ${colors.brand}55;
  transition: transform 0.3s ${easings.ease.toString()};
  &:hover {
    transform: translateY(-2px);
  }
`;

const Secondary = styled(motion.button)`
  padding: 14px 24px;
  background: transparent;
  border: 1px solid ${colors.hairlineStrong};
  color: ${colors.text};
  font-size: 15px;
  font-weight: 600;
  border-radius: 100px;
  cursor: pointer;
  &:hover {
    background: ${colors.glassHover};
    border-color: ${colors.brand};
  }
`;

export const CTAStrip: React.FC = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });

  return (
    <CTASection>
      <Container>
        <Panel
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: easings.ease }}
        >
          <Title>Start in 60 seconds.</Title>
          <Sub>
            Sign in with your existing account, or reach out and we'll get you set up
            with a tenant scoped to your organization.
          </Sub>
          <Row>
            <Primary onClick={() => navigate('/login')}>
              Sign in <ArrowRightOutlined />
            </Primary>
            <Secondary
              onClick={() => (window.location.href = 'mailto:hello@curavend.com?subject=Curavend%20access%20request')}
            >
              Request access
            </Secondary>
          </Row>
        </Panel>
      </Container>
    </CTASection>
  );
};

export default CTAStrip;
