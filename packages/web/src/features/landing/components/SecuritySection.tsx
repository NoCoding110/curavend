import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Section, SectionInner, SectionLabel, SectionHeading, GlassCard } from '../lib/primitives';
import { STAGGER_MED } from '../lib/motionTokens';

const Layout = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: start;
  @media(max-width: 768px) { grid-template-columns: 1fr; }
`;

const StickyLeft = styled.div`
  position: sticky;
  top: 120px;
`;

const Bullets = styled.ul`
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Bullet = styled.li`
  font-size: 15px;
  color: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  gap: 10px;
  &::before { content: '✓'; color: #1BAEE5; font-weight: 700; }
`;

const CardGrid = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SecurityCard = styled(GlassCard)`
  padding: 20px 24px;
`;

const CardTitle = styled.h4`
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 6px;
`;

const CardDetail = styled.p`
  color: rgba(255,255,255,0.55);
  font-size: 14px;
  margin: 0;
  line-height: 1.5;
`;

const SECURITY_CARDS = [
  { icon: '📋', title: 'PHI Access Log', detail: 'Every read of patient data is recorded with user, resource, action, and timestamp. Queryable by admin.' },
  { icon: '🔍', title: 'OIG Monthly Screening', detail: 'Vendor and user lists screened against the LEIE exclusion database on a monthly cron schedule.' },
  { icon: '🔐', title: 'TOTP + Email OTP MFA', detail: 'Two-factor authentication via authenticator app or email code. Mandatory for all users.' },
  { icon: '👥', title: '8-Resource RBAC + Groups', detail: 'Fine-grained permission matrix across orders, contracts, reports, lab, inventory, catalog, users, and billing. Group-inherited grants.' },
  { icon: '🗂️', title: 'Tenant-Isolated R2 Storage', detail: 'Every file upload is namespaced under its tenant ID in Cloudflare R2. Cross-tenant file reads are impossible by design.' },
  { icon: '☁️', title: 'Cloudflare Edge Security', detail: 'TLS 1.3 in transit, AES-256 at rest, Turnstile bot protection on auth flows, rate limiting on sensitive endpoints.' },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_MED } },
};
const cardItem = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
};

export const SecuritySection: React.FC = () => (
  <Section>
    <SectionInner>
      <Layout>
        <StickyLeft>
          <SectionLabel>Security & Compliance</SectionLabel>
          <SectionHeading>Built on healthcare-grade primitives.</SectionHeading>
          <Bullets>
            <Bullet>HIPAA-aware audit logging</Bullet>
            <Bullet>Role + group permission model</Bullet>
            <Bullet>OIG LEIE monthly refresh</Bullet>
            <Bullet>Cloudflare Turnstile on auth</Bullet>
            <Bullet>Tenant-isolated storage</Bullet>
            <Bullet>MFA enforced at login</Bullet>
          </Bullets>
        </StickyLeft>
        <CardGrid
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-10%' }}
        >
          {SECURITY_CARDS.map(c => (
            <SecurityCard key={c.title} variants={cardItem}>
              <CardTitle>{c.icon} {c.title}</CardTitle>
              <CardDetail>{c.detail}</CardDetail>
            </SecurityCard>
          ))}
        </CardGrid>
      </Layout>
    </SectionInner>
  </Section>
);
