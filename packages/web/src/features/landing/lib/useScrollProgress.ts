import { useScroll, type MotionValue } from 'framer-motion';
import type { RefObject } from 'react';

/**
 * Returns a 0..1 MotionValue tracking a section's life in the viewport.
 *
 * 0 = section's top edge is just entering the bottom of the viewport
 * 1 = section's bottom edge has just left the top of the viewport
 *
 * Used by every scroll-driven scene to drive parallax / scale / blur
 * transforms via `useTransform`.
 */
export function useScrollProgress(ref: RefObject<HTMLElement>): MotionValue<number> {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  return scrollYProgress;
}
