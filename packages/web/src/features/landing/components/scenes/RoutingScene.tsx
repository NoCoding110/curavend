/**
 * RoutingScene v2 — react-three-fiber, lazy-loaded.
 *
 * What's happening on-screen:
 *   - A low-poly wireframe globe rotates slowly.
 *   - 24 vendor nodes sit on the globe surface, each pulsing independently.
 *   - 3 hospital nodes sit in front of the globe, also gently floating.
 *   - 3 routing particles flow simultaneously along independent curves,
 *     each going from a different hospital through 4 scoring rings to a
 *     different winning vendor. They never sync — they spawn at random
 *     phases so the scene always has something happening.
 *   - When a particle crosses a ring, that ring flashes an expanding
 *     "shock wave" — a brief energy burst showing the score was applied.
 *   - Winning vendors keep a permanent glow + a slow pulse ring around
 *     them so the eye can find the "best matches".
 *   - The 4 scoring rings (Geography / Contract / Capability / Stock) are
 *     positioned at separate Z depths AND their labels are anchored to
 *     the right side of each ring (not stacked top-center) so they're all
 *     readable simultaneously.
 *   - The camera follows the mouse position subtly so the scene feels
 *     interactive without ever fighting the user's scroll.
 *   - Clicking the canvas spawns a "burst" particle from a random hospital
 *     to a random vendor — a small reward for exploring.
 *   - Drei <Sparkles> adds ambient depth particles.
 */
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Float, Stars, Sparkles } from '@react-three/drei';
import {
  Vector3,
  CatmullRomCurve3,
  Color,
  type Mesh,
  type Group,
  AdditiveBlending,
} from 'three';
import type { MotionValue } from 'framer-motion';
import { colors } from '../../lib/motionTokens';

interface RoutingSceneProps {
  /** 0..1 scroll progress through the parent section. */
  progress: MotionValue<number>;
  /** Optional callback: which scoring ring index is currently being crossed. */
  onActiveRingChange?: (ringIdx: number | null) => void;
}

const RING_Z = [2.4, 1.4, 0.4, -0.6] as const;
export const RING_LABELS = ['Geography', 'Contract', 'Capability', 'Stock'] as const;
const RING_RADIUS = 1.55;
const VENDOR_COUNT = 24;
const WINNERS = [4, 11, 18]; // indices of vendor nodes that act as winning destinations

/** Distribute N points on a sphere using the Fibonacci lattice. */
function fibonacciSphere(n: number, r: number): Vector3[] {
  const pts: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts.push(new Vector3(Math.cos(theta) * radius * r, y * r, Math.sin(theta) * radius * r));
  }
  return pts;
}

/** Generate a curve from a hospital point through all 4 rings to a vendor. */
function makeCurve(hospital: Vector3, vendor: Vector3, jitter: number): CatmullRomCurve3 {
  // Slight per-curve jitter so the 3 curves don't overlap.
  const points: Vector3[] = [hospital];
  for (let i = 0; i < RING_Z.length; i++) {
    points.push(
      new Vector3(
        Math.sin(i * 1.7 + jitter) * 0.35,
        Math.cos(i * 1.3 + jitter) * 0.35,
        RING_Z[i],
      ),
    );
  }
  points.push(vendor);
  return new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
}

/** A single vendor node sphere. Pulses on its own clock. */
const VendorNode: React.FC<{
  position: Vector3;
  isWinner: boolean;
  phase: number;
  highlight: boolean;
}> = ({ position, isWinner, phase, highlight }) => {
  const meshRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.elapsedTime + phase;
    const pulse = isWinner ? 1 + Math.sin(t * 2) * 0.18 : 1 + Math.sin(t * 1.4) * 0.08;
    meshRef.current.scale.setScalar(pulse);
    const mat = meshRef.current.material as any;
    if (mat) {
      mat.emissiveIntensity = isWinner ? 2.6 + Math.sin(t * 2) * 0.5 : highlight ? 1.5 : 0.05;
    }
  });
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[isWinner ? 0.08 : 0.05, 16, 16]} />
      <meshStandardMaterial
        color={isWinner ? colors.brandGlow : highlight ? colors.brand : colors.textDim}
        emissive={isWinner ? colors.brand : highlight ? colors.brand : '#000'}
        emissiveIntensity={isWinner ? 2.6 : 0}
        toneMapped={false}
      />
    </mesh>
  );
};

/** Outward "shock-wave" torus that grows and fades. */
const ShockWave: React.FC<{ z: number; trigger: number }> = ({ z, trigger }) => {
  const meshRef = useRef<Mesh>(null);
  const startTimeRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    // Reset timer whenever `trigger` increments.
    if (startTimeRef.current === null || startTimeRef.current < trigger) {
      startTimeRef.current = trigger;
      meshRef.current.scale.setScalar(1);
    }
    const elapsed = clock.elapsedTime - startTimeRef.current;
    if (elapsed < 0 || elapsed > 1.2) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;
    const t = elapsed / 1.2;
    const scale = 1 + t * 1.8;
    meshRef.current.scale.setScalar(scale);
    const mat = meshRef.current.material as any;
    if (mat) mat.opacity = (1 - t) * 0.9;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[RING_RADIUS, 0.05, 16, 64]} />
      <meshBasicMaterial
        color={colors.brandGlow}
        transparent
        opacity={0}
        blending={AdditiveBlending}
      />
    </mesh>
  );
};

/** Scoring ring (no label — label panel is rendered separately). */
const ScoringRing: React.FC<{
  index: number;
  z: number;
  particleZs: { value: number }[];
  onCross: (ringIdx: number) => void;
  setActiveRing: (ringIdx: number | null) => void;
}> = ({ index, z, particleZs, onCross, setActiveRing }) => {
  const ringRef = useRef<Mesh>(null);
  const lastCrossed = useRef<boolean[]>(particleZs.map(() => false));

  useFrame(() => {
    if (!ringRef.current) return;
    // Check if any particle is currently near this ring's z plane.
    let activity = 0;
    let anyNear = false;
    particleZs.forEach((p, pi) => {
      const dist = Math.abs(p.value - z);
      const near = dist < 0.12;
      if (near) anyNear = true;
      if (near && !lastCrossed.current[pi]) {
        lastCrossed.current[pi] = true;
        onCross(index);
      } else if (!near) {
        lastCrossed.current[pi] = false;
      }
      activity += Math.max(0, 1 - dist * 4);
    });
    if (anyNear) setActiveRing(index);
    const mat = ringRef.current.material as any;
    if (mat) {
      mat.opacity = 0.22 + Math.min(0.8, activity * 0.5);
      mat.emissiveIntensity = 0.6 + activity * 2;
    }
  });

  return (
    <group position={[0, 0, z]}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RING_RADIUS, 0.025, 16, 96]} />
        <meshStandardMaterial
          color={colors.brand}
          emissive={colors.brand}
          emissiveIntensity={0.6}
          transparent
          opacity={0.22}
        />
      </mesh>
    </group>
  );
};

/** A single routing particle with a fading trail. */
const RoutingParticle: React.FC<{
  curve: CatmullRomCurve3;
  speed: number;
  offset: number;
  zRef: { value: number };
  color: string;
}> = ({ curve, speed, offset, zRef, color }) => {
  const head = useRef<Mesh>(null);
  const trail = useRef<(Mesh | null)[]>([]);
  const TRAIL_LEN = 6;

  useFrame(({ clock }) => {
    if (!head.current) return;
    const t = ((clock.elapsedTime * speed + offset) % 1 + 1) % 1;
    const pos = curve.getPoint(t);
    head.current.position.copy(pos);
    zRef.value = pos.z;

    // Trail: each segment lags behind by a fraction.
    for (let i = 0; i < TRAIL_LEN; i++) {
      const seg = trail.current[i];
      if (!seg) continue;
      const lag = (i + 1) * 0.02;
      const tt = ((t - lag) + 1) % 1;
      const sp = curve.getPoint(tt);
      seg.position.copy(sp);
      const mat = seg.material as any;
      if (mat) mat.opacity = 1 - (i + 1) / (TRAIL_LEN + 2);
    }
  });

  return (
    <group>
      <mesh ref={head}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} toneMapped={false} />
      </mesh>
      {Array.from({ length: TRAIL_LEN }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => (trail.current[i] = el)}
        >
          <sphereGeometry args={[0.05 - i * 0.005, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} blending={AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
};

/** Camera that lerps toward mouse position + scroll-driven dolly. */
const Camera: React.FC<{ progress: MotionValue<number>; mouse: { x: number; y: number } }> = ({
  progress,
  mouse,
}) => {
  useFrame(({ camera }) => {
    const p = progress.get();
    // Scroll dolly: closer in the middle of the section.
    const z = 7.5 - Math.sin(p * Math.PI) * 1.2;
    // Mouse parallax — gently follow horizontal/vertical mouse, with damping.
    const targetX = mouse.x * 1.4;
    const targetY = 0.4 + mouse.y * 0.8;
    camera.position.x += (targetX - camera.position.x) * 0.04;
    camera.position.y += (targetY - camera.position.y) * 0.04;
    camera.position.z += (z - camera.position.z) * 0.05;
    camera.lookAt(0, 0, 0);
  });
  return null;
};

const RoutingScene: React.FC<RoutingSceneProps> = ({ progress, onActiveRingChange }) => {
  const vendorPoints = useMemo(() => fibonacciSphere(VENDOR_COUNT, 1.85), []);
  const hospitalPositions = useMemo(
    () => [new Vector3(-0.6, 0.5, 3.4), new Vector3(0.5, -0.4, 3.5), new Vector3(0.2, 0.7, 3.3)],
    [],
  );

  // 3 simultaneous curves: hospital_i → vendor_winner_i, jittered.
  const curves = useMemo(
    () =>
      hospitalPositions.map((h, i) =>
        makeCurve(h, vendorPoints[WINNERS[i]], i * 1.3),
      ),
    [hospitalPositions, vendorPoints],
  );

  // Mutable z tracker per particle, used to drive ring activation.
  const particleZs = useRef([
    { value: 3 },
    { value: 3 },
    { value: 3 },
  ]).current;

  // Vendor pulse phases — random per node so they don't sync.
  const phases = useMemo(() => Array.from({ length: VENDOR_COUNT }, () => Math.random() * 10), []);

  // Highlight: which non-winner nodes glow brand-cyan briefly when a particle is near them.
  // Currently unused but kept for future per-node highlight logic.
  const [highlightedNodes] = useState<Set<number>>(new Set());

  // Ring-crossing triggers — each entry is a `lastCrossedTime` per ring index.
  const [ringTriggers, setRingTriggers] = useState<number[]>([0, 0, 0, 0]);

  const onRingCross = useCallback((ringIdx: number) => {
    setRingTriggers((prev) => {
      const next = [...prev];
      next[ringIdx] = performance.now() / 1000;
      return next;
    });
  }, []);

  // Mouse position normalized to [-1, 1] for camera parallax.
  const mouseRef = useRef({ x: 0, y: 0 });

  // Click-to-burst: spawn an extra particle from random hospital → random vendor.
  const [burstParticles, setBurstParticles] = useState<
    { id: number; curve: CatmullRomCurve3; color: string; spawnedAt: number }[]
  >([]);

  const onCanvasClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = performance.now();
      const h = hospitalPositions[Math.floor(Math.random() * hospitalPositions.length)];
      const v = vendorPoints[Math.floor(Math.random() * vendorPoints.length)];
      const c = makeCurve(h, v, Math.random() * 3);
      const colorChoices = [colors.brandGlow, colors.accent, '#ffd166'];
      const color = colorChoices[Math.floor(Math.random() * colorChoices.length)];
      setBurstParticles((prev) => [...prev.slice(-3), { id, curve: c, color, spawnedAt: performance.now() }]);
      // Garbage-collect after 6s.
      setTimeout(() => {
        setBurstParticles((prev) => prev.filter((p) => p.id !== id));
      }, 6000);
    },
    [hospitalPositions, vendorPoints],
  );

  return (
    <Canvas
      camera={{ position: [0, 0.4, 7.5], fov: 45 }}
      dpr={[1, 2]}
      style={{ background: 'transparent' }}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      }}
      onClick={onCanvasClick as any}
    >
      <ambientLight intensity={0.45} />
      <pointLight position={[10, 10, 10]} intensity={1.4} color={new Color(colors.brand)} />
      <pointLight position={[-8, -4, -6]} intensity={0.8} color={new Color(colors.accent)} />

      <Stars radius={50} depth={50} count={1400} factor={2} fade speed={0.6} />
      <Sparkles count={60} scale={6} size={2} speed={0.3} color={colors.brand} opacity={0.4} />

      {/* Globe */}
      <RotatingGlobe />

      {/* Vendor nodes */}
      {vendorPoints.map((p, i) => (
        <VendorNode
          key={i}
          position={p}
          isWinner={WINNERS.includes(i)}
          phase={phases[i]}
          highlight={highlightedNodes.has(i)}
        />
      ))}

      {/* Winner pulse rings — slow expanding glow around winning vendors */}
      {WINNERS.map((wi) => (
        <WinnerPulse key={wi} position={vendorPoints[wi]} />
      ))}

      {/* Hospital nodes — floating */}
      {hospitalPositions.map((p, i) => (
        <Float key={i} speed={1.2 + i * 0.2} rotationIntensity={0} floatIntensity={0.4}>
          <mesh position={p}>
            <sphereGeometry args={[0.13, 18, 18]} />
            <meshStandardMaterial
              color={colors.brandGlow}
              emissive={colors.brand}
              emissiveIntensity={2.2}
              toneMapped={false}
            />
          </mesh>
        </Float>
      ))}

      {/* Curve guide lines — very faint */}
      {curves.map((c, i) => (
        <CurveLine key={i} curve={c} opacity={0.18} />
      ))}

      {/* The 3 main routing particles + their trails */}
      {curves.map((c, i) => (
        <RoutingParticle
          key={i}
          curve={c}
          speed={0.18 + i * 0.04}
          offset={i * 0.33}
          zRef={particleZs[i]}
          color={[colors.brandGlow, '#a48bff', '#5cd4ff'][i]}
        />
      ))}

      {/* User-spawned burst particles from clicks */}
      {burstParticles.map((b) => (
        <RoutingParticle
          key={b.id}
          curve={b.curve}
          speed={0.5}
          offset={0}
          zRef={{ value: 0 }}
          color={b.color}
        />
      ))}

      {/* 4 scoring rings */}
      {RING_Z.map((z, i) => (
        <ScoringRing
          key={i}
          index={i}
          z={z}
          particleZs={particleZs}
          onCross={onRingCross}
          setActiveRing={(r) => onActiveRingChange?.(r)}
        />
      ))}

      {/* Shock waves: one per ring, triggered when a particle crosses */}
      {RING_Z.map((z, i) => (
        <ShockWave key={`sw-${i}`} z={z} trigger={ringTriggers[i]} />
      ))}

      <Camera progress={progress} mouse={mouseRef.current} />
    </Canvas>
  );
};

/** Globe that rotates slowly so the dots on the surface drift. */
const RotatingGlobe: React.FC = () => {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.08;
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.8, 1]} />
        <meshStandardMaterial
          color={colors.bg3}
          emissive={colors.brand}
          emissiveIntensity={0.08}
          wireframe
          transparent
          opacity={0.4}
        />
      </mesh>
    </group>
  );
};

/** Slow-expanding ring around a winning vendor. */
const WinnerPulse: React.FC<{ position: Vector3 }> = ({ position }) => {
  const meshRef = useRef<Mesh>(null);
  // Random phase so the 3 winner pulses don't sync.
  const phase = useMemo(() => Math.random() * 2, []);
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = ((clock.elapsedTime + phase) % 2) / 2; // 0..1 every 2s
    meshRef.current.scale.setScalar(0.6 + t * 1.6);
    const mat = meshRef.current.material as any;
    if (mat) mat.opacity = (1 - t) * 0.5;
    // Always face the camera (billboard).
    meshRef.current.lookAt(0, 0, 8);
  });
  return (
    <mesh ref={meshRef} position={position}>
      <ringGeometry args={[0.12, 0.16, 32]} />
      <meshBasicMaterial color={colors.brandGlow} transparent opacity={0.5} side={2} blending={AdditiveBlending} />
    </mesh>
  );
};

/** Faint guide line along a curve. */
const CurveLine: React.FC<{ curve: CatmullRomCurve3; opacity: number }> = ({ curve, opacity }) => {
  const points = useMemo(() => curve.getPoints(80), [curve]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])), 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial color={colors.brand} transparent opacity={opacity} />
    </line>
  );
};

export default RoutingScene;
