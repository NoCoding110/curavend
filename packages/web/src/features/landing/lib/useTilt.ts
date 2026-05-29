import { useRef, useCallback } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import { SPRING_TILT } from './motionTokens';

export function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), SPRING_TILT);
  const rotateY = useSpring(useMotionValue(0), SPRING_TILT);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    rotateY.set(dx * 8);
    rotateX.set(-dy * 8);
  }, [rotateX, rotateY]);

  const onMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
  }, [rotateX, rotateY]);

  return { ref, rotateX, rotateY, onMouseMove, onMouseLeave };
}
