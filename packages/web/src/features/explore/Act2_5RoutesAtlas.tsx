import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';
import { ROUTES, PERSONAS, type AppRoute, type Category, type PersonaKey } from '../landing/data/kb';

const CATEGORY_LABEL: Record<Category, string> = {
  core: 'Core',
  orders: 'Orders',
  procurement: 'Procurement',
  inventory: 'Inventory',
  contracts: 'Contracts',
  lab: 'Lab',
  dme: 'DME / Clinical',
  reporting: 'Reporting',
  admin: 'Admin',
  auth: 'Auth',
  profile: 'Profile',
  help: 'Help',
};

const CATEGORY_COLOR: Record<Category, string> = {
  core: '#1BAEE5',
  orders: '#22C55E',
  procurement: '#3B82F6',
  inventory: '#A855F7',
  contracts: '#06B6D4',
  lab: '#A855F7',
  dme: '#F59E0B',
  reporting: '#EAB308',
  admin: '#64748B',
  auth: '#94A3B8',
  profile: '#94A3B8',
  help: '#94A3B8',
};

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 36px;
`;

const Stat = styled.div`
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 16px 18px;
`;

const StatN = styled.div`
  font-size: 28px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.025em;
  line-height: 1;
`;

const StatL = styled.div`
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 6px;
`;

const Filters = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
`;

const FilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const FilterLabel = styled.span`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  margin-right: 4px;
`;

const Pill = styled.button<{ $active: boolean; $color?: string }>`
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid ${p => p.$active ? (p.$color ?? '#1BAEE5') : 'rgba(255,255,255,0.08)'};
  background: ${p => p.$active ? `${p.$color ?? '#1BAEE5'}22` : 'rgba(255,255,255,0.02)'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.6)'};
  cursor: pointer;
  transition: all 0.18s;
  &:hover { color: #fff; }
`;

const Search = styled.input`
  flex: 1;
  min-width: 240px;
  font-size: 13px;
  padding: 10px 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 999px;
  color: #fff;
  outline: none;
  &::placeholder { color: rgba(255,255,255,0.35); }
  &:focus { border-color: #1BAEE5; background: rgba(27,174,229,0.05); }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
`;

const Row = styled(motion.button)`
  text-align: left;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  color: #fff;
  transition: all 0.18s;
  display: flex;
  flex-direction: column;
  gap: 8px;
  &:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(27,174,229,0.4);
    transform: translateY(-1px);
  }
`;

const RowTop = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
`;

const Label = styled.span`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const Path = styled.code`
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  background: rgba(255,255,255,0.04);
  padding: 2px 6px;
  border-radius: 4px;
`;

const Desc = styled.div`
  font-size: 13px;
  color: rgba(255,255,255,0.62);
  line-height: 1.55;
`;

const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
`;

const CatBadge = styled.span<{ $color: string }>`
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${p => p.$color};
  background: ${p => p.$color}1a;
  border: 1px solid ${p => p.$color}33;
  padding: 3px 7px;
  border-radius: 4px;
`;

const PersonaDot = styled.span<{ $accent: string; $faded?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  color: ${p => p.$faded ? 'rgba(255,255,255,0.35)' : p.$accent};
  background: ${p => p.$faded ? 'rgba(255,255,255,0.025)' : `${p.$accent}14`};
  border: 1px solid ${p => p.$faded ? 'rgba(255,255,255,0.05)' : `${p.$accent}33`};
  padding: 2px 7px;
  border-radius: 999px;
  opacity: ${p => p.$faded ? 0.55 : 1};
`;

const Drawer = styled(motion.div)`
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  justify-content: flex-end;
`;
const Backdrop = styled(motion.div)`
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
`;
const Panel = styled(motion.aside)`
  position: relative;
  width: min(560px, 100vw);
  background: #0B121C;
  border-left: 1px solid rgba(255,255,255,0.08);
  height: 100vh;
  overflow-y: auto;
  padding: 32px 32px 56px;
`;
const Close = styled.button`
  position: absolute;
  top: 14px;
  right: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.6);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  &:hover { color: #fff; background: rgba(255,255,255,0.08); }
`;

const DH1 = styled.h3`font-size: 24px; font-weight: 800; margin: 0 0 6px; color: #fff; letter-spacing: -0.02em;`;
const DPath = styled.code`
  display: inline-block;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 12px;
  color: #1BAEE5;
  background: rgba(27,174,229,0.08);
  padding: 4px 10px;
  border-radius: 6px;
  margin-bottom: 18px;
`;
const DSection = styled.div`margin-bottom: 22px;`;
const DLabel = styled.div`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.5);
  margin-bottom: 8px;
`;
const DBody = styled.div`font-size: 14px; color: rgba(255,255,255,0.78); line-height: 1.6;`;
const ReplacesBox = styled.div`
  background: linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02));
  border: 1px solid rgba(34,197,94,0.22);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 13px;
  color: rgba(255,255,255,0.8);
  &::before {
    content: 'REPLACES';
    display: inline-block;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.16em;
    color: #22C55E;
    margin-right: 8px;
    background: rgba(34,197,94,0.12);
    padding: 2px 6px;
    border-radius: 3px;
    vertical-align: middle;
  }
`;

function personaIconAndAccent(key: PersonaKey | 'public') {
  if (key === 'public') return { icon: '🌐', accent: '#94A3B8', name: 'Public' };
  const p = PERSONAS.find(x => x.key === key)!;
  return { icon: p.icon, accent: p.accent, name: p.name };
}

const RouteRow: React.FC<{ r: AppRoute; onOpen: (r: AppRoute) => void }> = ({ r, onOpen }) => (
  <Row
    initial={{ opacity: 0, y: 12 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-5%' }}
    transition={{ duration: 0.3 }}
    onClick={() => onOpen(r)}
  >
    <RowTop>
      <Label>{r.label}</Label>
      <Path>{r.path}</Path>
    </RowTop>
    <Desc>{r.description}</Desc>
    <Badges>
      <CatBadge $color={CATEGORY_COLOR[r.category]}>{CATEGORY_LABEL[r.category]}</CatBadge>
      {r.primary.length === 0
        ? <PersonaDot $accent="#94A3B8">🌐 Public</PersonaDot>
        : r.primary.map(p => {
            const info = personaIconAndAccent(p);
            return <PersonaDot key={p} $accent={info.accent}>{info.icon} {info.name}</PersonaDot>;
          })}
    </Badges>
  </Row>
);

const RouteDrawer: React.FC<{ route: AppRoute; onClose: () => void }> = ({ route, onClose }) => {
  const allPersonas = PERSONAS.map(p => p.key);
  const primary = new Set(route.primary);
  const access = new Set(route.access);
  return (
    <Drawer>
      <Backdrop initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <Panel
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <Close onClick={onClose} aria-label="Close">×</Close>
        <DH1>{route.label}</DH1>
        <DPath>{route.path}</DPath>

        <DSection>
          <DLabel>What it does</DLabel>
          <DBody>{route.description}</DBody>
        </DSection>

        {route.replaces && (
          <DSection>
            <ReplacesBox>{route.replaces}</ReplacesBox>
          </DSection>
        )}

        <DSection>
          <DLabel>Primary persona</DLabel>
          <Badges>
            <CatBadge $color={CATEGORY_COLOR[route.category]}>{CATEGORY_LABEL[route.category]}</CatBadge>
            {route.primary.length === 0
              ? <PersonaDot $accent="#94A3B8">🌐 Public</PersonaDot>
              : allPersonas.map(p => {
                  const info = personaIconAndAccent(p);
                  const isPrimary = primary.has(p);
                  return (
                    <PersonaDot key={p} $accent={info.accent} $faded={!isPrimary}>
                      {info.icon} {info.name}{isPrimary ? '' : ''}
                    </PersonaDot>
                  );
                })}
          </Badges>
        </DSection>

        <DSection>
          <DLabel>Accessible to (RoleGuard)</DLabel>
          <Badges>
            {route.access.includes('public') ? (
              <PersonaDot $accent="#94A3B8">🌐 Public — no login required</PersonaDot>
            ) : allPersonas.map(p => {
              const info = personaIconAndAccent(p);
              const has = access.has(p);
              return (
                <PersonaDot key={p} $accent={info.accent} $faded={!has}>
                  {info.icon} {info.name} {has ? '✓' : '✕'}
                </PersonaDot>
              );
            })}
          </Badges>
        </DSection>
      </Panel>
    </Drawer>
  );
};

export const Act2_5RoutesAtlas: React.FC = () => {
  const [persona, setPersona] = useState<PersonaKey | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<AppRoute | null>(null);

  const filtered = useMemo(() => {
    return ROUTES.filter(r => {
      if (persona !== 'all' && !r.primary.includes(persona) && !r.access.includes(persona)) return false;
      if (category !== 'all' && r.category !== category) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!r.label.toLowerCase().includes(q) && !r.path.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [persona, category, query]);

  const categories = Object.keys(CATEGORY_LABEL) as Category[];

  const adminCount = ROUTES.filter(r => r.primary.includes('admin') || r.category === 'admin').length;
  const labCount = ROUTES.filter(r => r.primary.includes('lab') || r.category === 'lab').length;

  return (
    <ActSection id="atlas">
      <Glow $color="rgba(34,197,94,0.10)" $top="10%" $left="80%" />
      <ActInner>
        <ActLabel>Act 2.5 — Routes Atlas</ActLabel>
        <ActTitle>Every page. Every persona. One map.</ActTitle>
        <ActSub>
          The platform exposes {ROUTES.length} routes across the six personas. Filter by persona, by category, or just search.
          Click any row to see what it does, who uses it, and what it replaces.
        </ActSub>

        <Stats>
          <Stat><StatN>{ROUTES.length}</StatN><StatL>Total routes</StatL></Stat>
          <Stat><StatN>{adminCount}</StatN><StatL>Admin / governance</StatL></Stat>
          <Stat><StatN>{labCount}</StatN><StatL>Lab portal</StatL></Stat>
          <Stat><StatN>{ROUTES.filter(r => r.category === 'reporting').length}</StatN><StatL>Reports</StatL></Stat>
          <Stat><StatN>{ROUTES.filter(r => r.replaces).length}</StatN><StatL>"Replaces" stories</StatL></Stat>
        </Stats>

        <Filters>
          <FilterRow>
            <FilterLabel>Persona</FilterLabel>
            <Pill $active={persona === 'all'} onClick={() => setPersona('all')}>All</Pill>
            {PERSONAS.map(p => (
              <Pill key={p.key} $active={persona === p.key} $color={p.accent} onClick={() => setPersona(p.key)}>
                {p.icon} {p.name}
              </Pill>
            ))}
          </FilterRow>
          <FilterRow>
            <FilterLabel>Category</FilterLabel>
            <Pill $active={category === 'all'} onClick={() => setCategory('all')}>All</Pill>
            {categories.map(c => (
              <Pill key={c} $active={category === c} $color={CATEGORY_COLOR[c]} onClick={() => setCategory(c)}>
                {CATEGORY_LABEL[c]}
              </Pill>
            ))}
          </FilterRow>
          <FilterRow>
            <Search placeholder="Search routes…" value={query} onChange={e => setQuery(e.target.value)} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              {filtered.length} of {ROUTES.length}
            </span>
          </FilterRow>
        </Filters>

        <Grid>
          {filtered.map(r => <RouteRow key={r.path} r={r} onOpen={setOpen} />)}
        </Grid>

        <AnimatePresence>
          {open && <RouteDrawer route={open} onClose={() => setOpen(null)} />}
        </AnimatePresence>
      </ActInner>
    </ActSection>
  );
};
