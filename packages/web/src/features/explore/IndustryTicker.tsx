import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { INDUSTRY_GAPS } from '../landing/data/kb';

const Wrap = styled.div`
  margin-top: 32px;
  background: linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(27,174,229,0.05) 100%);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  padding: 28px 32px;
  position: relative;
  overflow: hidden;
  @media (max-width: 640px) { padding: 22px; }
`;

const ProgressBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255,255,255,0.05);
`;

const ProgressFill = styled(motion.div)`
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #1BAEE5);
  transform-origin: 0 50%;
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
`;
const Label = styled.div`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #ef4444;
`;
const Counter = styled.div`
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  font-feature-settings: 'tnum';
`;

const Slide = styled(motion.div)`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 28px;
  align-items: center;
  min-height: 180px;
  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 16px;
    min-height: 0;
  }
`;

const Stat = styled.div`
  font-size: clamp(48px, 9vw, 88px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 0.95;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-feature-settings: 'tnum';
`;

const Body = styled.div`min-width: 0;`;

const Headline = styled.h3`
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 800;
  color: #fff;
  margin: 0 0 10px;
  line-height: 1.2;
  letter-spacing: -0.02em;
`;

const Detail = styled(motion.p)`
  font-size: 14px;
  color: rgba(255,255,255,0.65);
  line-height: 1.65;
  margin: 0 0 14px;
`;

const Answer = styled(motion.div)`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  background: rgba(27,174,229,0.07);
  border: 1px solid rgba(27,174,229,0.22);
  border-radius: 10px;
  font-size: 13.5px;
  color: rgba(255,255,255,0.82);
  line-height: 1.55;
`;
const AnswerTag = styled.span`
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #1BAEE5;
  background: rgba(27,174,229,0.12);
  padding: 3px 7px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 1px;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
  flex-wrap: wrap;
`;

const Dots = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

const Dot = styled.button<{ $active: boolean }>`
  width: ${p => p.$active ? '24px' : '8px'};
  height: 8px;
  border-radius: 4px;
  background: ${p => p.$active ? '#1BAEE5' : 'rgba(255,255,255,0.2)'};
  border: none;
  cursor: pointer;
  transition: all 0.25s;
  &:hover { background: ${p => p.$active ? '#1BAEE5' : 'rgba(255,255,255,0.4)'}; }
`;

const PauseBtn = styled.button`
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.65);
  font-size: 11px;
  font-weight: 600;
  padding: 5px 11px;
  border-radius: 999px;
  cursor: pointer;
  &:hover { color: #fff; background: rgba(255,255,255,0.08); }
`;

const ROTATION_MS = 7000;

export const IndustryTicker: React.FC = () => {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx(i => (i + 1) % INDUSTRY_GAPS.length), ROTATION_MS);
    return () => clearInterval(t);
  }, [paused, idx]);

  useEffect(() => {
    // restart progress animation when the slide changes
    setProgressKey(k => k + 1);
  }, [idx]);

  const gap = INDUSTRY_GAPS[idx];

  return (
    <Wrap
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <ProgressBar>
        {!paused && (
          <ProgressFill
            key={progressKey}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: ROTATION_MS / 1000, ease: 'linear' }}
          />
        )}
      </ProgressBar>
      <Head>
        <Label>🔥 Industry gap {idx + 1} of {INDUSTRY_GAPS.length}</Label>
        <Counter>auto-rotates · hover to pause · click to {expanded ? 'collapse' : 'expand'}</Counter>
      </Head>

      <AnimatePresence mode="wait">
        <Slide
          key={gap.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => setExpanded(e => !e)}
          style={{ cursor: 'pointer' }}
        >
          <Stat>{gap.stat}</Stat>
          <Body>
            <Headline>{gap.headline}</Headline>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: 'hidden' }}
                >
                  <Detail>{gap.body}</Detail>
                  <Answer>
                    <AnswerTag>Curavend</AnswerTag>
                    <span>{gap.curavendAnswer}</span>
                  </Answer>
                </motion.div>
              )}
            </AnimatePresence>
          </Body>
        </Slide>
      </AnimatePresence>

      <Controls>
        <Dots>
          {INDUSTRY_GAPS.map((_, i) => (
            <Dot key={i} $active={i === idx} onClick={() => setIdx(i)} aria-label={`Go to gap ${i + 1}`} />
          ))}
        </Dots>
        <PauseBtn onClick={() => setPaused(p => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</PauseBtn>
      </Controls>
    </Wrap>
  );
};
