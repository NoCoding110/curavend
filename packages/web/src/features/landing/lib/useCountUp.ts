import { useState, useEffect, useRef } from 'react';
import { useInView } from 'framer-motion';

export function useCountUp(target: number, duration = 1800): number {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>, { once: true, margin: '-10% 0px' });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // cubic-out easing
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setValue(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, duration]);

  // Attach ref externally to caller's span
  return value;
}

export { useRef as useCountRef };
