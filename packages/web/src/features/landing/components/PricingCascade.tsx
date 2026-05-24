/**
 * Pricing cascade — 4 angled glass cards.
 *
 * As the visitor scrolls, each card sharpens and rises while previous
 * cards push back and blur. Depth-of-field simulation.
 */
import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { Section, Container, Eyebrow, SectionTitle, Lede } from '../lib/primitives';
import { colors, easings, stagger } from '../lib/motionTokens';
import { useTilt } from '../lib/useTilt';

const PricingSection = styled(Section)`
  background: ${colors.bg1};
  padding: 140px 0;
`;

const Stack = styled.div`
  position: relative;
  margin-top: 64px;
  perspective: 1500px;
  perspective-origin: 50% 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
`;

const TierCard = styled(motion.div)`
  position: relative;
  width: min(720px, 92vw);
  padding: 28px 32px;
  border-radius: 18px;
  background: linear-gradient(135deg, ${colors.bg2} 0%, ${colors.bg3} 100%);
  border: 1px solid ${colors.hairline};
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  gap: 22px;
  transform-style: preserve-3d;
  will-change: transform, filter;
  & .num {
    flex: 0 0 56px;
    height: 56px;
    border-radius: 14px;
    background: linear-gradient(135deg, ${colors.brand} 0%, ${colors.accent} 100%);
    display: grid;
    place-items: center;
    font-size: 22px;
    font-weight: 700;
    color: white;
    box-shadow: 0 8px 24px ${colors.brand}55;
  }
  & h3 {
    font-size: 22px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: ${colors.text};
  }
  & p {
    color: ${colors.textDim};
    font-size: 14px;
    line-height: 1.5;
    margin: 0;
  }
  & .arrow {
    color: ${colors.brand};
    font-size: 24px;
  }
`;

const TIERS = [
  {
    title: 'Contract pricing',
    desc: 'If an ACTIVE contract covers this HCPC code for this hospital × vendor pair on this date, that price wins.',
  },
  {
    title: 'Custom fee schedule',
    desc: 'Else, fall back to a custom fee schedule attached at the hospital or vendor tier.',
  },
  {
    title: 'Medicare allowable',
    desc: 'Else, use the state-specific Medicare allowable for this HCPC code from the loaded fee schedule.',
  },
  {
    title: 'Manual override',
    desc: 'Else, surface a manual-pricing prompt to the orderer with all of the above shown side-by-side.',
  },
];

interface TierCardWrapProps {
  index: number;
  title: string;
  desc: string;
  inView: boolean;
}

/**
 * True depth-of-field: each card uses its OWN scroll progress so it
 * sharpens when ITSELF is centered in the viewport — not when the section
 * has been scrolled some hard-coded amount. This makes card 1 sharp the
 * moment it lands in the middle of the screen (instead of being blurred
 * until the user has scrolled deeper into the section).
 *
 * Offset `['start 90%', 'end 10%']` => progress 0 when the card's top
 * crosses 90% of the viewport (just appeared near the bottom), progress 1
 * when the card's bottom crosses 10% (about to leave at the top). The
 * card's center crossing the viewport center is roughly progress=0.5,
 * which is where we want maximum sharpness.
 */
const TierCardWrap: React.FC<TierCardWrapProps> = ({ index, title, desc, inView }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ['start 85%', 'end 15%'],
  });
  const { ref: tiltRef, rotateX, rotateY, transformPerspective, onMouseMove, onMouseLeave } = useTilt({ maxTilt: 4 });

  // Combine the two refs so a single DOM node is observed by both scroll AND tilt.
  const setRefs = (el: HTMLDivElement | null) => {
    (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    (tiltRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  // Sharp at center (progress 0.4–0.6), blurred at edges.
  const blur = useTransform(scrollYProgress, [0, 0.4, 0.5, 0.6, 1], [5, 0, 0, 0, 5]);
  // Slight rise — card grows a touch as it nears center.
  const scale = useTransform(scrollYProgress, [0, 0.4, 0.5, 0.6, 1], [0.95, 1, 1.02, 1, 0.95]);
  // Hold opacity high through the center, fade only at the very edges.
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.5, 0.85, 1], [0.55, 0.9, 1, 0.9, 0.55]);

  return (
    <TierCard
      ref={setRefs}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: easings.ease, delay: index * stagger.normal }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective,
        filter: useTransform(blur, (b) => `blur(${b}px)`),
        scale,
        opacity,
      }}
    >
      <div className="num">{index + 1}</div>
      <div style={{ flex: 1 }}>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      {index < TIERS.length - 1 && <span className="arrow">↓</span>}
    </TierCard>
  );
};

export const PricingCascade: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });

  return (
    <PricingSection ref={ref}>
      <Container>
        <Eyebrow>Contract-aware pricing</Eyebrow>
        <SectionTitle>The first match wins.</SectionTitle>
        <Lede>
          Curavend walks four pricing tiers in strict order. No row of the spreadsheet is ever
          guessed at — every line item is sourced and audit-logged with the tier it came from.
        </Lede>
        <Stack>
          {TIERS.map((t, i) => (
            <TierCardWrap
              key={t.title}
              index={i}
              title={t.title}
              desc={t.desc}
              inView={inView}
            />
          ))}
        </Stack>
      </Container>
    </PricingSection>
  );
};

export default PricingCascade;
