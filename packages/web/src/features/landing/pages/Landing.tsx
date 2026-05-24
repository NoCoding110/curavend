/**
 * Landing — public marketing page at `/`.
 *
 * Twelve sections, scroll-driven animations, lazy 3D scene. Wraps the
 * entire page in the Lenis smooth-scroll provider.
 */
import React from 'react';
import styled, { createGlobalStyle } from 'styled-components';
import { ScrollProvider } from '../lib/scrollProvider';
import { colors } from '../lib/motionTokens';
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
import { Footer } from '../components/Footer';

/**
 * Global resets scoped to the landing page only — these override the
 * Ant Design defaults that the SPA uses elsewhere. When the user navigates
 * to `/login` or `/dashboard`, these reset and the SPA's normal theming
 * takes over.
 */
const LandingGlobal = createGlobalStyle`
  body {
    background: ${colors.bg0};
    color: ${colors.text};
    margin: 0;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  /* Make sure the SPA's default light backdrop doesn't bleed through. */
  #root {
    background: ${colors.bg0};
  }
  /* Tasteful selection color */
  ::selection {
    background: ${colors.brand}44;
    color: ${colors.text};
  }
`;

const PageWrap = styled.div`
  position: relative;
  background: ${colors.bg0};
  color: ${colors.text};
  overflow-x: clip;
`;

export const Landing: React.FC = () => {
  return (
    <ScrollProvider>
      <LandingGlobal />
      <PageWrap>
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
        <Footer />
      </PageWrap>
    </ScrollProvider>
  );
};

export default Landing;
