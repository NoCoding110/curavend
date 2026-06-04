import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Section, SectionInner, SectionLabel, SectionHeading, SectionBody } from '../lib/primitives';
import { EASE_OUT_EXPO } from '../lib/motionTokens';
import { PERSONAS, PERSONA_SIDEBARS, ROUTES, type PersonaKey } from '../data/kb';

const Wrap = styled.div`
  margin-top: 56px;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 32px;
  @media (max-width: 960px) { grid-template-columns: 1fr; }
`;

const Tabs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  @media (max-width: 960px) { flex-direction: row; overflow-x: auto; padding-bottom: 8px; }
`;

const Tab = styled.button<{ $active: boolean; $accent: string }>`
  text-align: left;
  background: ${p => p.$active ? 'rgba(255,255,255,0.06)' : 'transparent'};
  border: 1px solid ${p => p.$active ? p.$accent : 'rgba(255,255,255,0.06)'};
  border-radius: 12px;
  padding: 14px 16px;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background 0.18s, border-color 0.18s, transform 0.18s;
  position: relative;
  overflow: hidden;
  &:hover { background: rgba(255,255,255,0.04); transform: translateX(2px); }
  @media (max-width: 960px) { flex: 1 0 auto; padding: 10px 14px; }
`;

const TabIcon = styled.div`font-size: 22px;`;
const TabBody = styled.div`flex: 1; min-width: 0;`;
const TabName = styled.div`font-size: 15px; font-weight: 700; letter-spacing: -0.01em;`;
const TabVerb = styled.div`font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.08em;`;

const Stage = styled.div`
  position: relative;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  background: linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  padding: 32px;
  min-height: 540px;
  overflow: hidden;
  @media (max-width: 768px) { padding: 22px; }
`;

const AccentGlow = styled(motion.div)<{ $color: string }>`
  position: absolute;
  top: -100px;
  right: -100px;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: ${p => p.$color};
  filter: blur(120px);
  opacity: 0.25;
  pointer-events: none;
`;

const StageHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 8px;
  flex-wrap: wrap;
`;
const PersonaName = styled.h3`
  font-size: clamp(24px, 3.6vw, 34px);
  font-weight: 800;
  margin: 0;
  color: #fff;
  letter-spacing: -0.02em;
`;
const Tagline = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  font-style: italic;
`;
const Pitch = styled.p`
  font-size: 16px;
  color: rgba(255,255,255,0.78);
  line-height: 1.65;
  max-width: 700px;
  margin: 14px 0 28px;
`;

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 24px;
  @media (max-width: 768px) { grid-template-columns: 1fr; }
`;

const MockPortal = styled.div<{ $accent: string }>`
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  background: #0B121C;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset;
  position: relative;
`;
const MockBar = styled.div`
  height: 36px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 6px;
`;
const Dot = styled.span<{ $c: string }>`width: 10px; height: 10px; border-radius: 50%; background: ${p => p.$c};`;
const MockBody = styled.div`
  display: grid;
  grid-template-columns: 150px 1fr;
  min-height: 320px;
`;
const MockSidebar = styled.div<{ $accent: string }>`
  background: rgba(255,255,255,0.02);
  border-right: 1px solid rgba(255,255,255,0.04);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: rgba(255,255,255,0.55);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
`;
const MockNav = styled.button<{ $active?: boolean; $accent?: string }>`
  text-align: left;
  font: inherit;
  padding: 5px 8px;
  border-radius: 5px;
  background: ${p => p.$active ? `${p.$accent}1F` : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.55)'};
  border: none;
  border-left: 2px solid ${p => p.$active ? p.$accent : 'transparent'};
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  &:hover {
    background: ${p => p.$accent}14;
    color: #fff;
    border-left-color: ${p => p.$accent};
  }
`;
const MockContent = styled.div`
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;
const MockHeadline = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: rgba(255,255,255,0.9);
  letter-spacing: -0.01em;
`;
const MockGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
`;
const MockTile = styled.div<{ $accent: string; $tone?: 'big' | 'sm' }>`
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  padding: 10px;
  position: relative;
  overflow: hidden;
  &::before {
    content: '';
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 2px;
    background: ${p => p.$accent};
    opacity: 0.5;
  }
`;
const MockTileLabel = styled.div`font-size: 9px; color: rgba(255,255,255,0.5); letter-spacing: 0.06em; text-transform: uppercase;`;
const MockTileValue = styled.div`font-size: 16px; font-weight: 700; color: #fff; margin-top: 4px;`;
const MockRows = styled.div`display: flex; flex-direction: column; gap: 4px;`;
const MockRow = styled.div`
  display: grid; grid-template-columns: 1fr 60px 60px;
  font-size: 10px; color: rgba(255,255,255,0.6);
  padding: 5px 8px;
  background: rgba(255,255,255,0.02);
  border-radius: 4px;
`;

const Wins = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 18px;
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;
const Win = styled.div<{ $accent: string }>`
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-left: 3px solid ${p => p.$accent};
  padding: 12px 14px;
  border-radius: 8px;
`;
const WinMetric = styled.div<{ $accent: string }>`
  font-size: 22px;
  font-weight: 800;
  color: ${p => p.$accent};
  letter-spacing: -0.02em;
`;
const WinLabel = styled.div`font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px;`;

const ProblemSolution = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 18px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const PSBox = styled.div<{ $kind: 'problem' | 'solution' }>`
  background: ${p => p.$kind === 'problem' ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.05)'};
  border: 1px solid ${p => p.$kind === 'problem' ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)'};
  border-radius: 10px;
  padding: 14px 16px;
`;
const PSLabel = styled.div<{ $kind: 'problem' | 'solution' }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.$kind === 'problem' ? '#ef4444' : '#22c55e'};
  margin-bottom: 6px;
`;
const PSBody = styled.div`font-size: 13px; color: rgba(255,255,255,0.78); line-height: 1.6;`;

const FeatureList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 18px;
`;
const FeatureChip = styled.div<{ $accent: string }>`
  font-size: 11px;
  font-weight: 600;
  color: ${p => p.$accent};
  background: ${p => p.$accent}14;
  border: 1px solid ${p => p.$accent}33;
  padding: 5px 10px;
  border-radius: 999px;
`;

const ExploreLink = styled(Link)<{ $accent: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${p => p.$accent};
  text-decoration: none;
  margin-top: 22px;
  transition: gap 0.2s;
  &:hover { gap: 12px; }
`;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

const DetailCard = styled(motion.div)<{ $accent: string }>`
  margin: 10px 0;
  padding: 12px 14px;
  background: ${p => p.$accent}10;
  border: 1px solid ${p => p.$accent}40;
  border-radius: 8px;
  font-size: 11.5px;
  color: rgba(255,255,255,0.78);
  line-height: 1.55;
`;
const DetailPath = styled.code`
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  color: rgba(255,255,255,0.5);
  display: block;
  margin-bottom: 6px;
`;
const DetailReplaces = styled.div<{ $accent: string }>`
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(34,197,94,0.08);
  border-left: 2px solid #22C55E;
  border-radius: 4px;
  font-size: 10.5px;
  color: rgba(255,255,255,0.7);
  &::before {
    content: 'replaces ';
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #22C55E;
    text-transform: uppercase;
  }
`;

/* ─── Portal mockup tuned per-persona ───────────────────────────────────── */
const PortalMock: React.FC<{ persona: typeof PERSONAS[0] }> = ({ persona }) => {
  const sidebarItems = PERSONA_SIDEBARS[persona.key].slice(0, 10);
  const [activeIdx, setActiveIdx] = useState(1);
  const activeItem = sidebarItems[activeIdx];
  const activeRoute = ROUTES.find(r => r.path === activeItem?.path);
  return (
    <MockPortal $accent={persona.accent}>
      <MockBar>
        <Dot $c="#ff5f57" />
        <Dot $c="#febc2e" />
        <Dot $c="#28c840" />
      </MockBar>
      <MockBody>
        <MockSidebar $accent={persona.accent}>
          {sidebarItems.map((item, i) => (
            <MockNav
              key={i}
              $active={i === activeIdx}
              $accent={persona.accent}
              onClick={() => setActiveIdx(i)}
              title={item.path}
            >
              {item.label}
            </MockNav>
          ))}
        </MockSidebar>
        <MockContent>
          <MockHeadline>{activeItem?.label ?? persona.portal.headline}</MockHeadline>
          <AnimatePresence mode="wait">
            {activeRoute && (
              <DetailCard
                key={activeRoute.path}
                $accent={persona.accent}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22 }}
              >
                <DetailPath>{activeRoute.path}</DetailPath>
                {activeRoute.description}
                {activeRoute.replaces && (
                  <DetailReplaces $accent={persona.accent}>{activeRoute.replaces}</DetailReplaces>
                )}
              </DetailCard>
            )}
          </AnimatePresence>
          <MockGrid>
            {persona.wins.map((w, i) => (
              <MockTile key={i} $accent={persona.accent}>
                <MockTileLabel>{w.label.split(' ').slice(0, 2).join(' ')}</MockTileLabel>
                <MockTileValue>{w.metric}</MockTileValue>
              </MockTile>
            ))}
          </MockGrid>
        </MockContent>
      </MockBody>
    </MockPortal>
  );
};

export const PersonaShowcase: React.FC = () => {
  const [activeKey, setActiveKey] = useState<PersonaKey>('hospital');
  const active = PERSONAS.find(p => p.key === activeKey)!;

  return (
    <Section>
      <SectionInner>
        <SectionLabel>Who it’s for</SectionLabel>
        <SectionHeading>Six personas. One platform. Zero compromise.</SectionHeading>
        <SectionBody>Each role gets a workspace tuned to the work — same data, same source of truth, different lenses. Click a persona to see their portal.</SectionBody>

        <Wrap>
          <Tabs role="tablist" aria-label="Curavend personas">
            {PERSONAS.map(p => (
              <Tab
                key={p.key}
                role="tab"
                aria-selected={activeKey === p.key}
                $active={activeKey === p.key}
                $accent={p.accent}
                onClick={() => setActiveKey(p.key)}
              >
                <TabIcon>{p.icon}</TabIcon>
                <TabBody>
                  <TabName>{p.name}</TabName>
                  <TabVerb>{p.verb}</TabVerb>
                </TabBody>
              </Tab>
            ))}
          </Tabs>

          <Stage>
            <AccentGlow
              key={`glow-${active.key}`}
              $color={active.accent}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.25 }}
              transition={{ duration: 0.8 }}
            />
            <AnimatePresence mode="wait">
              <motion.div
                key={active.key}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -10 }}
                variants={fadeUp}
              >
                <StageHeader>
                  <PersonaName>{active.name}</PersonaName>
                  <Tagline>{active.tagline}</Tagline>
                </StageHeader>
                <Pitch>{active.pitch}</Pitch>

                <Wins>
                  {active.wins.map((w, i) => (
                    <Win key={i} $accent={active.accent}>
                      <WinMetric $accent={active.accent}>{w.metric}</WinMetric>
                      <WinLabel>{w.label}</WinLabel>
                    </Win>
                  ))}
                </Wins>

                <TwoCol>
                  <div>
                    <ProblemSolution>
                      <PSBox $kind="problem">
                        <PSLabel $kind="problem">Problem</PSLabel>
                        <PSBody>{active.problem}</PSBody>
                      </PSBox>
                      <PSBox $kind="solution">
                        <PSLabel $kind="solution">Curavend</PSLabel>
                        <PSBody>{active.solution}</PSBody>
                      </PSBox>
                    </ProblemSolution>
                    <FeatureList>
                      {active.topFeatures.map(f => (
                        <FeatureChip key={f} $accent={active.accent}>{f}</FeatureChip>
                      ))}
                    </FeatureList>
                  </div>
                  <div>
                    <PortalMock persona={active} />
                  </div>
                </TwoCol>

                <ExploreLink $accent={active.accent} to={`/explore#${active.key}`}>
                  Explore {active.name} deep-dive →
                </ExploreLink>
              </motion.div>
            </AnimatePresence>
          </Stage>
        </Wrap>
      </SectionInner>
    </Section>
  );
};
