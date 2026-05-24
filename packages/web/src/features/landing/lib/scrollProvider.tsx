/**
 * Lenis smooth-scroll provider.
 *
 * Wraps the landing page with a Lenis instance that adds buttery-smooth
 * inertial scroll on desktop while preserving native scroll on touch
 * devices (Lenis on iOS can fight the OS scroll engine, so we opt out).
 *
 * When the user has `prefers-reduced-motion: reduce`, Lenis is bypassed
 * entirely and the page scrolls natively. Framer Motion's `useScroll` still
 * works either way — it listens for scroll events on the window.
 */
import React, { useEffect } from 'react';
import Lenis from 'lenis';
import { useReducedMotion } from 'framer-motion';

interface ScrollProviderProps {
  children: React.ReactNode;
}

export const ScrollProvider: React.FC<ScrollProviderProps> = ({ children }) => {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return undefined;

    // Match a slow, cinematic ease-out curve (cubic).
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      // iOS / Android: keep native scroll. Lenis touch support fights momentum
      // and feels worse than the OS default.
      syncTouch: false,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [reduceMotion]);

  return <>{children}</>;
};
