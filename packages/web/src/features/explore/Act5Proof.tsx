import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';
import { PILLARS } from '../landing/data/kb';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 60px;
`;

const Pillar = styled(motion.div)`
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  padding: 26px 28px;
  transition: border-color 0.18s, background 0.18s;
  &:hover { border-color: rgba(27,174,229,0.4); background: rgba(255,255,255,0.05); }
`;

const Emoji = styled.div`font-size: 32px; margin-bottom: 14px;`;

const PTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px;
  letter-spacing: -0.015em;
`;

const PDetail = styled.p`
  font-size: 14px;
  color: rgba(255,255,255,0.65);
  line-height: 1.6;
  margin: 0;
`;

const Closing = styled.div`
  background: linear-gradient(135deg, rgba(27,174,229,0.12), rgba(27,174,229,0.02));
  border: 1px solid rgba(27,174,229,0.25);
  border-radius: 24px;
  padding: 48px 40px;
  text-align: center;
  position: relative;
  overflow: hidden;
  @media (max-width: 640px) { padding: 36px 24px; }
`;

const ClosingHead = styled.h3`
  font-size: clamp(26px, 4vw, 38px);
  font-weight: 800;
  color: #fff;
  margin: 0 0 14px;
  letter-spacing: -0.025em;
  line-height: 1.15;
`;

const ClosingBody = styled.p`
  font-size: 16px;
  color: rgba(255,255,255,0.7);
  max-width: 600px;
  margin: 0 auto 28px;
  line-height: 1.65;
`;

const CTAGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`;

const Primary = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: #1BAEE5;
  text-decoration: none;
  padding: 13px 26px;
  border-radius: 10px;
  transition: background 0.18s, transform 0.18s;
  &:hover { background: #0e8dc0; transform: translateY(-1px); }
`;

const Secondary = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  text-decoration: none;
  padding: 12px 24px;
  border-radius: 10px;
  transition: background 0.18s;
  &:hover { background: rgba(255,255,255,0.1); }
`;

const Docs = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #1BAEE5;
  text-decoration: none;
  padding: 12px 18px;
  border-radius: 10px;
  &:hover { background: rgba(27,174,229,0.08); }
`;

export const Act5Proof: React.FC = () => (
  <ActSection id="proof">
    <Glow $color="rgba(27,174,229,0.18)" $top="60%" $left="60%" $size={700} />
    <ActInner>
      <ActLabel>Act 5 — Why us</ActLabel>
      <ActTitle>This isn’t a slide deck. It runs.</ActTitle>
      <ActSub>
        145 D1 tables. 55 Worker routes. 23 permission resources. Live in production at the edge.
        Every claim above is in the code, not in a future quarter.
      </ActSub>

      <Grid>
        {PILLARS.map((p, i) => (
          <Pillar
            key={p.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
          >
            <Emoji>{p.emoji}</Emoji>
            <PTitle>{p.title}</PTitle>
            <PDetail>{p.detail}</PDetail>
          </Pillar>
        ))}
      </Grid>

      <Closing>
        <ClosingHead>You shouldn’t have to fax in 2026.</ClosingHead>
        <ClosingBody>
          If your supply chain still runs on email, fax, and "preferred vendor lists" — Curavend was built for you. Sign in, or download the full platform reference and read every page.
        </ClosingBody>
        <CTAGroup>
          <Primary to="/login">Sign in →</Primary>
          <Secondary to="/">Back to landing</Secondary>
          <Docs href="/docs/platform-reference.docx" download="Curavend_Platform_Page_Reference.docx">
            ⬇ Platform Reference (.docx)
          </Docs>
        </CTAGroup>
      </Closing>
    </ActInner>
  </ActSection>
);
