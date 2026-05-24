/**
 * Personas — 6 tilt cards. Each card uses mouse-aware tilt for hover depth.
 *
 * Click to expand the card with a longer role description.
 */
import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { Section, Container, Eyebrow, SectionTitle, Lede, GlassCard } from '../lib/primitives';
import { colors, easings, stagger } from '../lib/motionTokens';
import { useTilt } from '../lib/useTilt';
import {
  HospitalMark,
  VendorMark,
  LabMark,
  ProviderMark,
  SuperVendorMark,
  AdminMark,
} from '../assets/illustrations';

const PersonaSection = styled(Section)`
  background: linear-gradient(180deg, ${colors.bg0} 0%, ${colors.bg1} 100%);
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 48px;
`;

const Card = styled(GlassCard)`
  cursor: pointer;
  padding: 32px;
  min-height: 220px;
  will-change: transform;
  & h3 {
    font-size: 20px;
    font-weight: 600;
    margin: 16px 0 6px 0;
    color: ${colors.text};
  }
  & .verb {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: ${colors.brand};
    text-transform: uppercase;
  }
  & p {
    color: ${colors.textDim};
    font-size: 14px;
    line-height: 1.55;
    margin: 8px 0 0 0;
  }
`;

const Expanded = styled(motion.div)`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid ${colors.hairline};
  color: ${colors.textDim};
  font-size: 14px;
  line-height: 1.55;
  & b {
    color: ${colors.text};
    font-weight: 600;
  }
`;

interface Persona {
  key: string;
  verb: string;
  title: string;
  blurb: string;
  detail: React.ReactNode;
  icon: React.ReactNode;
}

const PERSONAS: Persona[] = [
  {
    key: 'hospital',
    verb: 'Order',
    title: 'Hospitals',
    blurb: 'Place DME, biologics, wound-care and supply orders against the right vendor for every line item.',
    detail: (
      <>
        <b>Procurement teams</b> get auto-routed orders, contract-aware pricing, and per-facility scoping. Department-level groups inherit permissions; SLA breach alerts hit the right ops humans.
      </>
    ),
    icon: <HospitalMark size={44} />,
  },
  {
    key: 'vendor',
    verb: 'Fulfill',
    title: 'Vendors',
    blurb: 'Confirm receipt, dispense, ship, and invoice — all in one console with live stock feeds.',
    detail: (
      <>
        <b>Distributors</b> connect ERPs (Fishbowl, NetSuite, SAP, QuickBooks) via HTTP / webhook / EDI-850. Stock feeds keep routing fresh; bulk tracking uploads close the last mile.
      </>
    ),
    icon: <VendorMark size={44} />,
  },
  {
    key: 'lab',
    verb: 'Process',
    title: 'Labs',
    blurb: 'Run direct-to-patient or single-site kits with auto-generated TRFs, labels and stickers.',
    detail: (
      <>
        <b>Lab Portal</b> ships TRF + outbound shipping label + return label + stickers + consolidated PDF as one workflow. Kit-site catalog and group-level QC tracking included.
      </>
    ),
    icon: <LabMark size={44} />,
  },
  {
    key: 'provider',
    verb: 'Refer',
    title: 'Providers',
    blurb: 'Physician groups and home-health agencies placing orders on behalf of patient care.',
    detail: (
      <>
        <b>Practices</b> order across multiple hospital networks, see per-physician spend reports, and stay synced with EHR via the Epic FHIR scaffolding.
      </>
    ),
    icon: <ProviderMark size={44} />,
  },
  {
    key: 'super',
    verb: 'Aggregate',
    title: 'Super-Vendors',
    blurb: 'Aggregate multiple child vendors into a single ERP push and a single contract relationship.',
    detail: (
      <>
        <b>Group parents</b> aggregate ordering across a network of child vendors. One catalog upstream, many fulfillment edges downstream.
      </>
    ),
    icon: <SuperVendorMark size={44} />,
  },
  {
    key: 'admin',
    verb: 'Govern',
    title: 'Platform Admins',
    blurb: 'Approve users, monitor PHI access logs, run OIG screening, manage workflows and integrations.',
    detail: (
      <>
        <b>Admins</b> get full visibility: integration retry queues, file-access audit, workflow control plane (terminate / raise event / purge), monthly OIG LEIE refresh.
      </>
    ),
    icon: <AdminMark size={44} />,
  },
];

const PersonaCard: React.FC<{ persona: Persona; index: number; inView: boolean }> = ({
  persona,
  index,
  inView,
}) => {
  const [expanded, setExpanded] = useState(false);
  const { ref, rotateX, rotateY, transformPerspective, onMouseMove, onMouseLeave } = useTilt({ maxTilt: 6 });

  return (
    <Card
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, ease: easings.ease, delay: index * stagger.normal }}
      style={{
        rotateX,
        rotateY,
        transformPerspective,
        transformStyle: 'preserve-3d',
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={() => setExpanded((v) => !v)}
    >
      {persona.icon}
      <div className="verb">{persona.verb}</div>
      <h3>{persona.title}</h3>
      <p>{persona.blurb}</p>
      <AnimatePresence>
        {expanded && (
          <Expanded
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: easings.ease }}
          >
            {persona.detail}
          </Expanded>
        )}
      </AnimatePresence>
    </Card>
  );
};

export const Personas: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });

  return (
    <PersonaSection>
      <Container>
        <Eyebrow>One platform · six personas</Eyebrow>
        <SectionTitle>
          Built for everyone in the chain.
        </SectionTitle>
        <Lede>
          Whether you order, fulfill, process, refer, aggregate, or govern — Curavend gives you a
          tenant-scoped workspace with the right tools and the right data.
        </Lede>
        <Grid ref={ref}>
          {PERSONAS.map((p, i) => (
            <PersonaCard key={p.key} persona={p} index={i} inView={inView} />
          ))}
        </Grid>
      </Container>
    </PersonaSection>
  );
};

export default Personas;
