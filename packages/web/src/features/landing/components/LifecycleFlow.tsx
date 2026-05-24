/**
 * Lifecycle Flow — pinned horizontal scroll-jacking section.
 *
 * As the visitor scrolls vertically through the section's height, the
 * horizontal track translates so each of the 8 order sub-statuses slides
 * through the viewport center.
 *
 * Pixel-accurate centering:
 *   - The track translation is computed from a measured trackRef so
 *     CARD 1 lands centered at the start, and CARD 8 lands centered at
 *     the end. No percentage guessing, no clipped first/last cards.
 *
 * Dwell:
 *   - 0..0.08 of progress: hold on card 1 so the user can read it.
 *   - 0.08..0.92: smoothly traverse all 8 cards.
 *   - 0.92..1: hold on card 8.
 *
 * Section is 600vh tall (≈75vh per card) so each step gets enough scroll
 * time to register.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Container, Eyebrow, SectionTitle, Lede } from '../lib/primitives';
import { colors } from '../lib/motionTokens';

const FlowSection = styled.section`
  position: relative;
  height: 600vh; /* 6 viewports of vertical scroll for 8 horizontal cards */
  background: ${colors.bg1};
`;

const StickyViewport = styled.div`
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const TrackOuter = styled.div`
  position: relative;
  width: 100%;
  overflow: visible;
`;

const Track = styled(motion.div)`
  display: flex;
  gap: 32px;
  /* Left padding pushes the FIRST card to the center of the viewport at x=0. */
  padding: 0;
  will-change: transform;
  /* Each Step is a fixed 380px so we can compute the geometry exactly. */
`;

const CARD_WIDTH = 380;
const CARD_GAP = 32;

const Step = styled(motion.div)`
  flex: 0 0 ${CARD_WIDTH}px;
  min-height: 320px;
  padding: 32px;
  border-radius: 24px;
  background: ${colors.bg2};
  border: 1px solid ${colors.hairline};
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
  transition: background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease;
  & .step-num {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: ${colors.brand};
    text-transform: uppercase;
  }
  & h3 {
    font-size: 26px;
    font-weight: 700;
    margin: 14px 0 10px 0;
    line-height: 1.15;
    color: ${colors.text};
  }
  & p {
    color: ${colors.textDim};
    font-size: 14px;
    line-height: 1.55;
    margin: 0;
  }
`;

const BackgroundHue = styled(motion.div)`
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
  z-index: 0;
`;

const ProgressDots = styled.div`
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 3;
`;

const Dot = styled(motion.span)`
  width: 8px;
  height: 8px;
  border-radius: 100px;
  background: ${colors.hairlineStrong};
  transition: background 0.3s, width 0.3s;
`;

const STEPS = [
  { label: 'NEW_ORDER', title: 'Order created', desc: 'Hospital staff places an order. ICD-10 + HCPC codes auto-extracted via Workers AI from any uploaded face sheet or PDF.' },
  { label: 'VENDOR_ASSIGNED', title: 'Vendor routed', desc: 'The routing engine scores every vendor against geography, contract, capability, and live stock — and assigns the winner.' },
  { label: 'VENDOR_CONFIRMED', title: 'Receipt confirmed', desc: 'Vendor acknowledges the order from their console. Decline (with reason) routes back for re-assignment.' },
  { label: 'ASSESSED', title: 'Patient assessed', desc: 'Encounter flow captures the assessment, attaches images, and locks in the deliverable line items.' },
  { label: 'DELIVERED', title: 'Delivered', desc: 'Carrier + tracking number recorded. Bulk-tracking CSV uploads close the last-mile gap for high-volume vendors.' },
  { label: 'PROOF_UPLOADED', title: 'Proof captured', desc: 'POD signature + photo uploaded. PHI access logged. Encounter audit log gets the trail.' },
  { label: 'SPEND_CONFIRMED', title: 'Spend confirmed', desc: 'Hospital reviews and approves the spend. Triggers invoice generation, tax calculation, and Stripe checkout.' },
  { label: 'ORDER_COMPLETED', title: 'Completed', desc: 'Invoice paid, integration log closed, ERP push fires the final EDI-850 / webhook acknowledgment.' },
];

const HUE_STOPS = ['#0d0f17', '#0e1422', '#0f1a2e', '#0e1e3a', '#102444', '#142a4c', '#0e2540', '#0a1830'];

/**
 * Build a 3-stop input range for useTransform that is GUARANTEED to be
 * monotonically non-decreasing AND inside [0, 1]. Either edge that would
 * fall outside gets pinned to the bound, which makes the transform act as
 * a plateau on that side (acceptable for our centered-fade animations on
 * the first and last steps).
 */
function clampedRange(center: number, halfWidth: number): [number, number, number] {
  const lo = Math.max(0, center - halfWidth);
  const hi = Math.min(1, center + halfWidth);
  const mid = Math.max(lo, Math.min(hi, center));
  return [lo, mid, hi];
}

interface StepCardProps {
  step: typeof STEPS[number];
  index: number;
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
  stepWindow: number;
}

const StepCard: React.FC<StepCardProps> = ({ step, index, progress, stepWindow }) => {
  const stepCenter = 0.08 + index * stepWindow;
  const range = clampedRange(stepCenter, stepWindow);
  const opacity = useTransform(progress, range, [0.4, 1, 0.4]);
  const scale = useTransform(progress, range, [0.93, 1.03, 0.93]);
  return (
    <Step style={{ opacity, scale }}>
      <div className="step-num">
        Step {index + 1} · {step.label}
      </div>
      <h3>{step.title}</h3>
      <p>{step.desc}</p>
    </Step>
  );
};

interface DotIndicatorProps {
  index: number;
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
  stepWindow: number;
}

const DotIndicator: React.FC<DotIndicatorProps> = ({ index, progress, stepWindow }) => {
  const stepCenter = 0.08 + index * stepWindow;
  const range = clampedRange(stepCenter, stepWindow / 2);
  const width = useTransform(progress, range, [8, 28, 8]);
  const background = useTransform(progress, range, [colors.hairlineStrong, colors.brand, colors.hairlineStrong]);
  return <Dot style={{ width, background }} />;
};

export const LifecycleFlow: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  // Critical offset choice:
  //   'start start' — progress=0 the moment the section's top hits the
  //                   viewport top (i.e. the sticky pin starts).
  //   'end end'     — progress=1 the moment the section's bottom hits the
  //                   viewport bottom (i.e. the sticky pin releases).
  // This aligns the 0..1 range with the sticky lifetime, so step 1 is
  // visible at exactly progress=0 and step 8 at exactly progress=1.
  const { scrollYProgress: progress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  // Measure the viewport width so we can compute pixel-accurate
  // translation that centers card 1 at start and card N at end.
  const [viewportW, setViewportW] = useState(typeof window === 'undefined' ? 1440 : window.innerWidth);
  useLayoutEffect(() => {
    const update = () => setViewportW(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // x at which the FIRST card sits centered: viewportW/2 - cardWidth/2.
  // x at which the LAST card sits centered: viewportW/2 - (totalWidth - cardWidth/2)
  // = viewportW/2 - ((N-1)*(cardW+gap) + cardW/2)
  const N = STEPS.length;
  const startX = viewportW / 2 - CARD_WIDTH / 2;
  const endX = viewportW / 2 - ((N - 1) * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2);

  // Dwell on first card from progress 0..0.08, traverse 0.08..0.92, dwell on last 0.92..1.
  const x = useTransform(progress, [0, 0.08, 0.92, 1], [startX, startX, endX, endX]);

  // Per-step active "weight" — 1.0 when centered, 0..1 nearby, used for opacity/scale.
  // The traversal range is [0.08, 0.92] for N steps, so each step occupies (0.92-0.08)/(N-1) ≈ 0.12 of progress.
  const stepWindow = (0.92 - 0.08) / (N - 1);

  // Background hue: index into HUE_STOPS based on which card is centered.
  const bg = useTransform(progress, [0, 1], [HUE_STOPS[0], HUE_STOPS[HUE_STOPS.length - 1]]);

  return (
    <FlowSection ref={ref}>
      <StickyViewport>
        <BackgroundHue style={{ background: bg }} />
        <Container style={{ marginBottom: 36 }}>
          <Eyebrow>The order lifecycle</Eyebrow>
          <SectionTitle>From order to invoice — 8 verifiable states.</SectionTitle>
          <Lede style={{ marginBottom: 0 }}>
            Every transition is audit-logged, every actor is tenant-scoped, every external call is
            retry-tracked with dead-letter handling.
          </Lede>
        </Container>
        <TrackOuter>
          <Track style={{ x }}>
            {STEPS.map((s, i) => (
              <StepCard key={s.label} step={s} index={i} progress={progress} stepWindow={stepWindow} />
            ))}
          </Track>
        </TrackOuter>
        <ProgressDots>
          {STEPS.map((_, i) => (
            <DotIndicator key={i} index={i} progress={progress} stepWindow={stepWindow} />
          ))}
        </ProgressDots>
      </StickyViewport>
    </FlowSection>
  );
};

export default LifecycleFlow;
