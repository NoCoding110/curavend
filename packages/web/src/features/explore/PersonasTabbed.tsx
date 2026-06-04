import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { PERSONAS, PERSONA_SIDEBARS, ROUTES, type Persona, type PersonaKey } from '../landing/data/kb';

/* ─── Tab strip ──────────────────────────────────────────────────────────── */
const TabStrip = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 22px;
  flex-wrap: wrap;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
`;

const Tab = styled.button<{ $active: boolean; $accent: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid ${p => p.$active ? p.$accent : 'rgba(255,255,255,0.08)'};
  background: ${p => p.$active ? `${p.$accent}1c` : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.65)'};
  cursor: pointer;
  transition: all 0.18s;
  &:hover { color: #fff; border-color: ${p => p.$accent}; }
`;

const TabIcon = styled.span`font-size: 16px;`;

/* ─── Persona detail panel ───────────────────────────────────────────────── */
const Detail = styled(motion.div)`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  @media (max-width: 920px) { grid-template-columns: 1fr; }
`;

const Left = styled.div`display: flex; flex-direction: column; gap: 16px;`;
const Right = styled.div`min-width: 0;`;

const Heading = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`;
const Icon = styled.span<{ $accent: string }>`
  font-size: 36px;
  filter: drop-shadow(0 0 14px ${p => p.$accent}55);
`;
const Name = styled.h3<{ $accent: string }>`
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
`;
const Tag = styled.div`font-size: 13px; font-style: italic; color: rgba(255,255,255,0.5);`;

const Pitch = styled.p`
  font-size: 15px;
  color: rgba(255,255,255,0.78);
  line-height: 1.6;
  margin: 0 0 16px;
`;

const Wins = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 6px;
`;
const Win = styled.div<{ $accent: string }>`
  background: rgba(255,255,255,0.025);
  border: 1px solid ${p => p.$accent}33;
  border-left: 3px solid ${p => p.$accent};
  padding: 10px 12px;
  border-radius: 8px;
`;
const WinMetric = styled.div<{ $accent: string }>`
  font-size: 20px;
  font-weight: 800;
  color: ${p => p.$accent};
  letter-spacing: -0.02em;
  line-height: 1.1;
`;
const WinLabel = styled.div`font-size: 10.5px; color: rgba(255,255,255,0.55); margin-top: 3px; line-height: 1.4;`;

const Card = styled.div`
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 16px 18px;
`;
const CardLabel = styled.div<{ $accent?: string }>`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: ${p => p.$accent ?? '#1BAEE5'};
  margin-bottom: 10px;
`;
const Bullets = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;
const Bullet = styled.li<{ $cant?: boolean }>`
  font-size: 13px;
  color: ${p => p.$cant ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.78)'};
  padding-left: 16px;
  position: relative;
  line-height: 1.5;
  &::before {
    content: '${p => p.$cant ? '✕' : '▸'}';
    position: absolute;
    left: 0;
    color: ${p => p.$cant ? 'rgba(239,68,68,0.55)' : 'rgba(27,174,229,0.6)'};
  }
`;

const Chips = styled.div`display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px;`;
const Chip = styled.span<{ $accent: string }>`
  font-size: 10.5px;
  font-weight: 600;
  color: ${p => p.$accent};
  background: ${p => p.$accent}14;
  border: 1px solid ${p => p.$accent}33;
  padding: 4px 9px;
  border-radius: 999px;
`;

const Roles = styled.div`display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px;`;
const Role = styled.code`
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  background: rgba(255,255,255,0.04);
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.06);
`;

/* ─── Portal mockup (interactive sidebar) ───────────────────────────────── */
const Portal = styled.div<{ $accent: string }>`
  background: #0B121C;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 50px rgba(0,0,0,0.45);
`;
const PortalBar = styled.div`
  height: 28px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 6px;
  font-size: 10px;
  color: rgba(255,255,255,0.4);
`;
const PortalDot = styled.span<{ $c: string }>`width: 8px; height: 8px; border-radius: 50%; background: ${p => p.$c};`;
const PortalBody = styled.div`padding: 14px 16px;`;
const PortalHead = styled.div<{ $accent: string }>`
  font-size: 13px;
  font-weight: 700;
  color: ${p => p.$accent};
  letter-spacing: -0.01em;
  margin-bottom: 10px;
`;
const SidebarGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 12px;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
  margin-bottom: 12px;
  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
`;
const SidebarBtn = styled.button<{ $active: boolean; $accent: string }>`
  text-align: left;
  font-size: 11px;
  font-family: inherit;
  background: ${p => p.$active ? `${p.$accent}22` : 'transparent'};
  border: none;
  border-left: 2px solid ${p => p.$active ? p.$accent : 'transparent'};
  border-radius: 3px;
  padding: 4px 7px;
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.6)'};
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.15s;
  &:hover { background: ${p => p.$accent}14; color: #fff; border-left-color: ${p => p.$accent}; }
`;
const PageDetail = styled(motion.div)<{ $accent: string }>`
  padding: 12px 14px;
  background: ${p => p.$accent}0e;
  border: 1px solid ${p => p.$accent}33;
  border-radius: 8px;
  margin-bottom: 4px;
`;
const PagePath = styled.code`
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 10.5px;
  color: #1BAEE5;
  background: rgba(27,174,229,0.08);
  padding: 2px 7px;
  border-radius: 4px;
  margin-bottom: 6px;
`;
const PageDesc = styled.div`
  font-size: 12.5px;
  color: rgba(255,255,255,0.78);
  line-height: 1.55;
`;
const PageReplaces = styled.div`
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(34,197,94,0.06);
  border-left: 2px solid #22C55E;
  border-radius: 4px;
  font-size: 11.5px;
  color: rgba(255,255,255,0.75);
  &::before {
    content: 'replaces';
    display: inline-block;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #22C55E;
    text-transform: uppercase;
    margin-right: 6px;
  }
`;

/* ─── PortalBlock ──────────────────────────────────────────────────────── */
const PortalBlock: React.FC<{ persona: Persona }> = ({ persona }) => {
  const sidebar = PERSONA_SIDEBARS[persona.key];
  const [activeIdx, setActiveIdx] = useState(0);
  const activeItem = sidebar[activeIdx];
  const activeRoute = ROUTES.find(r => r.path === activeItem?.path);

  // reset sidebar when persona changes
  useEffect(() => { setActiveIdx(0); }, [persona.key]);

  return (
    <Portal $accent={persona.accent}>
      <PortalBar>
        <PortalDot $c="#ff5f57" />
        <PortalDot $c="#febc2e" />
        <PortalDot $c="#28c840" />
        <span style={{ marginLeft: 8 }}>curavend-web.pages.dev — {persona.name} workspace · {sidebar.length} pages</span>
      </PortalBar>
      <PortalBody>
        <PortalHead $accent={persona.accent}>{persona.portal.headline}</PortalHead>
        <SidebarGrid>
          {sidebar.map((s, i) => (
            <SidebarBtn
              key={i}
              $active={i === activeIdx}
              $accent={persona.accent}
              onClick={() => setActiveIdx(i)}
              title={s.path}
            >
              {s.label}
            </SidebarBtn>
          ))}
        </SidebarGrid>
        <AnimatePresence mode="wait">
          {activeRoute && (
            <PageDetail
              key={activeRoute.path}
              $accent={persona.accent}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              <PagePath>{activeRoute.path}</PagePath>
              <PageDesc>{activeRoute.description}</PageDesc>
              {activeRoute.replaces && <PageReplaces>{activeRoute.replaces}</PageReplaces>}
            </PageDetail>
          )}
        </AnimatePresence>
      </PortalBody>
    </Portal>
  );
};

/* ─── Tabbed PersonasTabbed ─────────────────────────────────────────────── */
export interface PersonasTabbedProps {
  activeKey: PersonaKey;
  onSelect: (key: PersonaKey) => void;
}

export const PersonasTabbed: React.FC<PersonasTabbedProps> = ({ activeKey, onSelect }) => {
  const active = PERSONAS.find(p => p.key === activeKey) ?? PERSONAS[0];
  return (
    <div>
      <TabStrip>
        {PERSONAS.map(p => (
          <Tab
            key={p.key}
            $active={p.key === activeKey}
            $accent={p.accent}
            onClick={() => onSelect(p.key)}
          >
            <TabIcon>{p.icon}</TabIcon>
            <span>{p.name}</span>
          </Tab>
        ))}
      </TabStrip>

      <AnimatePresence mode="wait">
        <Detail
          key={active.key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Left>
            <Heading>
              <Icon $accent={active.accent}>{active.icon}</Icon>
              <Name $accent={active.accent}>{active.name}</Name>
              <Tag>{active.tagline}</Tag>
            </Heading>
            <Pitch>{active.pitch}</Pitch>
            <Wins>
              {active.wins.map((w, i) => (
                <Win key={i} $accent={active.accent}>
                  <WinMetric $accent={active.accent}>{w.metric}</WinMetric>
                  <WinLabel>{w.label}</WinLabel>
                </Win>
              ))}
            </Wins>
            <Card>
              <CardLabel $accent={active.accent}>Can do</CardLabel>
              <Bullets>{active.capabilities.map((c, i) => <Bullet key={i}>{c}</Bullet>)}</Bullets>
            </Card>
            <Card>
              <CardLabel>Cannot do (by design)</CardLabel>
              <Bullets>{active.cannotDo.map((c, i) => <Bullet key={i} $cant>{c}</Bullet>)}</Bullets>
              <Roles>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', alignSelf: 'center' }}>DB roles:</span>
                {active.dbRoles.map(r => <Role key={r}>{r}</Role>)}
              </Roles>
            </Card>
            <Card>
              <CardLabel $accent={active.accent}>Top features</CardLabel>
              <Chips>{active.topFeatures.map(f => <Chip key={f} $accent={active.accent}>{f}</Chip>)}</Chips>
            </Card>
          </Left>
          <Right>
            <PortalBlock persona={active} />
          </Right>
        </Detail>
      </AnimatePresence>
    </div>
  );
};
