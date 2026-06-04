import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { PersonasTabbed } from './PersonasTabbed';
import { Act2_5RoutesAtlas } from './Act2_5RoutesAtlas';
import { Act3Platform } from './Act3Platform';
import { Act4Workflows } from './Act4Workflows';
import { Act5Proof } from './Act5Proof';
import { PERSONAS, type PersonaKey } from '../landing/data/kb';

type TabKey = 'personas' | 'atlas' | 'platform' | 'workflows' | 'proof';

interface Tab {
  key: TabKey;
  icon: string;
  label: string;
  sub: string;
}

const TABS: Tab[] = [
  { key: 'personas', icon: '👥', label: 'Personas', sub: '6 workspaces' },
  { key: 'atlas', icon: '🗺', label: 'Routes Atlas', sub: '92 pages' },
  { key: 'platform', icon: '⚙', label: 'Platform', sub: '52 features' },
  { key: 'workflows', icon: '🔄', label: 'Workflows', sub: '23 flows' },
  { key: 'proof', icon: '🛡', label: 'Why us', sub: 'Proof' },
];

const Wrap = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 80px;
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  @media (max-width: 960px) { grid-template-columns: 1fr; padding: 16px 12px 60px; gap: 14px; }
`;

const Rail = styled.aside`
  position: sticky;
  top: 84px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 4px;
  @media (max-width: 960px) {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 6px;
    scrollbar-width: thin;
    scrollbar-color: rgba(27,174,229,0.4) transparent;
    &::-webkit-scrollbar { height: 4px; }
    &::-webkit-scrollbar-thumb { background: rgba(27,174,229,0.4); border-radius: 2px; }
  }
`;

const RailTab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  font: inherit;
  background: ${p => p.$active ? 'rgba(27,174,229,0.10)' : 'transparent'};
  border: 1px solid ${p => p.$active ? 'rgba(27,174,229,0.35)' : 'transparent'};
  color: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  position: relative;
  transition: all 0.18s;
  flex-shrink: 0;
  &:hover {
    background: ${p => p.$active ? 'rgba(27,174,229,0.12)' : 'rgba(255,255,255,0.04)'};
    border-color: ${p => p.$active ? 'rgba(27,174,229,0.5)' : 'rgba(255,255,255,0.08)'};
  }
  &::before {
    content: '';
    position: absolute;
    left: -6px; top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: ${p => p.$active ? '22px' : '0'};
    background: #1BAEE5;
    border-radius: 2px;
    transition: height 0.2s;
    @media (max-width: 960px) { display: none; }
  }
`;
const RailIcon = styled.div`font-size: 20px;`;
const RailBody = styled.div`flex: 1; min-width: 0;`;
const RailLabel = styled.div`font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em;`;
const RailSub = styled.div`font-size: 10.5px; color: rgba(255,255,255,0.5); margin-top: 2px;`;

const Panel = styled.div`
  background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01));
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 18px;
  padding: 28px 32px;
  min-height: 70vh;
  position: relative;
  @media (max-width: 768px) { padding: 20px 18px; }
`;

const PanelHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 22px;
  flex-wrap: wrap;
`;
const PanelTitle = styled.h2`
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 800;
  letter-spacing: -0.025em;
  margin: 0;
  color: #fff;
`;
const PanelHint = styled.div`
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  font-style: italic;
`;

/* Wraps the existing Acts so their ActSection padding/background gets neutralized
   when rendered inside the Compass panel. */
const CompactWrap = styled.div`
  & > section {
    padding: 0 !important;
    background: transparent !important;
    border-top: none !important;
  }
  & > section > div { max-width: 100% !important; }
`;

const Fade = styled(motion.div)``;

const PANEL_TITLES: Record<TabKey, { title: string; hint: string }> = {
  personas: { title: 'The Six Personas', hint: 'Click a persona tab to switch · click any sidebar item to see what that page does' },
  atlas: { title: 'Routes Atlas', hint: 'Filter by persona / category / search — click a row to drill in' },
  platform: { title: 'The Platform', hint: '52 features, filterable — click any card to read the reference' },
  workflows: { title: 'Workflows in motion', hint: '6 headline flows + 17 more workflows on demand' },
  proof: { title: 'Why us', hint: 'Security · integrations · scale · audit' },
};

/* Hash parser:
   #personas/hospital       → personas + hospital
   #personas                → personas (default hospital)
   #atlas / #platform / #workflows / #proof → that tab
   #hospital  (legacy from landing PersonaShowcase) → personas + hospital
   #problem   (legacy)      → personas
*/
function parseHash(hash: string): { tab: TabKey; persona?: PersonaKey } {
  const h = hash.replace(/^#/, '').toLowerCase();
  if (!h) return { tab: 'personas' };
  const [first, second] = h.split('/');
  const personaKeys = PERSONAS.map(p => p.key);
  if (personaKeys.includes(first as PersonaKey)) return { tab: 'personas', persona: first as PersonaKey };
  if (first === 'personas') return { tab: 'personas', persona: personaKeys.includes(second as PersonaKey) ? (second as PersonaKey) : undefined };
  if (first === 'atlas') return { tab: 'atlas' };
  if (first === 'platform') return { tab: 'platform' };
  if (first === 'workflows') return { tab: 'workflows' };
  if (first === 'proof') return { tab: 'proof' };
  return { tab: 'personas' };
}

function writeHash(tab: TabKey, persona?: PersonaKey) {
  const target = tab === 'personas' && persona ? `#personas/${persona}` : `#${tab}`;
  if (window.location.hash !== target) {
    history.replaceState(null, '', target);
  }
}

export const CompassLayout: React.FC = () => {
  const initial = typeof window !== 'undefined' ? parseHash(window.location.hash) : { tab: 'personas' as TabKey };
  const [tab, setTab] = useState<TabKey>(initial.tab);
  const [personaKey, setPersonaKey] = useState<PersonaKey>(initial.persona ?? 'hospital');

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash(window.location.hash);
      setTab(parsed.tab);
      if (parsed.persona) setPersonaKey(parsed.persona);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const selectTab = useCallback((next: TabKey) => {
    setTab(next);
    writeHash(next, next === 'personas' ? personaKey : undefined);
    // scroll panel into view on mobile when switching from rail
    if (window.matchMedia('(max-width: 960px)').matches) {
      requestAnimationFrame(() => {
        const el = document.getElementById('compass-panel');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [personaKey]);

  const selectPersona = useCallback((k: PersonaKey) => {
    setPersonaKey(k);
    writeHash('personas', k);
  }, []);

  const meta = PANEL_TITLES[tab];

  return (
    <Wrap>
      <Rail role="tablist" aria-label="Curavend explorer sections">
        {TABS.map(t => (
          <RailTab
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            $active={tab === t.key}
            onClick={() => selectTab(t.key)}
          >
            <RailIcon>{t.icon}</RailIcon>
            <RailBody>
              <RailLabel>{t.label}</RailLabel>
              <RailSub>{t.sub}</RailSub>
            </RailBody>
          </RailTab>
        ))}
      </Rail>

      <Panel id="compass-panel">
        <PanelHead>
          <PanelTitle>{meta.title}</PanelTitle>
          <PanelHint>{meta.hint}</PanelHint>
        </PanelHead>

        <AnimatePresence mode="wait">
          <Fade
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === 'personas' && <PersonasTabbed activeKey={personaKey} onSelect={selectPersona} />}
            {tab === 'atlas' && <CompactWrap><Act2_5RoutesAtlas /></CompactWrap>}
            {tab === 'platform' && <CompactWrap><Act3Platform /></CompactWrap>}
            {tab === 'workflows' && <CompactWrap><Act4Workflows /></CompactWrap>}
            {tab === 'proof' && <CompactWrap><Act5Proof /></CompactWrap>}
          </Fade>
        </AnimatePresence>
      </Panel>
    </Wrap>
  );
};
