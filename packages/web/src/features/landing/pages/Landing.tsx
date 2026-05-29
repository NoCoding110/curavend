import React, { useEffect, useState } from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { ScrollProvider } from '../lib/scrollProvider';
import { AuthedBanner } from '../components/AuthedBanner';
import { Hero } from '../components/Hero';
import { TrustStrip } from '../components/TrustStrip';
import { Personas } from '../components/Personas';
import { LifecycleFlow } from '../components/LifecycleFlow';
import { VendorRouting } from '../components/VendorRouting';
import { PricingCascade } from '../components/PricingCascade';
import { LabPortalFan } from '../components/LabPortalFan';
import { SecuritySection } from '../components/SecuritySection';
import { IntegrationsGrid } from '../components/IntegrationsGrid';
import { Stats } from '../components/Stats';
import { CTAStrip } from '../components/CTAStrip';
import { LandingFooter } from '../components/LandingFooter';

const GlobalLanding = createGlobalStyle`
  body { background: #070C14; margin: 0; }
`;

const BackToTop = styled.button<{ $visible: boolean }>`
  position: fixed;
  bottom: 32px;
  right: 32px;
  z-index: 1000;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #1BAEE5;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: ${p => p.$visible ? 1 : 0};
  pointer-events: ${p => p.$visible ? 'auto' : 'none'};
  transition: opacity 0.3s;
  box-shadow: 0 4px 16px rgba(27,174,229,0.4);
  &:hover { background: #0e8dc0; }
`;

export const Landing: React.FC = () => {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > window.innerHeight * 0.7);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ScrollProvider>
      <GlobalLanding />
      <AuthedBanner />
      <Hero />
      <TrustStrip />
      <Personas />
      <LifecycleFlow />
      <VendorRouting />
      <PricingCascade />
      <LabPortalFan />
      <SecuritySection />
      <IntegrationsGrid />
      <Stats />
      <CTAStrip />
      <LandingFooter />
      <BackToTop
        $visible={showTop}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        title="Back to top"
      >↑</BackToTop>
    </ScrollProvider>
  );
};

export default Landing;
