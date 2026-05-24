/**
 * Integrations grid — monochrome cards for each platform the app integrates with.
 */
import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useInView } from 'framer-motion';
import { Section, Container, Eyebrow, SectionTitle, Lede } from '../lib/primitives';
import { colors, easings, stagger } from '../lib/motionTokens';

const IntegrationsSection = styled(Section)`
  background: ${colors.bg1};
  padding: 140px 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-top: 48px;
`;

const Card = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 22px 18px;
  background: ${colors.glass};
  border: 1px solid ${colors.hairline};
  border-radius: 16px;
  min-height: 120px;
  text-align: center;
  transition: transform 0.3s ${easings.ease.toString()}, border-color 0.3s, background 0.3s;
  &:hover {
    transform: translateY(-4px);
    border-color: ${colors.brand};
    background: ${colors.glassHover};
  }
  & .name {
    font-size: 14px;
    font-weight: 600;
    color: ${colors.text};
  }
  & .kind {
    font-size: 11px;
    color: ${colors.textMuted};
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
`;

const Logo = styled.div<{ $color: string }>`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, ${(p) => p.$color}33 0%, ${(p) => p.$color}11 100%);
  border: 1px solid ${(p) => p.$color}66;
  color: ${(p) => p.$color};
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.02em;
  font-family: ui-monospace, SFMono-Regular, monospace;
`;

interface Integration {
  name: string;
  kind: string;
  abbr: string;
  color: string;
}

const ITEMS: Integration[] = [
  { name: 'Cloudflare Workers', kind: 'Runtime', abbr: 'CF', color: colors.brand },
  { name: 'Cloudflare D1', kind: 'Database', abbr: 'D1', color: colors.brand },
  { name: 'Cloudflare R2', kind: 'Object storage', abbr: 'R2', color: colors.brand },
  { name: 'Cloudflare KV', kind: 'Cache', abbr: 'KV', color: colors.brand },
  { name: 'Cloudflare Queues', kind: 'Messaging', abbr: 'Q', color: colors.brand },
  { name: 'Workers AI', kind: 'Llama 3.2 Vision', abbr: 'AI', color: colors.accent },
  { name: 'Browser Rendering', kind: 'PDF generation', abbr: 'BR', color: colors.accent },
  { name: 'Resend', kind: 'Email delivery', abbr: 'R', color: '#FFA94D' },
  { name: 'Stripe', kind: 'Payments', abbr: 'S', color: '#A48BFF' },
  { name: 'Epic FHIR', kind: 'Clinical data', abbr: 'E', color: '#FF6B6B' },
  { name: 'Fishbowl', kind: 'ERP', abbr: 'F', color: '#7ED957' },
  { name: 'NetSuite', kind: 'ERP', abbr: 'N', color: '#7ED957' },
  { name: 'SAP', kind: 'ERP', abbr: 'SAP', color: '#7ED957' },
  { name: 'QuickBooks', kind: 'ERP', abbr: 'QB', color: '#7ED957' },
];

export const IntegrationsGrid: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });

  return (
    <IntegrationsSection>
      <Container>
        <Eyebrow>Integrations</Eyebrow>
        <SectionTitle>Cloudflare-native, ERP-aware.</SectionTitle>
        <Lede>
          Built on Cloudflare's edge platform. Bridges to ERPs via HTTP / webhook / EDI-850.
          Inbound stock signals via HTTP poll / webhook / EDI-846. AI extraction from any
          medical-order PDF, fax, or photo.
        </Lede>
        <Grid ref={ref}>
          {ITEMS.map((item, i) => (
            <Card
              key={item.name}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.45, ease: easings.ease, delay: i * stagger.fast }}
            >
              <Logo $color={item.color}>{item.abbr}</Logo>
              <div className="name">{item.name}</div>
              <div className="kind">{item.kind}</div>
            </Card>
          ))}
        </Grid>
      </Container>
    </IntegrationsSection>
  );
};

export default IntegrationsGrid;
