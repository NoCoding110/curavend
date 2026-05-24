import { useRef } from 'react';
import { useMotionValue, useSpring, useTransform, useReducedMotion, type MotionValue } from 'framer-motion';
import { easings } from './motionTokens';

interface TiltOptions {
  /** Max tilt angle in degrees (default 8). */
  maxTilt?: number;
  /** Perspective distance in pixels (default 1000). */
  perspective?: number;
}

/**
 * Mouse-aware tilt hook for hover micro-interactions.
 *
 * Returns:
 *  - `ref` to attach to the target element
 *  - `rotateX`, `rotateY`: spring-smoothed motion values that lerp toward
 *    the cursor position. Both reset to 0 when the cursor leaves.
 *  - `transformPerspective`: a constant motion value the CSS uses to make
 *    the tilt look 3D.
 *  - `onMouseMove` and `onMouseLeave` handlers.
 *
 * Reduced-motion users get no-op handlers.
 */
export function useTilt(options: TiltOptions = {}): {
  ref: React.RefObject<HTMLDivElement>;
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  transformPerspective: number;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
} {
  const { maxTilt = 8, perspective = 1000 } = options;
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(useTransform(rawY, (v) => -v * maxTilt), easings.tiltSpring);
  const rotateY = useSpring(useTransform(rawX, (v) => v * maxTilt), easings.tiltSpring);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    rawX.set(cx - 0.5);
    rawY.set(cy - 0.5);
  };

  const onMouseLeave = () => {
    if (reduceMotion) return;
    rawX.set(0);
    rawY.set(0);
  };

  return { ref, rotateX, rotateY, transformPerspective: perspective, onMouseMove, onMouseLeave };
}
