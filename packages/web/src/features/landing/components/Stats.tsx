import React, { useRef, useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, useInView } from 'framer-motion';
import { Section, SectionInner, SectionLabel, SectionHeading } from '../lib/primitives';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px;
  margin-top: 56px;
`;

const StatCard = styled(motion.div)`
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 28px 24px;
  text-align: center;
`;

const StatNum = styled.div`
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 800;
  color: #1BAEE5;
  line-height: 1;
  margin-bottom: 8px;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: rgba(255,255,255,0.5);
  line-height: 1.4;
`;

function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const dur = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target]);
  return <div ref={ref}>{val}{suffix}</div>;
}

const STATS = [
  { target: 89, suffix: '+', label: 'API Route Files' },
  { target: 73, suffix: '+', label: 'Schema Tables' },
  { target: 8, suffix: '', label: 'Cron Automations' },
  { target: 6, suffix: '', label: 'User Personas' },
  { target: 8, suffix: '', label: 'Order Sub-States' },
  { target: 8, suffix: '', label: 'Contract States' },
  { target: 4, suffix: '', label: 'Pricing Tiers' },
  { target: 11, suffix: '', label: 'Role Types' },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export const Stats: React.FC = () => (
  <Section>
    <SectionInner>
      <SectionLabel>Built in depth</SectionLabel>
      <SectionHeading>Numbers don't lie.</SectionHeading>
      <Grid
        as={motion.div}
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-10%' }}
      >
        {STATS.map(s => (
          <StatCard key={s.label} variants={item}>
            <StatNum><Counter target={s.target} suffix={s.suffix} /></StatNum>
            <StatLabel>{s.label}</StatLabel>
          </StatCard>
        ))}
      </Grid>
    </SectionInner>
  </Section>
);
