/**
 * Trust strip — 6 inline pills under the hero. Stagger entry on view.
 */
import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useInView } from 'framer-motion';
import { Section, Container } from '../lib/primitives';
import { colors, easings, stagger } from '../lib/motionTokens';
import {
  SafetyCertificateOutlined,
  AuditOutlined,
  LockOutlined,
  AppstoreOutlined,
  FileSearchOutlined,
  CloudOutlined,
} from '@ant-design/icons';

const StripSection = styled(Section)`
  min-height: auto;
  padding: 56px 0;
  background: ${colors.bg0};
`;

const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 12px;
`;

const Pill = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 100px;
  background: ${colors.glass};
  border: 1px solid ${colors.hairline};
  backdrop-filter: blur(12px);
  color: ${colors.textDim};
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: default;
  transition: transform 0.25s ${easings.ease.toString()}, color 0.25s, border-color 0.25s, background 0.25s;
  &:hover {
    transform: translateY(-2px);
    color: ${colors.text};
    border-color: ${colors.brand};
    background: ${colors.glassHover};
  }
  & .anticon {
    color: ${colors.brand};
    font-size: 14px;
  }
`;

const PILLS = [
  { icon: <SafetyCertificateOutlined />, label: 'HIPAA-aware' },
  { icon: <AuditOutlined />, label: 'OIG-screened' },
  { icon: <LockOutlined />, label: 'MFA-enforced' },
  { icon: <AppstoreOutlined />, label: 'Multi-tenant by design' },
  { icon: <FileSearchOutlined />, label: 'Audit-logged' },
  { icon: <CloudOutlined />, label: 'Cloudflare-native' },
];

export const TrustStrip: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });

  return (
    <StripSection>
      <Container>
        <PillRow ref={ref}>
          {PILLS.map((p, i) => (
            <Pill
              key={p.label}
              initial={{ opacity: 0, y: 14 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, ease: easings.ease, delay: i * stagger.fast }}
            >
              {p.icon}
              {p.label}
            </Pill>
          ))}
        </PillRow>
      </Container>
    </StripSection>
  );
};

export default TrustStrip;
