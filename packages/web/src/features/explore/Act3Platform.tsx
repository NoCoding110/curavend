import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { ActSection, ActInner, ActLabel, ActTitle, ActSub, Glow } from './shared';

interface ManifestFeature { slug: string; title: string; path: string }
interface ManifestWorkflow { slug: string; title: string; path: string }
interface Manifest {
  features: ManifestFeature[];
  workflows: ManifestWorkflow[];
}

const CATEGORIES: { key: string; label: string; match: (slug: string, title: string) => boolean }[] = [
  { key: 'all', label: 'Everything', match: () => true },
  { key: 'procurement', label: 'Procurement', match: (_, t) => /requisition|approval|goods|three|invoice|formulary|po-transmission|gpo|contract|leakage|budget|gl-ledger|department|supplier|rma|invoice-match|charge-capture|price-variance|emergency|item-master/i.test(t) },
  { key: 'dme', label: 'DME', match: (_, t) => /dme|lcd|cms|dwo|claim|dmepos/i.test(t) },
  { key: 'lab', label: 'Lab', match: (_, t) => /lab-|backorder|test|consumable|kit/i.test(t) },
  { key: 'clinical', label: 'Clinical / EHR', match: (_, t) => /ehr|prior auth|patient|encounter|physician|forecast|controlled|substance|recall/i.test(t) },
  { key: 'ops', label: 'Operations', match: (_, t) => /dashboard|user|permission|notification|scorecard|notification|cross-site|logistics|cold|point-of-use|compliance|inventory|substitution|transfer/i.test(t) },
];

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 32px;
`;

const Pill = styled.button<{ $active: boolean }>`
  font-size: 13px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid ${p => p.$active ? '#1BAEE5' : 'rgba(255,255,255,0.08)'};
  background: ${p => p.$active ? 'rgba(27,174,229,0.15)' : 'rgba(255,255,255,0.02)'};
  color: ${p => p.$active ? '#fff' : 'rgba(255,255,255,0.6)'};
  cursor: pointer;
  transition: all 0.18s;
  &:hover { color: #fff; border-color: rgba(27,174,229,0.5); }
`;

const Search = styled.input`
  flex: 1;
  min-width: 220px;
  max-width: 320px;
  font-size: 13px;
  padding: 8px 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 999px;
  color: #fff;
  outline: none;
  &::placeholder { color: rgba(255,255,255,0.35); }
  &:focus { border-color: #1BAEE5; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
`;

const Card = styled(motion.button)`
  text-align: left;
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px;
  padding: 18px 20px;
  cursor: pointer;
  color: #fff;
  transition: border-color 0.18s, background 0.18s, transform 0.18s;
  &:hover {
    background: rgba(255,255,255,0.05);
    border-color: rgba(27,174,229,0.4);
    transform: translateY(-2px);
  }
`;

const CardNum = styled.div`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #1BAEE5;
  margin-bottom: 8px;
  text-transform: uppercase;
`;

const CardTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

const CardArrow = styled.div`
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255,255,255,0.4);
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
  width: min(720px, 100vw);
  background: #0B121C;
  border-left: 1px solid rgba(255,255,255,0.08);
  height: 100vh;
  overflow-y: auto;
  padding: 28px 32px 56px;
  @media (max-width: 600px) { padding: 22px; }
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
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }
  th { color: #fff; font-weight: 600; }
  blockquote { border-left: 3px solid #1BAEE5; padding-left: 12px; color: rgba(255,255,255,0.6); margin: 12px 0; }
`;

const Loading = styled.div`color: rgba(255,255,255,0.5); padding: 40px 0; text-align: center;`;

// ─── Minimal markdown → HTML (covers what training docs use) ───────────────
function mdToHtml(md: string): string {
  let s = md;
  // strip front-matter-like image refs we can't show
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // tables
  s = s.replace(/^\|(.+)\|\s*\n\|([-:\s|]+)\|\s*\n((?:\|.+\|\s*\n?)+)/gm, (_m, header, _sep, rows) => {
    const ths = header.split('|').map((c: string) => `<th>${c.trim()}</th>`).join('');
    const trs = rows.trim().split('\n').map((row: string) => {
      const tds = row.replace(/^\||\|$/g, '').split('|').map((c: string) => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });
  // headings
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // blockquote
  s = s.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // bold/italic/code
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // links — keep external, scrub internal .md jumps
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, h) => {
    if (h.endsWith('.md') || h.startsWith('../') || h.startsWith('./')) return t;
    return `<a href="${h}" target="_blank" rel="noopener">${t}</a>`;
  });
  // lists
  s = s.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
  s = s.replace(/(<li>.*<\/li>\s*)+/g, m => `<ul>${m}</ul>`);
  // horizontal rule
  s = s.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:18px 0;" />');
  // paragraphs (basic): wrap remaining loose lines
  s = s.split(/\n{2,}/).map(block => {
    if (/^<(h\d|ul|ol|table|blockquote|hr|p)/.test(block.trim())) return block;
    if (!block.trim()) return '';
    return `<p>${block.replace(/\n/g, ' ')}</p>`;
  }).join('\n');
  return s;
}

export const Act3Platform: React.FC = () => {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [activeCat, setActiveCat] = useState('all');
  const [query, setQuery] = useState('');
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string>('');

  useEffect(() => {
    fetch('/docs/manifest.json').then(r => r.json()).then(setManifest).catch(() => setManifest({ features: [], workflows: [] }));
  }, []);

  useEffect(() => {
    if (!openSlug || !manifest) return;
    const feat = manifest.features.find(f => f.slug === openSlug);
    if (!feat) return;
    setDocHtml('');
    fetch(feat.path).then(r => r.text()).then(md => setDocHtml(mdToHtml(md))).catch(() => setDocHtml('<p>Could not load this feature doc.</p>'));
  }, [openSlug, manifest]);

  const cat = CATEGORIES.find(c => c.key === activeCat) ?? CATEGORIES[0];
  const features = useMemo(() => {
    if (!manifest) return [];
    return manifest.features
      .filter(f => cat.match(f.slug, f.title))
      .filter(f => !query || f.title.toLowerCase().includes(query.toLowerCase()));
  }, [manifest, cat, query]);

  return (
    <ActSection id="platform">
      <Glow $color="rgba(34,197,94,0.10)" $top="20%" $left="80%" />
      <ActInner>
        <ActLabel>Act 3 — The Platform</ActLabel>
        <ActTitle>Fifty-two features. Every one of them does a real job.</ActTitle>
        <ActSub>
          Every feature ships with a doc. Click any card to read what it does, when to use it, and what it replaces. No marketing bullets — actual product reference.
        </ActSub>

        <Bar>
          {CATEGORIES.map(c => (
            <Pill key={c.key} $active={c.key === activeCat} onClick={() => setActiveCat(c.key)}>{c.label}</Pill>
          ))}
          <Search placeholder="Search features…" value={query} onChange={e => setQuery(e.target.value)} />
        </Bar>

        {!manifest ? <Loading>Loading platform manifest…</Loading> : (
          <Grid>
            {features.map((f, i) => (
              <Card
                key={f.slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.02 }}
                onClick={() => setOpenSlug(f.slug)}
              >
                <CardNum>#{f.slug.split('-')[0]}</CardNum>
                <CardTitle>{f.title}</CardTitle>
                <CardArrow>Read full reference →</CardArrow>
              </Card>
            ))}
          </Grid>
        )}

        <AnimatePresence>
          {openSlug && (
            <Drawer>
              <Backdrop
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpenSlug(null)}
              />
              <Panel
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <Close onClick={() => setOpenSlug(null)} aria-label="Close">×</Close>
                {docHtml ? <Content dangerouslySetInnerHTML={{ __html: docHtml }} /> : <Loading>Loading…</Loading>}
              </Panel>
            </Drawer>
          )}
        </AnimatePresence>
      </ActInner>
    </ActSection>
  );
};
