import React, { Suspense, lazy } from 'react';
import styled from 'styled-components';
import { Section, SectionInner, SectionLabel, SectionHeading, SectionBody } from '../lib/primitives';
import { RoutingSVGFallback } from '../assets/illustrations';

const RoutingScene = lazy(() => import('./scenes/RoutingScene'));

const SceneWrap = styled.div`
  position: relative;
  height: 420px;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(27,174,229,0.15);
  background: rgba(5,10,20,0.8);
  margin-top: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;

export const VendorRouting: React.FC = () => (
  <Section style={{ background: '#060B13' }}>
    <SectionInner>
      <SectionLabel>Vendor Routing</SectionLabel>
      <SectionHeading>Intelligent scoring on every order.</SectionHeading>
      <SectionBody>
        Geography, contract, capability, and live stock — scored in parallel so the best vendor wins every time.
      </SectionBody>
      <SceneWrap>
        {isMobile() ? (
          <RoutingSVGFallback />
        ) : (
          <Suspense fallback={<RoutingSVGFallback />}>
            <RoutingScene />
          </Suspense>
        )}
      </SceneWrap>
    </SectionInner>
  </Section>
);
