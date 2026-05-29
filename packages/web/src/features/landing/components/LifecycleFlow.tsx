import React, { useRef } from 'react';
import styled from 'styled-components';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Section, SectionInner, SectionLabel, SectionHeading } from '../lib/primitives';

const FlowTrack = styled.div`
  position: relative;
  overflow: hidden;
`;

const FlowRow = styled(motion.div)`
  display: flex;
  gap: 0;
  padding: 40px 0 60px;
  width: max-content;
`;

const Step = styled.div<{ $active?: boolean }>`
  min-width: 200px;
  padding: 24px 20px;
  position: relative;
  &::after {
    content: '→';
    position: absolute;
    right: -14px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(27,174,229,0.5);
    font-size: 20px;
    z-index: 2;
  }
  &:last-child::after { display: none; }
`;

const StepNum = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #1BAEE5;
  opacity: 0.7;
  margin-bottom: 6px;
`;

const StepName = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
`;

const StepCode = styled.code`
  font-size: 11px;
  color: rgba(27,174,229,0.7);
  background: rgba(27,174,229,0.1);
  padding: 2px 6px;
  border-radius: 4px;
`;

const STEPS = [
  { n: '01', name: 'New Order', code: 'NEW_ORDER' },
  { n: '02', name: 'Vendor Assigned', code: 'VENDOR_ASSIGNED' },
  { n: '03', name: 'Receipt Confirmed', code: 'VENDOR_CONFIRMED_RECEIPT' },
  { n: '04', name: 'Patient Assessed', code: 'PATIENT_VISITED_AND_ASSESSED' },
  { n: '05', name: 'Delivered', code: 'DELIVERED' },
  { n: '06', name: 'Proof Uploaded', code: 'PROOF_UPLOADED' },
  { n: '07', name: 'Spend Confirmed', code: 'VENDOR_CONFIRMED_RECEIPT' },
  { n: '08', name: 'Completed', code: 'ORDER_COMPLETED' },
];

export const LifecycleFlow: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0.1, 0.9], ['0%', '-40%']);

  return (
    <Section ref={ref} style={{ background: '#080D16' }}>
      <SectionInner>
        <SectionLabel>Order Lifecycle</SectionLabel>
        <SectionHeading>8 sub-states. Every transition tracked.</SectionHeading>
      </SectionInner>
      <FlowTrack>
        <FlowRow style={{ x }}>
          {STEPS.map(s => (
            <Step key={s.code}>
              <StepNum>Step {s.n}</StepNum>
              <StepName>{s.name}</StepName>
              <StepCode>{s.code}</StepCode>
            </Step>
          ))}
        </FlowRow>
      </FlowTrack>
    </Section>
  );
};
