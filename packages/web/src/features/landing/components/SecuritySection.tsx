/**
 * Security & compliance — sticky left intro column, scrolling right cards.
 */
import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useInView } from 'framer-motion';
import {
  SafetyCertificateOutlined,
  AuditOutlined,
  KeyOutlined,
  SafetyOutlined,
  DatabaseOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { Section, Container, Eyebrow, SectionTitle, Lede, GlassCard } from '../lib/primitives';
import { colors, easings, stagger } from '../lib/motionTokens';

const SecSection = styled(Section)`
  background: ${colors.bg0};
  padding: 140px 0;
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 1.4fr;
  gap: 56px;
  align-items: start;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 32px;
  }
`;

const StickyCol = styled.div`
  position: sticky;
  top: 96px;
  align-self: start;
`;

const CardGrid = styled.div`
  display: grid;
  gap: 16px;
`;

const Card = styled(GlassCard)`
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 18px;
  align-items: start;
  & .icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: ${colors.glass};
    border: 1px solid ${colors.hairline};
    display: grid;
    place-items: center;
    color: ${colors.brand};
    font-size: 22px;
  }
  & h3 {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 6px 0;
    color: ${colors.text};
  }
  & p {
    color: ${colors.textDim};
    font-size: 14px;
    line-height: 1.55;
    margin: 0;
  }
`;

const ITEMS = [
  {
    icon: <FileLogged />,
    title: 'PHI access log — every read, every export',
    desc: 'Every patient-data view writes to `phi_access_log` with user, IP, user agent, and timestamp. Required for HIPAA §164.312(b).',
  },
  {
    icon: <AuditOutlined />,
    title: 'OIG LEIE monthly exclusion screening',
    desc: 'Cron downloads the HHS/OIG exclusion CSV monthly and screens every active user by NPI + name. Excluded users are flagged immediately.',
  },
  {
    icon: <KeyOutlined />,
    title: 'TOTP + Email OTP MFA',
    desc: 'Authenticator-app MFA and email one-time codes. Admin accounts are mandatorily MFA-enforced. Failed logins lock the account.',
  },
  {
    icon: <SafetyOutlined />,
    title: '8-resource RBAC + group inheritance',
    desc: 'Per-user permissions over 8 resources at 4 levels (NONE/READ/WRITE/FULL). Groups bundle permissions and notification routes.',
  },
  {
    icon: <DatabaseOutlined />,
    title: 'Tenant-isolated R2 file scoping',
    desc: 'Every file in R2 is scoped to one tenant. The file-access middleware refuses cross-tenant downloads. File-access log captures every R2 read.',
  },
  {
    icon: <LockOutlined />,
    title: 'Cloudflare encryption at rest + in transit',
    desc: 'D1, R2, KV, and Queues are TLS-only and encrypted at rest. JWT-signed sessions; Turnstile bot protection on auth surfaces.',
  },
];

function FileLogged() {
  return <SafetyCertificateOutlined />;
}

export const SecuritySection: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });

  return (
    <SecSection>
      <Container>
        <TwoCol ref={ref}>
          <StickyCol>
            <Eyebrow>Security &amp; compliance</Eyebrow>
            <SectionTitle>Built on healthcare-grade primitives.</SectionTitle>
            <Lede>
              We didn't bolt compliance on. Every read of patient data flows through audited
              middleware. Every tenant lives behind its own scope. Every third-party call lands in
              the integration log.
            </Lede>
          </StickyCol>
          <CardGrid>
            {ITEMS.map((item, i) => (
              <Card
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, ease: easings.ease, delay: i * stagger.normal }}
              >
                <div className="icon">{item.icon}</div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </Card>
            ))}
          </CardGrid>
        </TwoCol>
      </Container>
    </SecSection>
  );
};

export default SecuritySection;
