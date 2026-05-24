/**
 * Lab Portal Fan — scroll-driven explode-and-settle.
 *
 * Five kit asset chips (TRF, Shipping Label, Return Label, Stickers,
 * Consolidated PDF) start hidden behind the central "Lab Order" card and
 * fly outward to fixed positions around the card as the visitor scrolls
 * into the section. They settle EARLY (by progress 0.35) so the user sees
 * the full fan as soon as the section is in their viewport.
 *
 * Layout: 5 chips placed around the center card on a 2-row grid —
 *   row 1 (above): left, center, right
 *   row 2 (below): left, right
 * This avoids the all-pointing-up problem the angle-based layout had,
 * and every chip is clearly readable.
 *
 * Connector lines: faint SVG lines from each chip toward the card make the
 * "5 assets generated from 1 order" relationship visual.
 */
import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useTransform } from 'framer-motion';
import { Section, Container, Eyebrow, SectionTitle, Lede } from '../lib/primitives';
import { useScrollProgress } from '../lib/useScrollProgress';
import { colors, easings } from '../lib/motionTokens';
import { AssetChip, LabMark } from '../assets/illustrations';

const LabSection = styled(Section)`
  background: linear-gradient(180deg, ${colors.bg1} 0%, ${colors.bg0} 100%);
  min-height: 110vh;
`;

const Stage = styled.div`
  position: relative;
  height: 620px;
  margin-top: 60px;
  display: grid;
  place-items: center;
`;

const CenterCard = styled(motion.div)`
  position: relative;
  width: 360px;
  padding: 32px 28px;
  border-radius: 24px;
  background: linear-gradient(180deg, ${colors.bg3} 0%, ${colors.bg2} 100%);
  border: 1px solid ${colors.brand};
  box-shadow: 0 32px 80px ${colors.brand}33, 0 0 0 1px ${colors.brand}55 inset;
  text-align: center;
  z-index: 5;
  & h3 {
    font-size: 22px;
    font-weight: 700;
    margin: 16px 0 8px 0;
    color: ${colors.text};
  }
  & p {
    font-size: 13px;
    color: ${colors.textDim};
    margin: 0;
  }
  & .id {
    margin-top: 16px;
    font-family: monospace;
    font-size: 12px;
    color: ${colors.brandGlow};
    background: ${colors.glass};
    padding: 6px 10px;
    border-radius: 6px;
    display: inline-block;
  }
`;

const ChipWrap = styled(motion.div)`
  position: absolute;
  left: 50%;
  top: 50%;
  /* Chips sit above the card so their fly-out is visible from frame 1. */
  z-index: 6;
  will-change: transform;
`;

/** Faint connector line from chip to center. */
const Connector = styled(motion.div)<{ $angle: number; $length: number }>`
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${(p) => p.$length}px;
  height: 1px;
  background: linear-gradient(90deg, ${colors.brand}77 0%, ${colors.brand}11 100%);
  transform-origin: 0 50%;
  transform: rotate(${(p) => p.$angle}deg);
  z-index: 4;
  pointer-events: none;
`;

interface AssetSlot {
  label: string;
  /** Final position in px relative to the stage center. */
  x: number;
  y: number;
  /** Visual rotation when settled (degrees). */
  rotate: number;
}

/**
 * Layout: 5 chips around the central card.
 *
 *      TRF             OUTBOUND          RETURN
 *
 *               [ CENTER CARD ]
 *
 *      STICKERS                          CONSOLIDATED
 *
 * Positions are tuned so chips do NOT overlap the card (which is 360px
 * wide × ~220px tall) and stay inside the 1100px-wide × 620px-tall stage.
 */
const SLOTS: AssetSlot[] = [
  { label: 'Test Requisition Form', x: -380, y: -200, rotate: -3 },
  { label: 'Outbound Shipping Label', x: 0, y: -240, rotate: 0 },
  { label: 'Return Label', x: 380, y: -200, rotate: 3 },
  { label: 'Specimen Stickers', x: -340, y: 200, rotate: -2 },
  { label: 'Consolidated PDF', x: 340, y: 200, rotate: 2 },
];

export const LabPortalFan: React.FC = () => {
  const ref = useRef<HTMLElement>(null);
  const progress = useScrollProgress(ref);

  return (
    <LabSection ref={ref}>
      <Container>
        <Eyebrow>Lab Portal</Eyebrow>
        <SectionTitle>Kits, ready to ship.</SectionTitle>
        <Lede>
          Single-site or direct-to-patient (D2P). Every lab order spawns five assets
          atomically — TRF, outbound label, return label, stickers, and a consolidated PDF — via a
          workflow with terminate, retry, and event-signal controls.
        </Lede>
        <Stage>
          {/* Connectors: faint lines that grow outward as chips fly. */}
          {SLOTS.map((slot, i) => {
            const length = Math.sqrt(slot.x * slot.x + slot.y * slot.y);
            const angle = (Math.atan2(slot.y, slot.x) * 180) / Math.PI;
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const scale = useTransform(progress, [0.1, 0.4], [0, 1]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const op = useTransform(progress, [0.1, 0.35], [0, 0.7]);
            return (
              <Connector
                key={`c-${i}`}
                $angle={angle}
                $length={length}
                style={{ scaleX: scale, opacity: op }}
              />
            );
          })}

          {/* The 5 asset chips */}
          {SLOTS.map((slot, i) => {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const x = useTransform(progress, [0.1, 0.4], [0, slot.x]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const y = useTransform(progress, [0.1, 0.4], [0, slot.y]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const rotate = useTransform(progress, [0.1, 0.4], [0, slot.rotate]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const opacity = useTransform(progress, [0.08, 0.25], [0, 1]);
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const scale = useTransform(progress, [0.08, 0.3], [0.6, 1]);
            return (
              <ChipWrap
                key={slot.label}
                style={{
                  x,
                  y,
                  rotate,
                  scale,
                  opacity,
                  translateX: '-50%',
                  translateY: '-50%',
                }}
              >
                <AssetChip label={slot.label} />
              </ChipWrap>
            );
          })}

          <CenterCard
            initial={{ scale: 0.9, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: '0px 0px -20% 0px' }}
            transition={{ duration: 0.7, ease: easings.ease }}
          >
            <LabMark size={56} />
            <h3>Lab Order generated</h3>
            <p>Assets fan out automatically when the order enters READY_FOR_APPROVAL.</p>
            <div className="id">LAB-2026-107032</div>
          </CenterCard>
        </Stage>
      </Container>
    </LabSection>
  );
};

export default LabPortalFan;
