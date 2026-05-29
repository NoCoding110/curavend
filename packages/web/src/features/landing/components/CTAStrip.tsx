import React from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { Section, SectionInner } from '../lib/primitives';
import { EASE_OUT_EXPO } from '../lib/motionTokens';

const drift = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const CTASection = styled(Section)`
  background: #070C14;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: conic-gradient(from 0deg at 50% 80%, #070C14 0deg, rgba(27,174,229,0.08) 60deg, rgba(99,60,200,0.06) 120deg, #070C14 180deg, rgba(27,174,229,0.04) 240deg, #070C14 360deg);
    background-size: 200% 200%;
    animation: ${drift} 12s ease infinite;
  }
`;

const Inner = styled.div`
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 100px 24px;
`;

const Title = styled(motion.h2)`
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 800;
  color: #fff;
  margin: 0 0 12px;
`;

const Sub = styled(motion.p)`
  font-size: 18px;
  color: rgba(255,255,255,0.55);
  margin: 0 0 40px;
`;

const Buttons = styled(motion.div)`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`;

export const CTAStrip: React.FC = () => (
  <CTASection>
    <Inner>
      <Title
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
      >
        Start in 60 seconds.
      </Title>
      <Sub
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.1, ease: EASE_OUT_EXPO }}
      >
        Sign in to your workspace or request access to a new tenant.
      </Sub>
      <Buttons
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.2 }}
      >
        <Link to="/login">
          <Button type="primary" size="large"
            style={{ background: '#1BAEE5', borderColor: '#1BAEE5', height: 52, padding: '0 36px', fontSize: 17, fontWeight: 700, borderRadius: 10 }}>
            Sign in →
          </Button>
        </Link>
        <Button size="large"
          style={{ height: 52, padding: '0 36px', fontSize: 17, borderRadius: 10, background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
          onClick={() => window.location.href = 'mailto:info@curavend.com?subject=Request Access to Curavend'}>
          Request access
        </Button>
      </Buttons>
    </Inner>
  </CTASection>
);
