import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Section, SectionInner, SectionLabel, SectionHeading } from '../lib/primitives';
import { STAGGER_FAST } from '../lib/motionTokens';

const Grid = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 48px;
  justify-content: center;
`;

const IntChip = styled(motion.div)`
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  gap: 8px;
  transition: border-color 0.2s, background 0.2s;
  &:hover {
    border-color: rgba(27,174,229,0.35);
    background: rgba(27,174,229,0.07);
    color: #fff;
  }
`;

const INTEGRATIONS = [
  { icon: '⚡', name: 'Cloudflare Workers' },
  { icon: '💾', name: 'Cloudflare D1' },
  { icon: '🪣', name: 'Cloudflare R2' },
  { icon: '🔑', name: 'Cloudflare KV' },
  { icon: '📬', name: 'Cloudflare Queues' },
  { icon: '🤖', name: 'Workers AI (Llama 3.2)' },
  { icon: '🌐', name: 'Browser Rendering' },
  { icon: '📧', name: 'Resend Email' },
  { icon: '💳', name: 'Stripe Billing' },
  { icon: '🏥', name: 'Epic FHIR / SMART' },
  { icon: '📡', name: 'CDS Hooks' },
  { icon: '📦', name: 'NetSuite ERP' },
  { icon: '📊', name: 'SAP ERP' },
  { icon: '🐟', name: 'Fishbowl ERP' },
  { icon: '📒', name: 'QuickBooks' },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_FAST } },
};
const chip = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.35 } },
};

export const IntegrationsGrid: React.FC = () => (
  <Section style={{ background: '#080D16' }}>
    <SectionInner>
      <SectionLabel>Integrations</SectionLabel>
      <SectionHeading>Cloudflare-native. ERP-aware.</SectionHeading>
      <Grid
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-5%' }}
      >
        {INTEGRATIONS.map(i => (
          <IntChip key={i.name} variants={chip}>
            <span>{i.icon}</span> {i.name}
          </IntChip>
        ))}
      </Grid>
    </SectionInner>
  </Section>
);
