import { useRef } from 'react';
import { useScroll, MotionValue } from 'framer-motion';

export function useScrollProgress(): [React.RefObject<HTMLElement | null>, MotionValue<number>] {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref as React.RefObject<HTMLElement>,
    offset: ['start end', 'end start'],
  });
  return [ref, scrollYProgress];
}
