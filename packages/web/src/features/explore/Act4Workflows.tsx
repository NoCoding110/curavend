import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';
import { WORKFLOW_LANES, PERSONAS } from '../landing/data/kb';

interface ManifestWorkflow { slug: string; title: string; path: string }
interface Manifest { workflows: ManifestWorkflow[] }

function mdToHtml(md: string): string {
  let s = md.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  s = s.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, h) =>
    h.endsWith('.md') || h.startsWith('../') || h.startsWith('./') ? t : `<a href="${h}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
  s = s.replace(/(<li>.*<\/li>\s*)+/g, m => `<ul>${m}</ul>`);
  s = s.replace(/^---$/gm, '<hr />');
  s = s.split(/\n{2,}/).map(b => /^<(h\d|ul|ol|table|blockquote|hr|p)/.test(b.trim()) || !b.trim() ? b : `<p>${b.replace(/\n/g, ' ')}</p>`).join('\n');
  return s;
}

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

// ─── Extra workflow library — fetched from manifest, opened in drawer ────
const MoreToggle = styled.button`
  margin-top: 32px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.8);
  font-size: 13px;
  font-weight: 600;
  padding: 12px 22px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    border-color: #1BAEE5;
    background: rgba(27,174,229,0.06);
    color: #fff;
  }
`;

const ExtraLanes = styled(motion.div)`
  margin-top: 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
`;

const ExtraCard = styled(motion.button)`
  text-align: left;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 16px 18px;
  cursor: pointer;
  color: #fff;
  transition: all 0.18s;
  &:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(245,158,11,0.4);
    transform: translateY(-1px);
  }
`;
const ExtraNum = styled.div`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #F59E0B;
  text-transform: uppercase;
  margin-bottom: 6px;
`;
const ExtraTitle = styled.div`
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const Drawer = styled(motion.div)`
  position: fixed; inset: 0; z-index: 500; display: flex; justify-content: flex-end;
`;
const Backdrop = styled(motion.div)`
  position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
`;
const Panel = styled(motion.aside)`
  position: relative;
  width: min(720px, 100vw);
  background: #0B121C;
  border-left: 1px solid rgba(255,255,255,0.08);
  height: 100vh;
  overflow-y: auto;
  padding: 28px 32px 56px;
`;
const Close = styled.button`
  position: absolute; top: 14px; right: 14px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.6); width: 32px; height: 32px; border-radius: 50%;
  cursor: pointer; font-size: 16px;
  &:hover { color: #fff; background: rgba(255,255,255,0.08); }
`;
const Content = styled.div`
  color: rgba(255,255,255,0.78);
  line-height: 1.7;
  font-size: 14.5px;
  h1 { font-size: 26px; color: #fff; margin: 0 0 14px; letter-spacing: -0.02em; }
  h2 { font-size: 20px; color: #fff; margin: 28px 0 10px; letter-spacing: -0.015em; }
  h3 { font-size: 16px; color: #fff; margin: 22px 0 8px; }
  p { margin: 0 0 12px; }
  ul, ol { padding-left: 22px; margin: 0 0 12px; }
  li { margin-bottom: 4px; }
  code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 12.5px; }
  a { color: #1BAEE5; }
  blockquote { border-left: 3px solid #1BAEE5; padding-left: 12px; color: rgba(255,255,255,0.6); margin: 12px 0; }
  hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 18px 0; }
`;

export const Act4Workflows: React.FC = () => {
  const [showAll, setShowAll] = useState(false);
  const [extras, setExtras] = useState<ManifestWorkflow[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string>('');

  useEffect(() => {
    fetch('/docs/manifest.json').then(r => r.json()).then((m: Manifest) => {
      setExtras(m.workflows || []);
    }).catch(() => setExtras([]));
  }, []);

  useEffect(() => {
    if (!openSlug) return;
    const wf = extras.find(w => w.slug === openSlug);
    if (!wf) return;
    setDocHtml('');
    fetch(wf.path).then(r => r.text()).then(md => setDocHtml(mdToHtml(md))).catch(() => setDocHtml('<p>Could not load workflow.</p>'));
  }, [openSlug, extras]);

  return (
    <ActSection id="workflows">
      <Glow $color="rgba(245,158,11,0.10)" $top="30%" $left="-10%" />
      <ActInner>
        <ActLabel>Act 4 — Workflows in motion</ActLabel>
        <ActTitle>The work doesn’t happen on a page. It happens on a rail.</ActTitle>
        <ActSub>
          Six headline flows run end-to-end below — no integration tickets, no email handoffs, no "let me check with my AP person."
          Scroll a lane to follow the beats. Then click "Show all {extras.length || 23} workflows" for the full library.
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

        {extras.length > 0 && (
          <>
            <MoreToggle onClick={() => setShowAll(v => !v)}>
              {showAll ? '↑ Hide' : `↓ Show all ${extras.length} workflows`}
            </MoreToggle>
            <AnimatePresence>
              {showAll && (
                <ExtraLanes
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  {extras.map((w, i) => (
                    <ExtraCard
                      key={w.slug}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.02 }}
                      onClick={() => setOpenSlug(w.slug)}
                    >
                      <ExtraNum>Workflow #{w.slug.split('-')[0]}</ExtraNum>
                      <ExtraTitle>{w.title}</ExtraTitle>
                    </ExtraCard>
                  ))}
                </ExtraLanes>
              )}
            </AnimatePresence>
          </>
        )}

        <AnimatePresence>
          {openSlug && (
            <Drawer>
              <Backdrop initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpenSlug(null)} />
              <Panel
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              >
                <Close onClick={() => setOpenSlug(null)} aria-label="Close">×</Close>
                {docHtml
                  ? <Content dangerouslySetInnerHTML={{ __html: docHtml }} />
                  : <div style={{ color: 'rgba(255,255,255,0.5)', padding: '40px 0', textAlign: 'center' }}>Loading…</div>}
              </Panel>
            </Drawer>
          )}
        </AnimatePresence>
      </ActInner>
    </ActSection>
  );
};
