import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useInView } from 'framer-motion';
import { ROUTES, PERSONAS, INDUSTRY_GAPS } from '../landing/data/kb';

const Strip = styled.div`
  margin-top: 40px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
`;

const Item = styled.div`
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  padding: 18px 20px;
`;

const N = styled.div`
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1;
  font-feature-settings: 'tnum';
  background: linear-gradient(135deg, #1BAEE5 0%, #22C55E 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
`;

const L = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.55);
  margin-top: 8px;
`;

function useCount(target: number, duration = 1600): { ref: React.RefObject<HTMLDivElement>; value: number } {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>, { once: true, margin: '-10% 0px' });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, duration]);
  return { ref, value };
}

const Stat: React.FC<{ target: number; label: string }> = ({ target, label }) => {
  const { ref, value } = useCount(target);
  return (
    <Item ref={ref}>
      <N>{value}</N>
      <L>{label}</L>
    </Item>
  );
};

export const StatsStrip: React.FC = () => (
  <Strip>
    <Stat target={ROUTES.length} label="Routes" />
    <Stat target={PERSONAS.length} label="Personas" />
    <Stat target={52} label="Features" />
    <Stat target={23} label="Workflows" />
    <Stat target={INDUSTRY_GAPS.length} label="Industry gaps closed" />
    <Stat target={145} label="D1 tables" />
  </Strip>
);
