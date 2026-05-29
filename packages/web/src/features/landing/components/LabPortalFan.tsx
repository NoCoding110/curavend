import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';
import { Section, SectionInner, SectionLabel, SectionHeading, SectionBody } from '../lib/primitives';

const FanArea = styled.div`
  position: relative;
  height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 56px;
`;

const AssetChip = styled(motion.div)<{ $color: string }>`
  position: absolute;
  background: rgba(7,12,20,0.9);
  border: 1px solid ${p => p.$color}44;
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 13px;
  font-weight: 600;
  color: ${p => p.$color};
  white-space: nowrap;
  backdrop-filter: blur(12px);
`;

const CenterBadge = styled(motion.div)`
  background: rgba(27,174,229,0.12);
  border: 1px solid rgba(27,174,229,0.3);
  border-radius: 16px;
  padding: 20px 28px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  text-align: center;
  z-index: 2;
`;

const ASSETS = [
  { label: '📄 TRF', color: '#1BAEE5', x: -200, y: -100 },
  { label: '📦 Shipping Label', color: '#7B5CF0', x: 140, y: -120 },
  { label: '↩️ Return Label', color: '#00C896', x: 200, y: 40 },
  { label: '🏷️ Specimen Sticker', color: '#FF6B35', x: 60, y: 140 },
  { label: '📋 Bundle PDF', color: '#F59E0B', x: -180, y: 100 },
];

// Each chip needs its own component so useTransform is called at component level.
const FanChip: React.FC<{
  asset: typeof ASSETS[0];
  spread: MotionValue<number>;
}> = ({ asset, spread }) => {
  const x = useTransform(spread, [0, 1], [0, asset.x]);
  const y = useTransform(spread, [0, 1], [0, asset.y]);
  return (
    <AssetChip $color={asset.color} style={{ x, y, opacity: spread }}>
      {asset.label}
    </AssetChip>
  );
};

export const LabPortalFan: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const spread = useTransform(scrollYProgress, [0.1, 0.6], [0, 1]);

  return (
    <Section ref={ref} style={{ background: '#080D16' }}>
      <SectionInner>
        <SectionLabel>Lab Portal</SectionLabel>
        <SectionHeading>Every kit asset, out of the box.</SectionHeading>
        <SectionBody>TRF, shipping labels, specimen stickers, return labels, and a consolidated claim PDF — generated automatically at order creation.</SectionBody>
        <FanArea>
          <CenterBadge
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Lab Order<br />
            <span style={{ fontSize: 12, color: '#1BAEE5', fontWeight: 500 }}>Kit Bundle Generated</span>
          </CenterBadge>
          {ASSETS.map((asset) => (
            <FanChip key={asset.label} asset={asset} spread={spread} />
          ))}
        </FanArea>
      </SectionInner>
    </Section>
  );
};
