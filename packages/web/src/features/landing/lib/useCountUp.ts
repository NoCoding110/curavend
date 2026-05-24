import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface CountUpOptions {
  /** Final value. */
  to: number;
  /** Animation duration in ms (default 1400). */
  duration?: number;
  /** Easing — cubic-out by default. */
  easing?: (t: number) => number;
}

/**
 * Intersection-triggered count-up.
 *
 * Returns `[value, ref]`. Attach the ref to the element that should be in
 * the viewport before the count starts. The first time the element enters
 * view, the value animates from 0 to `to` over `duration` ms.
 *
 * Reduced-motion users get the final value immediately, no animation.
 */
export function useCountUp({ to, duration = 1400, easing }: CountUpOptions): [number, React.RefObject<HTMLDivElement>] {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const [value, setValue] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (!inView || reduceMotion) {
      if (reduceMotion) setValue(to);
      return undefined;
    }
    const start = performance.now();
    const easeFn = easing ?? ((t: number) => 1 - Math.pow(1 - t, 3));
    let rafId = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeFn(t);
      setValue(Math.round(eased * to));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [inView, reduceMotion, to, duration, easing]);

  return [value, ref];
}
