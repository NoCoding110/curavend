import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { GridDots, HexNetwork } from '../assets/illustrations';
import { EASE_OUT_EXPO, DUR_SLOW } from '../lib/motionTokens';

const HeroSection = styled.section`
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #070C14;
`;

const MeshGradient = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 20% 40%, rgba(27,174,229,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 80% 20%, rgba(99,60,200,0.1) 0%, transparent 55%),
    radial-gradient(ellipse 50% 50% at 50% 80%, rgba(27,174,229,0.06) 0%, transparent 60%);
`;

const Layer = styled(motion.div)<{ $depth: number }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${p => 1 - p.$depth * 0.15};
`;

const Content = styled(motion.div)`
  position: relative;
  z-index: 5;
  text-align: center;
  padding: 0 24px;
  max-width: 860px;
`;

const Eyebrow = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(27,174,229,0.1);
  border: 1px solid rgba(27,174,229,0.25);
  border-radius: 100px;
  padding: 6px 16px;
  font-size: 13px;
  color: #1BAEE5;
  font-weight: 500;
  letter-spacing: 0.04em;
  margin-bottom: 28px;
`;

const HeroTitle = styled(motion.h1)`
  font-size: clamp(36px, 7vw, 72px);
  font-weight: 800;
  line-height: 1.08;
  color: #fff;
  margin: 0 0 24px;
  letter-spacing: -0.02em;
  span { color: #1BAEE5; }
`;

const HeroSub = styled(motion.p)`
  font-size: clamp(16px, 2.5vw, 20px);
  color: rgba(255,255,255,0.6);
  max-width: 560px;
  margin: 0 auto 40px;
  line-height: 1.6;
`;

const CTARow = styled(motion.div)`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`;

const Chevron = styled(motion.div)`
  position: absolute;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  color: rgba(255,255,255,0.3);
  font-size: 22px;
`;

const variants = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: 0.1 + i * 0.12, duration: DUR_SLOW, ease: EASE_OUT_EXPO },
  }),
};

export const Hero: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const y4 = useTransform(scrollYProgress, [0, 1], [0, 200]);

  return (
    <HeroSection ref={ref}>
      <MeshGradient />

      <Layer $depth={4} style={{ y: y4, filter: 'blur(6px)' }}>
        <GridDots style={{ position: 'absolute', top: '5%', right: '2%', opacity: 0.5 }} />
      </Layer>
      <Layer $depth={3} style={{ y: y3, filter: 'blur(2px)' }}>
        <HexNetwork style={{ position: 'absolute', top: '10%', left: '5%', opacity: 0.6 }} />
      </Layer>
      <Layer $depth={2} style={{ y: y2 }}>
        <div style={{
          position: 'absolute', top: '20%', right: '8%',
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(27,174,229,0.12), transparent 70%)',
          filter: 'blur(40px)',
        }} />
      </Layer>

      <Content
        initial="hidden"
        animate="visible"
      >
        <Eyebrow custom={0} variants={variants}>
          <span>✦</span> Healthcare Supply Chain Platform
        </Eyebrow>
        <HeroTitle custom={1} variants={variants}>
          Healthcare supply chain,<br />
          <span>reimagined for the cloud.</span>
        </HeroTitle>
        <HeroSub custom={2} variants={variants}>
          Multi-tenant ordering, intelligent vendor routing, lab portal, Epic FHIR integration,
          and HIPAA-grade compliance — all on Cloudflare's global edge.
        </HeroSub>
        <CTARow custom={3} variants={variants}>
          <Link to="/login">
            <Button type="primary" size="large"
              style={{ background: '#1BAEE5', borderColor: '#1BAEE5', height: 48, padding: '0 32px', fontSize: 16, fontWeight: 600, borderRadius: 8 }}>
              Sign in →
            </Button>
          </Link>
          <Button size="large"
            style={{ height: 48, padding: '0 32px', fontSize: 16, borderRadius: 8, background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
            onClick={() => window.location.href = 'mailto:info@curavend.com?subject=Request Access'}>
            Request access
          </Button>
        </CTARow>
      </Content>

      <Chevron
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      >↓</Chevron>
    </HeroSection>
  );
};
