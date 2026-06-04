import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';
import { PERSONAS, type Persona } from '../landing/data/kb';

const PersonaWrap = styled(motion.article)`
  scroll-margin-top: 80px;
  padding: 56px 0;
  border-top: 1px dashed rgba(255,255,255,0.08);
  &:first-of-type { border-top: none; padding-top: 24px; }
`;

const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 22px;
`;

const Icon = styled.div<{ $accent: string }>`
  font-size: 44px;
  filter: drop-shadow(0 0 18px ${p => p.$accent}66);
`;

const Name = styled.h3<{ $accent: string }>`
  font-size: clamp(28px, 4.4vw, 42px);
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.025em;
  &::after {
    content: '';
    display: inline-block;
    margin-left: 14px;
    width: 60px;
    height: 4px;
    background: ${p => p.$accent};
    vertical-align: middle;
    border-radius: 2px;
    transform: translateY(-6px);
  }
`;

const Tag = styled.div`
  font-size: 15px;
  font-style: italic;
  color: rgba(255,255,255,0.5);
`;

const Pitch = styled.p`
  font-size: clamp(16px, 1.8vw, 19px);
  color: rgba(255,255,255,0.8);
  max-width: 820px;
  line-height: 1.65;
  margin: 0 0 32px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  @media (max-width: 880px) { grid-template-columns: 1fr; }
`;

const Card = styled.div`
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 22px 24px;
`;

const CardLabel = styled.div<{ $accent?: string }>`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${p => p.$accent ?? '#1BAEE5'};
  margin-bottom: 12px;
`;

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Item = styled.li`
  font-size: 14px;
  color: rgba(255,255,255,0.78);
  padding-left: 18px;
  position: relative;
  line-height: 1.55;
  &::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: rgba(27,174,229,0.6);
  }
`;

const CantItem = styled(Item)`
  &::before { content: '✕'; color: rgba(239,68,68,0.55); }
  color: rgba(255,255,255,0.5);
`;

const PortalCard = styled.div<{ $accent: string }>`
  background: #0B121C;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5);
`;
const PortalBar = styled.div`
  height: 32px;
  background: rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 6px;
  font-size: 10px;
  color: rgba(255,255,255,0.4);
`;
const PortalDot = styled.span<{ $c: string }>`width: 9px; height: 9px; border-radius: 50%; background: ${p => p.$c};`;
const PortalBody = styled.div`padding: 18px 22px;`;
const PortalHead = styled.div<{ $accent: string }>`
  font-size: 14px;
  font-weight: 700;
  color: ${p => p.$accent};
  letter-spacing: -0.01em;
  margin-bottom: 14px;
`;
const SidebarList = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
  margin-bottom: 18px;
`;
const SidebarItem = styled.div<{ $indent?: boolean }>`
  font-size: 12px;
  color: rgba(255,255,255,0.65);
  padding-left: ${p => p.$indent ? '14px' : '0'};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ActionsLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.4);
  margin-top: 10px;
  margin-bottom: 8px;
`;
const ActionRow = styled.div<{ $accent: string }>`
  font-size: 12px;
  color: rgba(255,255,255,0.78);
  padding: 7px 10px;
  background: rgba(255,255,255,0.025);
  border-left: 2px solid ${p => p.$accent};
  border-radius: 4px;
  margin-bottom: 4px;
`;

const Wins = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 24px;
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;
const Win = styled.div<{ $accent: string }>`
  background: rgba(255,255,255,0.02);
  border: 1px solid ${p => p.$accent}33;
  border-left: 3px solid ${p => p.$accent};
  padding: 14px 16px;
  border-radius: 8px;
`;
const WinMetric = styled.div<{ $accent: string }>`
  font-size: 24px;
  font-weight: 800;
  color: ${p => p.$accent};
  letter-spacing: -0.02em;
`;
const WinLabel = styled.div`font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 4px; line-height: 1.4;`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
`;
const Chip = styled.div<{ $accent: string }>`
  font-size: 11px;
  font-weight: 600;
  color: ${p => p.$accent};
  background: ${p => p.$accent}14;
  border: 1px solid ${p => p.$accent}33;
  padding: 5px 10px;
  border-radius: 999px;
`;

const Roles = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
`;
const Role = styled.code`
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: rgba(255,255,255,0.55);
  background: rgba(255,255,255,0.04);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.06);
`;

const PortalBlock: React.FC<{ persona: Persona }> = ({ persona }) => (
  <PortalCard $accent={persona.accent}>
    <PortalBar>
      <PortalDot $c="#ff5f57" />
      <PortalDot $c="#febc2e" />
      <PortalDot $c="#28c840" />
      <span style={{ marginLeft: 8 }}>curavend-web.pages.dev — {persona.name} workspace</span>
    </PortalBar>
    <PortalBody>
      <PortalHead $accent={persona.accent}>{persona.portal.headline}</PortalHead>
      <SidebarList>
        {persona.portal.sidebar.slice(0, 12).map((s, i) => (
          <SidebarItem key={i} $indent={s.startsWith('  ')}>{s.trim().replace(/^▾|^▸/, '').trim()}</SidebarItem>
        ))}
      </SidebarList>
      <ActionsLabel>Primary actions</ActionsLabel>
      {persona.portal.primaryActions.slice(0, 5).map((a, i) => (
        <ActionRow key={i} $accent={persona.accent}>{a}</ActionRow>
      ))}
    </PortalBody>
  </PortalCard>
);

const PersonaBlock: React.FC<{ persona: Persona; index: number }> = ({ persona, index }) => (
  <PersonaWrap
    id={persona.key}
    initial={{ opacity: 0, y: 32 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-10%' }}
    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
  >
    <Head>
      <Icon $accent={persona.accent}>{persona.icon}</Icon>
      <Name $accent={persona.accent}>{persona.name}</Name>
      <Tag>{persona.tagline}</Tag>
    </Head>
    <Pitch>{persona.pitch}</Pitch>

    <Wins>
      {persona.wins.map((w, i) => (
        <Win key={i} $accent={persona.accent}>
          <WinMetric $accent={persona.accent}>{w.metric}</WinMetric>
          <WinLabel>{w.label}</WinLabel>
        </Win>
      ))}
    </Wins>

    <Grid>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <CardLabel $accent={persona.accent}>Can do</CardLabel>
          <List>{persona.capabilities.map((c, i) => <Item key={i}>{c}</Item>)}</List>
        </Card>
        <Card>
          <CardLabel>Cannot do (by design)</CardLabel>
          <List>{persona.cannotDo.map((c, i) => <CantItem key={i}>{c}</CantItem>)}</List>
          <Roles>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em', alignSelf: 'center' }}>DB roles:</span>
            {persona.dbRoles.map(r => <Role key={r}>{r}</Role>)}
          </Roles>
        </Card>
        <Card>
          <CardLabel $accent={persona.accent}>Top features in this workspace</CardLabel>
          <Chips>
            {persona.topFeatures.map(f => <Chip key={f} $accent={persona.accent}>{f}</Chip>)}
          </Chips>
        </Card>
      </div>
      <div>
        <PortalBlock persona={persona} />
      </div>
    </Grid>
  </PersonaWrap>
);

export const Act2Personas: React.FC = () => (
  <ActSection id="personas">
    <Glow $color="rgba(27,174,229,0.15)" $top="0%" $left="80%" />
    <Glow $color="rgba(168,85,247,0.10)" $top="60%" $left="-15%" $size={500} />
    <ActInner>
      <ActLabel>Act 2 — The Six Personas</ActLabel>
      <ActTitle>One source of truth. Six different lenses.</ActTitle>
      <ActSub>
        Every persona sees the same data through a workspace built for their job. No "one giant dashboard" anti-pattern.
        Hospital sees procurement. Vendor sees fulfillment. Lab sees consumables. Provider sees encounters. Super-Vendor sees the network. Admin sees the controls.
      </ActSub>
      {PERSONAS.map((p, i) => <PersonaBlock key={p.key} persona={p} index={i} />)}
    </ActInner>
  </ActSection>
);
