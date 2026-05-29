import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float, Html } from '@react-three/drei';
import * as THREE from 'three';

const RING_LABELS = ['GEO', 'CONTRACT', 'CAPABILITY', 'STOCK'];
const RING_COLORS = ['#1BAEE5', '#7B5CF0', '#00C896', '#FF6B35'];

function RoutingParticle({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const ref = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.18) % 1;
    const pt = curve.getPoint(t.current);
    if (ref.current) ref.current.position.copy(pt);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshBasicMaterial color="#1BAEE5" />
    </mesh>
  );
}

function Scene() {
  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3, 0.5, 0),
      new THREE.Vector3(-1.5, 1.2, 0.5),
      new THREE.Vector3(0, 0.8, 0.8),
      new THREE.Vector3(1.5, 1.0, 0.3),
      new THREE.Vector3(2.5, 0, 0),
    ]);
  }, []);

  const nodes = useMemo(() => {
    return Array.from({ length: 16 }, (_, i) => {
      const phi = Math.acos(-1 + (2 * i) / 16);
      const theta = Math.sqrt(16 * Math.PI) * phi;
      return new THREE.Vector3(
        2.2 * Math.cos(theta) * Math.sin(phi),
        2.2 * Math.sin(theta) * Math.sin(phi),
        2.2 * Math.cos(phi),
      );
    });
  }, []);

  return (
    <>
      <Stars radius={30} depth={30} count={800} factor={2} fade />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 3, 3]} intensity={1.5} color="#1BAEE5" />

      {/* Globe wireframe */}
      <mesh>
        <icosahedronGeometry args={[2, 1]} />
        <meshBasicMaterial color="#1BAEE5" wireframe opacity={0.06} transparent />
      </mesh>

      {/* Vendor nodes */}
      {nodes.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshBasicMaterial color="rgba(27,174,229,0.5)" />
        </mesh>
      ))}

      {/* Hospital node */}
      <Float speed={1.5} rotationIntensity={0} floatIntensity={0.4}>
        <mesh position={[-3, 0.5, 0]}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial color="#1BAEE5" emissive="#1BAEE5" emissiveIntensity={0.6} />
        </mesh>
        <Html position={[-3, 0.8, 0]} center>
          <div style={{ color: '#1BAEE5', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Hospital</div>
        </Html>
      </Float>

      {/* Winning vendor node */}
      <Float speed={2} rotationIntensity={0} floatIntensity={0.3}>
        <mesh position={[2.5, 0, 0]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial color="#00C896" emissive="#00C896" emissiveIntensity={0.7} />
        </mesh>
        <Html position={[2.5, 0.45, 0]} center>
          <div style={{ color: '#00C896', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>Best Match</div>
        </Html>
      </Float>

      {/* Scoring rings */}
      {RING_LABELS.map((label, i) => {
        const angle = (i / RING_LABELS.length) * Math.PI * 2;
        const x = Math.cos(angle) * 1.2;
        const y = Math.sin(angle) * 0.6;
        return (
          <group key={label} position={[x, y, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.35, 0.02, 8, 32]} />
              <meshBasicMaterial color={RING_COLORS[i]} opacity={0.6} transparent />
            </mesh>
            <Html center position={[0, 0.55, 0]}>
              <div style={{ color: RING_COLORS[i], fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
            </Html>
          </group>
        );
      })}

      {/* Routing particle */}
      <RoutingParticle curve={curve} />
    </>
  );
}

const RoutingScene: React.FC = () => (
  <Canvas camera={{ position: [0, 0.5, 7], fov: 48 }} dpr={[1, 2]}>
    <Scene />
  </Canvas>
);

export default RoutingScene;
