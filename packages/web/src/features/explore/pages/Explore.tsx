import React, { useEffect, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { LandingNav } from '../../landing/components/LandingNav';
import { LandingFooter } from '../../landing/components/LandingFooter';
import { ScrollProvider } from '../../landing/lib/scrollProvider';
import { Act1Problem } from '../Act1Problem';
import { Act2Personas } from '../Act2Personas';
import { Act2_5RoutesAtlas } from '../Act2_5RoutesAtlas';
import { Act3Platform } from '../Act3Platform';
import { Act4Workflows } from '../Act4Workflows';
import { Act5Proof } from '../Act5Proof';
import { StatsStrip } from '../StatsStrip';
import { PERSONAS } from '../../landing/data/kb';

const GlobalExplore = createGlobalStyle`
  body { background: #070C14; margin: 0; }
  html { scroll-behavior: smooth; }
`;

const Hero = styled.section`
  position: relative;
  padding: 160px 24px 80px;
  overflow: hidden;
  text-align: left;
  max-width: 1200px;
  margin: 0 auto;
  @media (max-width: 768px) { padding: 130px 16px 60px; }
`;

const HeroLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #1BAEE5;
  margin-bottom: 18px;
`;

const HeroTitle = styled.h1`
  font-size: clamp(40px, 8vw, 84px);
  font-weight: 900;
  color: #fff;
  margin: 0 0 24px;
  letter-spacing: -0.035em;
  line-height: 1;
  max-width: 1000px;
  span { background: linear-gradient(135deg, #1BAEE5 0%, #22C55E 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
`;

const HeroSub = styled.p`
  font-size: clamp(17px, 2.2vw, 22px);
  color: rgba(255,255,255,0.65);
  max-width: 700px;
  line-height: 1.55;
  margin: 0 0 36px;
`;

const ActIndex = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
`;

const ActCard = styled.a`
  display: block;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 16px;
  text-decoration: none;
  color: rgba(255,255,255,0.8);
  transition: transform 0.18s, border-color 0.18s, background 0.18s;
  &:hover {
    transform: translateY(-2px);
    border-color: rgba(27,174,229,0.4);
    background: rgba(27,174,229,0.05);
  }
`;

const ActCardNum = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #1BAEE5;
  text-transform: uppercase;
`;

const ActCardTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin-top: 4px;
  letter-spacing: -0.01em;
`;

const PersonaChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 40px;
`;

const ChipLink = styled.a<{ $accent: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
  background: rgba(255,255,255,0.03);
  border: 1px solid ${p => p.$accent}33;
  padding: 8px 14px;
  border-radius: 999px;
  text-decoration: none;
  transition: all 0.18s;
  &:hover {
    background: ${p => p.$accent}14;
    border-color: ${p => p.$accent};
    color: #fff;
  }
`;

const Bg = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(800px circle at 80% 20%, rgba(27,174,229,0.08), transparent 50%),
    radial-gradient(600px circle at 10% 70%, rgba(168,85,247,0.06), transparent 50%);
`;

const Progress = styled(motion.div)`
  position: fixed;
  top: 64px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #1BAEE5, #22C55E);
  transform-origin: 0 50%;
  z-index: 150;
`;

const BackToTop = styled.button<{ $visible: boolean }>`
  position: fixed;
  bottom: 32px;
  right: 32px;
  z-index: 150;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #1BAEE5;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  opacity: ${p => p.$visible ? 1 : 0};
  pointer-events: ${p => p.$visible ? 'auto' : 'none'};
  transition: opacity 0.3s;
  box-shadow: 0 6px 22px rgba(27,174,229,0.4);
  &:hover { background: #0e8dc0; }
`;

export const Explore: React.FC = () => {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
      setShowTop(window.scrollY > window.innerHeight * 0.8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hash deep-link to a specific persona on first load
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, []);

  return (
    <ScrollProvider>
      <GlobalExplore />
      <Bg />
      <Progress style={{ scaleX: progress }} />
      <LandingNav />

      <Hero>
        <HeroLabel>The Curavend Knowledge Base</HeroLabel>
        <HeroTitle>
          Healthcare procurement was broken.<br/>
          <span>We rebuilt it from scratch.</span>
        </HeroTitle>
        <HeroSub>
          Six personas. Fifty-two features. Twenty-three workflows. One platform.
          This is the full story — the gaps in the industry, the personas who feel them, the workflows that fix them, and the proof that it ships.
        </HeroSub>

        <ActIndex>
          <ActCard href="#problem"><ActCardNum>Act 1</ActCardNum><ActCardTitle>The Problem</ActCardTitle></ActCard>
          <ActCard href="#personas"><ActCardNum>Act 2</ActCardNum><ActCardTitle>The Six Personas</ActCardTitle></ActCard>
          <ActCard href="#atlas"><ActCardNum>Act 2.5</ActCardNum><ActCardTitle>Routes Atlas</ActCardTitle></ActCard>
          <ActCard href="#platform"><ActCardNum>Act 3</ActCardNum><ActCardTitle>The Platform</ActCardTitle></ActCard>
          <ActCard href="#workflows"><ActCardNum>Act 4</ActCardNum><ActCardTitle>Workflows in motion</ActCardTitle></ActCard>
          <ActCard href="#proof"><ActCardNum>Act 5</ActCardNum><ActCardTitle>Why us</ActCardTitle></ActCard>
        </ActIndex>

        <PersonaChips>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', alignSelf: 'center' }}>Jump to:</span>
          {PERSONAS.map(p => (
            <ChipLink key={p.key} href={`#${p.key}`} $accent={p.accent}>
              <span>{p.icon}</span>
              <span>{p.name}</span>
            </ChipLink>
          ))}
        </PersonaChips>

        <StatsStrip />
      </Hero>

      <Act1Problem />
      <Act2Personas />
      <Act2_5RoutesAtlas />
      <Act3Platform />
      <Act4Workflows />
      <Act5Proof />

      <LandingFooter />

      <BackToTop
        $visible={showTop}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Back to top"
      >↑</BackToTop>
    </ScrollProvider>
  );
};

export default Explore;
