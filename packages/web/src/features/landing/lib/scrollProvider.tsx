import React, { createContext, useContext, useEffect, useRef } from 'react';
import Lenis from 'lenis';

const LenisContext = createContext<Lenis | null>(null);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (prefersReduced) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      touchMultiplier: 0, // keep native touch
    });
    lenisRef.current = lenis;

    let raf: number;
    const animate = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [prefersReduced]);

  return (
    <LenisContext.Provider value={lenisRef.current}>
      {children}
    </LenisContext.Provider>
  );
}

export const useLenis = () => useContext(LenisContext);
