import styled from 'styled-components';
import { motion } from 'framer-motion';

export const ActSection = styled.section`
  position: relative;
  padding: 96px 24px;
  background: #070C14;
  border-top: 1px solid rgba(255,255,255,0.04);
  overflow: hidden;
  @media (max-width: 768px) { padding: 72px 16px; }
`;

export const ActInner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
`;

export const ActLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #1BAEE5;
  margin-bottom: 14px;
`;

export const ActTitle = styled.h2`
  font-size: clamp(32px, 6vw, 56px);
  font-weight: 800;
  letter-spacing: -0.025em;
  color: #fff;
  margin: 0 0 18px;
  line-height: 1.05;
  max-width: 900px;
`;

export const ActSub = styled.p`
  font-size: clamp(15px, 2vw, 18px);
  color: rgba(255,255,255,0.6);
  max-width: 720px;
  line-height: 1.7;
  margin: 0 0 56px;
`;

export const Glow = styled.div<{ $color?: string; $size?: number; $top?: string; $left?: string }>`
  position: absolute;
  top: ${p => p.$top ?? '20%'};
  left: ${p => p.$left ?? '70%'};
  width: ${p => p.$size ?? 600}px;
  height: ${p => p.$size ?? 600}px;
  border-radius: 50%;
  background: ${p => p.$color ?? 'rgba(27,174,229,0.18)'};
  filter: blur(120px);
  pointer-events: none;
  z-index: 0;
`;

export const MotionDiv = motion.div;
