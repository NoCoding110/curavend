/**
 * Styled primitives shared across all landing sections.
 *
 * - <Section> — the 100vh-min wrapper with isolated stacking context
 * - <Layer> — absolutely-positioned parallax layer with depth-of-field blur
 * - <GlassCard> — frosted-glass surface
 * - <Spotlight> — cursor-tracking radial gradient (Hero only)
 * - <Glow> — colored bloom around buttons / nodes
 * - <Container> — max-width content centering
 * - <Eyebrow>, <SectionTitle>, <Lede> — typographic primitives
 */
import styled, { css, keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { colors } from './motionTokens';

export const Container = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  position: relative;
  z-index: 2;
`;

export const Section = styled.section<{ $minHeight?: string; $bg?: string }>`
  position: relative;
  min-height: ${(p) => p.$minHeight ?? '100vh'};
  background: ${(p) => p.$bg ?? colors.bg0};
  color: ${colors.text};
  isolation: isolate;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: stretch;
  padding: 96px 0;
`;

/**
 * Parallax background layer. `depth` 1 = sharpest, slowest. 5 = most
 * blurred, fastest. The actual translateY is driven by Framer Motion in
 * the consuming component; this just sets up positioning + blur.
 */
export const Layer = styled(motion.div)<{ $depth: 1 | 2 | 3 | 4 | 5 }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  ${(p) => {
    const blurMap = { 1: 0, 2: 2, 3: 4, 4: 8, 5: 16 } as const;
    return css`
      filter: blur(${blurMap[p.$depth]}px);
    `;
  }}
`;

export const GlassCard = styled(motion.div)`
  position: relative;
  background: ${colors.glass};
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid ${colors.hairline};
  border-radius: 20px;
  padding: 28px;
  color: ${colors.text};
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0));
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
`;

/**
 * Cursor-tracking radial gradient. The consumer maintains x/y MotionValues
 * for the cursor's position and passes them via inline style background-position.
 */
export const Spotlight = styled(motion.div)`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      600px circle at var(--mx, 50%) var(--my, 30%),
      rgba(27, 174, 229, 0.18),
      transparent 60%
    );
  mix-blend-mode: screen;
  z-index: 1;
`;

/**
 * Glow halo behind buttons or key nodes. `$color` may be brand or accent.
 */
export const Glow = styled.div<{ $color?: string; $size?: number; $intensity?: number }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  &::after {
    content: '';
    position: absolute;
    inset: -${(p) => p.$size ?? 80}px;
    background: radial-gradient(
      circle,
      ${(p) => p.$color ?? colors.brand} 0%,
      transparent 70%
    );
    opacity: ${(p) => p.$intensity ?? 0.35};
    filter: blur(28px);
  }
`;

export const Eyebrow = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${colors.brand};
  margin-bottom: 14px;
`;

export const SectionTitle = styled(motion.h2)`
  font-size: clamp(36px, 5vw, 60px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: ${colors.text};
  margin: 0 0 24px 0;
  max-width: 16ch;
  background: linear-gradient(180deg, ${colors.text} 0%, ${colors.textDim} 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
`;

export const Lede = styled(motion.p)`
  font-size: clamp(16px, 1.4vw, 19px);
  line-height: 1.6;
  color: ${colors.textDim};
  margin: 0 0 36px 0;
  max-width: 60ch;
`;

const drift = keyframes`
  0%, 100% { transform: translate3d(0,0,0) rotate(0); }
  50% { transform: translate3d(20px, -20px, 0) rotate(2deg); }
`;

export const FloatingShape = styled.div`
  animation: ${drift} 14s ease-in-out infinite;
`;
