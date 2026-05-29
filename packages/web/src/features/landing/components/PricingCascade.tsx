import React from 'react';
import styled from 'styled-components';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { Section, SectionInner, SectionLabel, SectionHeading, SectionBody } from '../lib/primitives';

const CascadeWrap = styled.div`
  position: relative;
  perspective: 900px;
  height: 360px;
  margin-top: 64px;
  @media(max-width: 600px) { height: 280px; }
`;

const PriceCard = styled(motion.div)<{ $color: string }>`
  position: absolute;
  left: 50%;
  transform-origin: center top;
  background: rgba(7,12,20,0.85);
  border: 1px solid ${p => p.$color}33;
  border-radius: 16px;
  padding: 24px 32px;
  min-width: 280px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px ${p => p.$color}22;
`;

const TierLabel = styled.div<{ $color: string }>`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${p => p.$color};
  margin-bottom: 6px;
`;

const TierName = styled.h3`
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px;
`;

const TierDesc = styled.p`
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  margin: 0;
`;

const TIERS = [
  { label: 'Tier 1 — First match', name: 'Contract Rate', desc: 'Negotiated rate from active facility contract', color: '#1BAEE5', top: 0, z: 30, idx: 0 },
  { label: 'Tier 2 — Fallback', name: 'Medicare Rate', desc: 'CMS Medicare allowable by HCPC + state', color: '#7B5CF0', top: 60, z: 20, idx: 1 },
  { label: 'Tier 3 — Override', name: 'Manual Rate', desc: 'Admin-entered rate for non-covered items', color: '#00C896', top: 120, z: 10, idx: 2 },
];

// Each card needs its own component so hooks are called at the component level, not inside .map().
const TierCard: React.FC<{
  tier: typeof TIERS[0];
  scrollYProgress: ReturnType<typeof useScroll>['scrollYProgress'];
}> = ({ tier, scrollYProgress }) => {
  const i = tier.idx;
  const opacity = useTransform(scrollYProgress, [0.1 + i * 0.1, 0.4 + i * 0.1], [0, 1]);
  const y = useTransform(scrollYProgress, [0.1 + i * 0.1, 0.4 + i * 0.1], [40, 0]);
  return (
    <PriceCard
      $color={tier.color}
      style={{ top: tier.top, translateX: '-50%', zIndex: tier.z, opacity, y }}
    >
      <TierLabel $color={tier.color}>{tier.label}</TierLabel>
      <TierName>{tier.name}</TierName>
      <TierDesc>{tier.desc}</TierDesc>
    </PriceCard>
  );
};

export const PricingCascade: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });

  return (
    <Section ref={ref}>
      <SectionInner>
        <SectionLabel>Pricing Chain</SectionLabel>
        <SectionHeading>First match wins.</SectionHeading>
        <SectionBody>Contract → Medicare → Manual. The pricing waterfall resolves automatically so buyers always pay the best negotiated rate.</SectionBody>
        <CascadeWrap>
          {TIERS.map(tier => (
            <TierCard key={tier.name} tier={tier} scrollYProgress={scrollYProgress} />
          ))}
        </CascadeWrap>
      </SectionInner>
    </Section>
  );
};
