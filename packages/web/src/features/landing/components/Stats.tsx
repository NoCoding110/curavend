/**
 * Stats — 8 scroll-triggered count-up numbers in a grid.
 */
import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Section, Container, Eyebrow, SectionTitle, Lede } from '../lib/primitives';
import { useCountUp } from '../lib/useCountUp';
import { colors, easings } from '../lib/motionTokens';

const StatsSection = styled(Section)`
  background: linear-gradient(180deg, ${colors.bg1} 0%, ${colors.bg0} 100%);
  padding: 140px 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 24px;
  margin-top: 56px;
`;

const StatCard = styled(motion.div)`
  padding: 28px 22px;
  background: ${colors.glass};
  border: 1px solid ${colors.hairline};
  border-radius: 18px;
  text-align: left;
  & .num {
    font-size: clamp(40px, 4vw, 56px);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
    background: linear-gradient(180deg, ${colors.text} 0%, ${colors.brandGlow} 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  & .suffix {
    font-size: 20px;
    color: ${colors.brand};
    font-weight: 700;
  }
  & .label {
    margin-top: 12px;
    color: ${colors.textDim};
    font-size: 13px;
    line-height: 1.45;
  }
`;

interface Stat {
  value: number;
  suffix: string;
  label: string;
}

const STATS: Stat[] = [
  { value: 56, suffix: '+', label: 'API route files driving every workflow' },
  { value: 73, suffix: '+', label: 'Database tables modeling every relationship' },
  { value: 8, suffix: '', label: 'Cron automations running 24/7' },
  { value: 6, suffix: '', label: 'User personas in one platform' },
  { value: 8, suffix: '', label: 'Order sub-states for granular tracking' },
  { value: 8, suffix: '', label: 'Contract lifecycle states with full audit trails' },
  { value: 4, suffix: '-tier', label: 'Pricing fallback (contract → fee → Medicare → manual)' },
  { value: 11, suffix: '', label: 'Role types across the RBAC matrix' },
];

const StatCardItem: React.FC<{ stat: Stat; index: number }> = ({ stat, index }) => {
  const [value, ref] = useCountUp({ to: stat.value, duration: 1400 });
  return (
    <StatCard
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.5, ease: easings.ease, delay: index * 0.05 }}
    >
      <div className="num">
        {value}
        <span className="suffix">{stat.suffix}</span>
      </div>
      <div className="label">{stat.label}</div>
    </StatCard>
  );
};

export const Stats: React.FC = () => {
  return (
    <StatsSection>
      <Container>
        <Eyebrow>Built in depth</Eyebrow>
        <SectionTitle>Numbers behind the platform.</SectionTitle>
        <Lede>
          Each number reflects what's actually shipping today — verifiable in source. No
          marketing math.
        </Lede>
        <Grid>
          {STATS.map((s, i) => (
            <StatCardItem key={s.label} stat={s} index={i} />
          ))}
        </Grid>
      </Container>
    </StatsSection>
  );
};

export default Stats;
