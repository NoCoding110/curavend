import React, { useEffect, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { motion } from 'framer-motion';
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
import { IndustryTicker } from '../IndustryTicker';
import { CompassLayout } from '../CompassLayout';
import { PERSONAS } from '../../landing/data/kb';

type Mode = 'compass' | 'story';
const STORAGE_KEY = 'curavend-kb-mode';

const GlobalExplore = createGlobalStyle`
  body { background: #070C14; margin: 0; }
  html { scroll-behavior: smooth; }
`;

const Hero = styled.section`
  position: relative;
  padding: 130px 24px 40px;
  overflow: hidden;
  text-align: left;
  max-width: 1280px;
  margin: 0 auto;
  @media (max-width: 768px) { padding: 110px 16px 32px; }
`;

const HeroLabel = styled.div`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #1BAEE5;
  margin-bottom: 14px;
`;

const HeroTitle = styled.h1`
  font-size: clamp(36px, 6.5vw, 68px);
  font-weight: 900;
  color: #fff;
  margin: 0 0 18px;
  letter-spacing: -0.035em;
  line-height: 1.02;
  max-width: 1000px;
  span { background: linear-gradient(135deg, #1BAEE5 0%, #22C55E 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
`;

const HeroSub = styled.p`
  font-size: clamp(15px, 1.9vw, 18px);
  color: rgba(255,255,255,0.65);
  max-width: 720px;
  line-height: 1.55;
  margin: 0 0 22px;
`;

const ModeBar = styled.div`
  position: absolute;
  top: 88px;
  right: 24px;
  display: flex;
  gap: 4px;
  align-items: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 999px;
  padding: 4px;
  @media (max-width: 768px) {
    position: static;
    margin-bottom: 18px;
  }
`;

const ModeBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: ${p => p.$active ? 'rgba(27,174,229,0.18)' : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.6)'};
  cursor: pointer;
  transition: all 0.18s;
  &:hover { color: #fff; }
`;

/* Story-mode legacy act index */
const ActIndex = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
  margin-top: 28px;
`;
const ActCard = styled.a`
  display: block;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 16px;
  text-decoration: none;
  color: rgba(255,255,255,0.8);
  transition: all 0.18s;
  &:hover { transform: translateY(-2px); border-color: rgba(27,174,229,0.4); background: rgba(27,174,229,0.05); }
`;
const ActCardNum = styled.div`font-size: 10px; font-weight: 700; letter-spacing: 0.16em; color: #1BAEE5; text-transform: uppercase;`;
const ActCardTitle = styled.div`font-size: 15px; font-weight: 700; color: #fff; margin-top: 4px; letter-spacing: -0.01em;`;

const PersonaChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
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
  cursor: pointer;
  transition: all 0.18s;
  &:hover { background: ${p => p.$accent}14; border-color: ${p => p.$accent}; color: #fff; }
`;

const Bg = styled.div`
  position: fixed;
  inset: 0;
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
  const [mode, setMode] = useState<Mode>('compass');
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  // Restore mode from localStorage (default = compass).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'story' || saved === 'compass') setMode(saved as Mode);
  }, []);

  // Persist mode + scroll progress.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

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

  // Story-mode hash-deep-link (Compass handles hash itself).
  useEffect(() => {
    if (mode !== 'story' || !window.location.hash) return;
    const id = window.location.hash.slice(1).split('/')[0];
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }, [mode]);

  return (
    <ScrollProvider>
      <GlobalExplore />
      <Bg />
      <Progress style={{ scaleX: progress }} />
      <LandingNav />

      <Hero>
        <ModeBar>
          <ModeBtn $active={mode === 'compass'} onClick={() => setMode('compass')} title="One section at a time">🧭 Compass</ModeBtn>
          <ModeBtn $active={mode === 'story'} onClick={() => setMode('story')} title="Long-scroll narrative">📖 Story</ModeBtn>
        </ModeBar>

        <HeroLabel>The Curavend Knowledge Base</HeroLabel>
        <HeroTitle>
          Healthcare procurement was broken.<br/>
          <span>We rebuilt it from scratch.</span>
        </HeroTitle>
        <HeroSub>
          {mode === 'compass'
            ? 'Pick a section on the left and dive in. Six personas, ninety-two routes, fifty-two features, twenty-three workflows — one screen at a time.'
            : 'Six personas. Fifty-two features. Twenty-three workflows. One platform. The full story — top to bottom.'}
        </HeroSub>

        <StatsStrip />

        {mode === 'compass' ? (
          <IndustryTicker />
        ) : (
          <>
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
          </>
        )}
      </Hero>

      {mode === 'compass' ? (
        <CompassLayout />
      ) : (
        <>
          <Act1Problem />
          <Act2Personas />
          <Act2_5RoutesAtlas />
          <Act3Platform />
          <Act4Workflows />
          <Act5Proof />
        </>
      )}

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
