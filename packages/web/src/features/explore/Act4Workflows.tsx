import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';
import { WORKFLOW_LANES, PERSONAS } from '../landing/data/kb';

const Lanes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 36px;
`;

const Lane = styled(motion.article)`
  position: relative;
`;

const LaneHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`;

const LaneTitle = styled.h3`
  font-size: clamp(18px, 2.2vw, 22px);
  font-weight: 700;
  margin: 0;
  color: #fff;
  letter-spacing: -0.015em;
`;

const PersonaBadge = styled.span<{ $accent: string }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.$accent};
  background: ${p => p.$accent}14;
  border: 1px solid ${p => p.$accent}33;
  padding: 3px 8px;
  border-radius: 4px;
`;

const Track = styled.div`
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(180px, 1fr);
  gap: 0;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(27,174,229,0.4) transparent;
  &::-webkit-scrollbar { height: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(27,174,229,0.4); border-radius: 3px; }
`;

const Beat = styled(motion.div)<{ $first?: boolean; $last?: boolean }>`
  position: relative;
  padding: 16px 18px;
  background: rgba(255,255,255,0.025);
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  border-left: ${p => p.$first ? '1px solid rgba(255,255,255,0.06)' : 'none'};
  border-right: ${p => p.$last ? '1px solid rgba(255,255,255,0.06)' : 'none'};
  border-top-left-radius: ${p => p.$first ? '12px' : '0'};
  border-bottom-left-radius: ${p => p.$first ? '12px' : '0'};
  border-top-right-radius: ${p => p.$last ? '12px' : '0'};
  border-bottom-right-radius: ${p => p.$last ? '12px' : '0'};
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    right: -8px;
    transform: translateY(-50%);
    width: 16px;
    height: 1px;
    background: rgba(27,174,229,0.4);
    display: ${p => p.$last ? 'none' : 'block'};
    z-index: 1;
  }
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    right: -12px;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #1BAEE5;
    display: ${p => p.$last ? 'none' : 'block'};
    z-index: 2;
  }
`;

const Step = styled.div`
  font-size: 10px;
  color: rgba(27,174,229,0.7);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
  font-weight: 700;
`;

const BeatText = styled.div`
  font-size: 13.5px;
  color: rgba(255,255,255,0.85);
  line-height: 1.45;
`;

export const Act4Workflows: React.FC = () => (
  <ActSection id="workflows">
    <Glow $color="rgba(245,158,11,0.10)" $top="30%" $left="-10%" />
    <ActInner>
      <ActLabel>Act 4 — Workflows in motion</ActLabel>
      <ActTitle>The work doesn’t happen on a page. It happens on a rail.</ActTitle>
      <ActSub>
        Every flow below runs end-to-end inside Curavend — no integration tickets, no email handoffs, no "let me check with my AP person." Scroll a lane to follow the beats.
      </ActSub>

      <Lanes>
        {WORKFLOW_LANES.map((lane, li) => (
          <Lane
            key={lane.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.5, delay: li * 0.05 }}
          >
            <LaneHead>
              <LaneTitle>{lane.title}</LaneTitle>
              {lane.persona.map(pk => {
                const p = PERSONAS.find(x => x.key === pk);
                if (!p) return null;
                return <PersonaBadge key={pk} $accent={p.accent}>{p.icon} {p.name}</PersonaBadge>;
              })}
            </LaneHead>
            <Track>
              {lane.beats.map((b, i) => (
                <Beat
                  key={i}
                  $first={i === 0}
                  $last={i === lane.beats.length - 1}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.32, delay: i * 0.05 }}
                >
                  <Step>Step {String(i + 1).padStart(2, '0')}</Step>
                  <BeatText>{b}</BeatText>
                </Beat>
              ))}
            </Track>
          </Lane>
        ))}
      </Lanes>
    </ActInner>
  </ActSection>
);
