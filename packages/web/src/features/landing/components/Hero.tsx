/**
 * Hero — full-viewport, parallax depth, mesh gradient + 5 layers.
 *
 * Layer 1 (sharpest): foreground glow + content
 * Layer 2: hex network
 * Layer 3: blob A (cyan)
 * Layer 4: blob B (indigo)
 * Layer 5 (most blurred, fastest): dotted grid
 */
import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useMotionValue, useScroll, useTransform } from 'framer-motion';
import { ArrowRightOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Section, Layer, Container, Spotlight, Eyebrow } from '../lib/primitives';
import { colors, easings, durations } from '../lib/motionTokens';
import { GridDots, HexNetwork, Blob, Wordmark } from '../assets/illustrations';

const HeroSection = styled(Section)`
  background: radial-gradient(ellipse at top, ${colors.bg2} 0%, ${colors.bg0} 70%);
  min-height: 100vh;
  display: flex;
  align-items: center;
`;

const HeroTitle = styled(motion.h1)`
  font-size: clamp(46px, 7vw, 92px);
  line-height: 1.02;
  letter-spacing: -0.03em;
  font-weight: 700;
  margin: 16px 0 24px 0;
  max-width: 16ch;
  /* Solid bright white text. The vertical gradient we use elsewhere is too
     aggressive at hero size — it fades the lower half of large letters to
     grey, which reads as "not sharp" against the busy background. A subtle
     text-shadow keeps the title crisp atop the hex network + blobs. */
  color: ${colors.text};
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25), 0 24px 60px rgba(6, 7, 11, 0.6);
  position: relative;
  z-index: 3;
`;

const HeroLede = styled(motion.p)`
  font-size: clamp(17px, 1.5vw, 21px);
  line-height: 1.55;
  color: ${colors.text};
  opacity: 0.78;
  max-width: 56ch;
  margin: 0 0 40px 0;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
  position: relative;
  z-index: 3;
`;

const CtaRow = styled(motion.div)`
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
`;

const CtaPrimary = styled(motion.button)`
  position: relative;
  padding: 14px 28px;
  border: none;
  background: linear-gradient(135deg, ${colors.brand} 0%, ${colors.accent} 100%);
  color: white;
  font-size: 15px;
  font-weight: 600;
  border-radius: 100px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 8px 32px ${colors.brand}55, 0 2px 0 ${colors.brandGlow}33 inset;
  transition: transform 0.3s ${easings.ease.toString()};
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 36px ${colors.brand}77, 0 2px 0 ${colors.brandGlow}55 inset;
  }
`;

const CtaSecondary = styled(motion.button)`
  padding: 14px 24px;
  background: transparent;
  border: 1px solid ${colors.hairlineStrong};
  color: ${colors.text};
  font-size: 15px;
  font-weight: 600;
  border-radius: 100px;
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s;
  &:hover {
    background: ${colors.glassHover};
    border-color: ${colors.brand};
  }
`;

const ScrollHint = styled(motion.div)`
  position: absolute;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  color: ${colors.textDim};
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 3;
`;

export const Hero: React.FC = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLElement>(null);
  // Critical: progress=0 when hero's top hits viewport top (i.e. scrollY=0
  // when the user lands on the page); progress=1 when the hero has fully
  // scrolled out. This way the title is at 100% opacity AT THE MOMENT THE
  // USER ARRIVES — and only starts fading as they actively scroll down.
  // The default `useScrollProgress` offset (`start end`/`end start`) put
  // progress at ~0.5 the instant the page loaded, dimming the title to
  // ~17% before the user did anything.
  const { scrollYProgress: progress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  // Spotlight follow-mouse
  const mx = useMotionValue(50);
  const my = useMotionValue(30);

  // Parallax transforms per layer
  const y1 = useTransform(progress, [0, 1], [0, -50]);
  const y2 = useTransform(progress, [0, 1], [0, -100]);
  const y3 = useTransform(progress, [0, 1], [0, -180]);
  const y4 = useTransform(progress, [0, 1], [0, -260]);
  const titleScale = useTransform(progress, [0, 0.8], [1, 0.95]);
  const titleOpacity = useTransform(progress, [0, 0.6, 1], [1, 1, 0]);

  return (
    <HeroSection
      ref={ref}
      onMouseMove={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 100);
        my.set(((e.clientY - r.top) / r.height) * 100);
      }}
    >
      <Spotlight
        style={
          {
            '--mx': useTransform(mx, (v) => `${v}%`),
            '--my': useTransform(my, (v) => `${v}%`),
          } as any
        }
      />

      <Layer $depth={5} style={{ y: y4, opacity: 0.5 }}>
        <GridDots />
      </Layer>
      <Layer $depth={4} style={{ y: y3 }}>
        <Blob color={colors.accent} size={760} style={{ position: 'absolute', left: '-200px', top: '-100px', opacity: 0.7 }} />
      </Layer>
      <Layer $depth={3} style={{ y: y2 }}>
        <Blob color={colors.brand} size={620} style={{ position: 'absolute', right: '-160px', top: '40%', opacity: 0.7 }} />
      </Layer>
      <Layer $depth={2} style={{ y: y1, opacity: 0.35 }}>
        <HexNetwork style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </Layer>

      <Container>
        <motion.div style={{ scale: titleScale, opacity: titleOpacity }}>
          <Eyebrow as={motion.div} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: durations.normal, ease: easings.ease }}>
            <Wordmark size={14} /> &nbsp;· Healthcare Supply Chain Platform
          </Eyebrow>
          <HeroTitle
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.hero, ease: easings.ease, delay: 0.1 }}
          >
            Healthcare supply chain, reimagined for the cloud.
          </HeroTitle>
          <HeroLede
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.hero, ease: easings.ease, delay: 0.25 }}
          >
            One platform for hospitals, vendors, labs, and providers. Multi-tenant ordering,
            intelligent vendor routing, contract-aware pricing, HIPAA-grade audit, and a Lab
            Portal that ships kits end-to-end — running entirely on Cloudflare.
          </HeroLede>
          <CtaRow
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.normal, ease: easings.ease, delay: 0.45 }}
          >
            <CtaPrimary onClick={() => navigate('/login')}>
              Sign in <ArrowRightOutlined />
            </CtaPrimary>
            <CtaSecondary onClick={() => (window.location.href = 'mailto:hello@curavend.com?subject=Curavend%20access%20request')}>
              Request access
            </CtaSecondary>
          </CtaRow>
        </motion.div>
      </Container>

      <ScrollHint
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span>Scroll to explore</span>
        <ArrowDownOutlined />
      </ScrollHint>
    </HeroSection>
  );
};

export default Hero;
