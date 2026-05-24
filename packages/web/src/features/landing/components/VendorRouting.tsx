/**
 * Vendor Routing wrapper — Section 5.
 *
 * Behavior:
 *   - Desktop / mouse pointer + width >= 768 + WebGL available: lazy-load
 *     RoutingScene.tsx (the react-three-fiber Canvas). When the user has
 *     scrolled within 400 px of this section, the chunk loads.
 *   - Mobile / coarse pointer / reduced motion: render the static SVG
 *     fallback (HexNetwork) inside a styled container.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, useReducedMotion } from 'framer-motion';
import { Section, Container, Eyebrow, SectionTitle, Lede } from '../lib/primitives';
import { useScrollProgress } from '../lib/useScrollProgress';
import { colors, easings } from '../lib/motionTokens';
import { HexNetwork } from '../assets/illustrations';

const RING_LABELS = ['Geography', 'Contract', 'Capability', 'Stock'] as const;

const RoutingSection = styled(Section)`
  background: radial-gradient(ellipse at center, ${colors.bg2} 0%, ${colors.bg0} 70%);
  padding: 140px 0;
  min-height: 110vh;
`;

const SceneStage = styled.div`
  position: relative;
  height: 600px;
  margin-top: 56px;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid ${colors.hairline};
  background: linear-gradient(180deg, ${colors.bg1} 0%, ${colors.bg0} 100%);
  cursor: crosshair;
`;

const InteractHint = styled.div`
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 3;
  padding: 6px 12px;
  border-radius: 100px;
  background: rgba(13, 15, 23, 0.65);
  border: 1px solid ${colors.hairlineStrong};
  backdrop-filter: blur(8px);
  color: ${colors.textDim};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
`;

const Legend = styled.div`
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(13, 15, 23, 0.72);
  border: 1px solid ${colors.hairlineStrong};
  backdrop-filter: blur(10px);
  pointer-events: none;
`;

const LegendTitle = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: ${colors.textMuted};
  text-transform: uppercase;
  margin-bottom: 4px;
`;

const LegendRow = styled(motion.div)<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  color: ${(p) => (p.$active ? colors.text : colors.textDim)};
  transition: color 0.3s ease;
  & .step-num {
    width: 22px;
    height: 22px;
    border-radius: 100px;
    display: grid;
    place-items: center;
    background: ${(p) =>
      p.$active
        ? `linear-gradient(135deg, ${colors.brand} 0%, ${colors.accent} 100%)`
        : 'transparent'};
    border: 1px solid ${(p) => (p.$active ? 'transparent' : colors.hairlineStrong)};
    color: ${(p) => (p.$active ? '#fff' : colors.textDim)};
    font-size: 10px;
    transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
    box-shadow: ${(p) => (p.$active ? `0 0 18px ${colors.brand}77` : 'none')};
  }
`;

const LiveDot = styled(motion.span)`
  width: 6px;
  height: 6px;
  border-radius: 100px;
  background: ${colors.brand};
  box-shadow: 0 0 8px ${colors.brand};
`;

const LiveBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: ${colors.brand};
  margin-bottom: 6px;
  text-transform: uppercase;
`;

const FallbackSvg = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  & svg {
    width: 80%;
    height: 80%;
    max-width: 720px;
    max-height: 480px;
  }
`;

const ScoringPills = styled.div`
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  z-index: 3;
`;

const Pill = styled.span`
  padding: 6px 14px;
  background: ${colors.glass};
  border: 1px solid ${colors.hairline};
  border-radius: 100px;
  color: ${colors.textDim};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  backdrop-filter: blur(12px);
`;

const RoutingScene = lazy(() => import('./scenes/RoutingScene'));

/**
 * Detect whether to skip the WebGL scene (mobile / coarse pointer / no-webgl).
 */
function shouldUseFallback(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(pointer: coarse)').matches) return true;
  if (window.innerWidth < 768) return true;
  // Probe WebGL availability
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return true;
  } catch {
    return true;
  }
  return false;
}

export const VendorRouting: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const progress = useScrollProgress(ref);
  const reduceMotion = useReducedMotion();
  const [shouldLoad3D, setShouldLoad3D] = useState(false);
  const [useFallback, setUseFallback] = useState(true);
  const [activeRing, setActiveRing] = useState<number | null>(null);

  useEffect(() => {
    setUseFallback(shouldUseFallback() || !!reduceMotion);
  }, [reduceMotion]);

  // Trigger 3D load when within 400px of the section
  useEffect(() => {
    if (useFallback) return undefined;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShouldLoad3D(true);
      },
      { rootMargin: '400px 0px' },
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [useFallback]);

  return (
    <RoutingSection ref={ref}>
      <Container>
        <Eyebrow>Vendor routing engine</Eyebrow>
        <SectionTitle>Every line item, scored against every vendor.</SectionTitle>
        <Lede>
          A multi-phase scorer evaluates geography, contract, capability, and live stock for every
          vendor in your network — then assigns the winner. Same engine drives split-vendor orders
          and the daily SLA breach alerts.
        </Lede>
        <SceneStage>
          {useFallback ? (
            <>
              <FallbackSvg>
                <HexNetwork />
              </FallbackSvg>
              <ScoringPills>
                <Pill>1 · Geography</Pill>
                <Pill>2 · Contract</Pill>
                <Pill>3 · Capability</Pill>
                <Pill>4 · Stock</Pill>
              </ScoringPills>
            </>
          ) : (
            <>
              {shouldLoad3D && (
                <Suspense fallback={<FallbackSvg><HexNetwork /></FallbackSvg>}>
                  <RoutingScene
                    progress={progress}
                    onActiveRingChange={setActiveRing}
                  />
                </Suspense>
              )}
              <Legend>
                <LiveBadge>
                  <LiveDot
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                  Routing
                </LiveBadge>
                <LegendTitle>Scoring Pipeline</LegendTitle>
                {RING_LABELS.map((label, i) => (
                  <LegendRow
                    key={label}
                    $active={activeRing === i}
                    animate={{
                      x: activeRing === i ? 2 : 0,
                    }}
                    transition={{ duration: 0.25, ease: easings.ease }}
                  >
                    <span className="step-num">{i + 1}</span>
                    {label}
                  </LegendRow>
                ))}
              </Legend>
              <InteractHint>Move · Click to route</InteractHint>
            </>
          )}
        </SceneStage>
      </Container>
    </RoutingSection>
  );
};

export default VendorRouting;
