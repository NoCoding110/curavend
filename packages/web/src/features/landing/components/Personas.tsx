import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Section, SectionInner, SectionLabel, SectionHeading, SectionBody, GlassCard } from '../lib/primitives';
import { useTilt } from '../lib/useTilt';
import { STAGGER_MED, EASE_OUT_EXPO } from '../lib/motionTokens';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 56px;
`;

const PersonaCard = styled(GlassCard)`
  cursor: default;
  transform-style: preserve-3d;
  perspective: 800px;
`;

const CardIcon = styled.div`
  font-size: 36px;
  margin-bottom: 16px;
`;

const CardTitle = styled.h3`
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px;
`;

const CardVerb = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1BAEE5;
  margin-bottom: 12px;
`;

const CardDesc = styled.p`
  font-size: 14px;
  color: rgba(255,255,255,0.55);
  line-height: 1.6;
  margin: 0;
`;

const PERSONAS = [
  { icon: '🏥', title: 'Hospital', verb: 'Order & Track', desc: 'Create orders, manage approvals, track shipments, control budgets, and connect to Epic — all from one workspace.' },
  { icon: '🏭', title: 'Vendor', verb: 'Fulfill & Ship', desc: 'Receive routed orders, confirm fulfillment, upload tracking, manage SKUs, and sync inventory via ERP connectors.' },
  { icon: '🧪', title: 'Lab', verb: 'Process & Ship', desc: 'Accept lab orders, manage kit assets & TRF, track consumable inventory with lot-level tracing, and auto-replenish.' },
  { icon: '👨‍⚕️', title: 'Provider', verb: 'Refer & Authorize', desc: 'Create and manage clinical encounters, initiate prior authorizations, and view patient FHIR data from Epic.' },
  { icon: '🔗', title: 'Super-Vendor', verb: 'Aggregate & Report', desc: 'Manage a network of child vendors, consolidate cross-vendor reporting, and monitor collective performance scores.' },
  { icon: '⚙️', title: 'Admin', verb: 'Govern & Configure', desc: 'Manage users, groups, permissions, EHR connections, formulary, compliance, OIG screening, and workflow control.' },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_MED } },
};
const cardVariant = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease: EASE_OUT_EXPO } },
};

const TiltCard: React.FC<{ persona: typeof PERSONAS[0] }> = ({ persona }) => {
  const { ref, rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt();
  return (
    <PersonaCard
      ref={ref}
      variants={cardVariant}
      style={{ rotateX, rotateY }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <CardIcon>{persona.icon}</CardIcon>
      <CardVerb>{persona.verb}</CardVerb>
      <CardTitle>{persona.title}</CardTitle>
      <CardDesc>{persona.desc}</CardDesc>
    </PersonaCard>
  );
};

export const Personas: React.FC = () => (
  <Section>
    <SectionInner>
      <SectionLabel>Who it's for</SectionLabel>
      <SectionHeading>One platform, six personas.</SectionHeading>
      <SectionBody>From the bedside to the boardroom — each role gets a purpose-built workspace with the right data and the right actions.</SectionBody>
      <Grid
        as={motion.div}
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-10%' }}
      >
        {PERSONAS.map(p => <TiltCard key={p.title} persona={p} />)}
      </Grid>
    </SectionInner>
  </Section>
);
