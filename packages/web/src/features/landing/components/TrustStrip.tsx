import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Section, SectionInner } from '../lib/primitives';
import { STAGGER_MED } from '../lib/motionTokens';

const Strip = styled(Section)`
  background: rgba(7,12,20,0.98);
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
`;

const Pills = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
`;

const Pill = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 100px;
  padding: 8px 18px;
  font-size: 14px;
  color: rgba(255,255,255,0.75);
  font-weight: 500;
  cursor: default;
  transition: border-color 0.2s, background 0.2s;
  &:hover {
    border-color: rgba(27,174,229,0.4);
    background: rgba(27,174,229,0.06);
    color: #fff;
  }
`;

const TRUST_ITEMS = [
  { icon: '🔒', label: 'HIPAA-Aware' },
  { icon: '🛡️', label: 'OIG-Screened' },
  { icon: '🔑', label: 'MFA-Enforced' },
  { icon: '🏢', label: 'Multi-Tenant' },
  { icon: '📋', label: 'Audit-Logged' },
  { icon: '☁️', label: 'Cloudflare-Native' },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_MED } },
};
const item = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5 } },
};

export const TrustStrip: React.FC = () => (
  <Strip>
    <SectionInner style={{ padding: '32px 24px' }}>
      <Pills
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-5%' }}
      >
        {TRUST_ITEMS.map(t => (
          <Pill key={t.label} variants={item}>
            <span>{t.icon}</span> {t.label}
          </Pill>
        ))}
      </Pills>
    </SectionInner>
  </Strip>
);
