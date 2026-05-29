import styled from 'styled-components';
import { motion } from 'framer-motion';
import { BG_BASE, BG_CARD, BORDER_SUBTLE, BORDER_BRAND } from './motionTokens';

export const Section = styled.section`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: ${BG_BASE};
`;

export const SectionInner = styled.div`
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 24px;
  @media (max-width: 768px) { padding: 60px 16px; }
`;

export const GlassCard = styled(motion.div)`
  background: ${BG_CARD};
  border: 1px solid ${BORDER_SUBTLE};
  border-radius: 16px;
  padding: 28px;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
  &:hover {
    background: rgba(255,255,255,0.07);
    border-color: ${BORDER_BRAND};
    box-shadow: 0 0 32px rgba(27,174,229,0.12);
  }
`;

export const Glow = styled.div<{ color?: string; size?: number }>`
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  pointer-events: none;
  background: ${p => p.color ?? 'rgba(27,174,229,0.25)'};
  width: ${p => p.size ?? 400}px;
  height: ${p => p.size ?? 400}px;
  transform: translate(-50%, -50%);
`;

export const SectionLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #1BAEE5;
  margin-bottom: 12px;
`;

export const SectionHeading = styled.h2`
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 700;
  color: #fff;
  margin: 0 0 16px;
  line-height: 1.15;
`;

export const SectionBody = styled.p`
  font-size: 18px;
  color: rgba(255,255,255,0.6);
  max-width: 600px;
  line-height: 1.7;
  margin: 0;
`;
