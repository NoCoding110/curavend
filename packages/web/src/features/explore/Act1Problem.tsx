import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';
import { INDUSTRY_GAPS } from '../landing/data/kb';

const GapList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

const Gap = styled(motion.article)`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 28px;
  padding: 28px;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 18px;
  position: relative;
  overflow: hidden;
  &:hover { border-color: rgba(239,68,68,0.25); }
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    padding: 22px;
  }
`;

const Stat = styled.div`
  font-size: clamp(40px, 6vw, 64px);
  font-weight: 900;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.04em;
  line-height: 1;
  font-feature-settings: 'tnum';
`;

const GapBody = styled.div`min-width: 0;`;

const GapHead = styled.h3`
  font-size: clamp(20px, 2.4vw, 26px);
  font-weight: 700;
  color: #fff;
  margin: 0 0 12px;
  letter-spacing: -0.015em;
  line-height: 1.25;
`;

const GapText = styled.p`
  font-size: 15px;
  color: rgba(255,255,255,0.65);
  line-height: 1.7;
  margin: 0 0 16px;
`;

const Answer = styled.div`
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  background: rgba(27,174,229,0.07);
  border: 1px solid rgba(27,174,229,0.22);
  border-radius: 10px;
  font-size: 14px;
  color: rgba(255,255,255,0.82);
  line-height: 1.6;
`;

const AnswerTag = styled.div`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #1BAEE5;
  background: rgba(27,174,229,0.12);
  padding: 4px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 1px;
`;

export const Act1Problem: React.FC = () => (
  <ActSection id="problem">
    <Glow $color="rgba(239,68,68,0.12)" $top="10%" $left="-10%" />
    <ActInner>
      <ActLabel>Act 1 — The Problem</ActLabel>
      <ActTitle>Healthcare supply chain is the most broken back office in medicine.</ActTitle>
      <ActSub>
        Every hospital, every vendor, every lab, every provider runs procurement on a stack of email, fax, PDFs, and "preferred-vendor lists" last updated in 2019.
        Here are the eight gaps that keep showing up — and how Curavend closes each one.
      </ActSub>

      <GapList>
        {INDUSTRY_GAPS.map((g, i) => (
          <Gap
            key={g.id}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-15%' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
          >
            <Stat>{g.stat}</Stat>
            <GapBody>
              <GapHead>{g.headline}</GapHead>
              <GapText>{g.body}</GapText>
              <Answer>
                <AnswerTag>Curavend</AnswerTag>
                <span>{g.curavendAnswer}</span>
              </Answer>
            </GapBody>
          </Gap>
        ))}
      </GapList>
    </ActInner>
  </ActSection>
);
