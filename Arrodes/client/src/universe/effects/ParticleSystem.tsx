/**
 * 粒子特效系统
 * 用于星球生成/选中/交互时的视觉反馈
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  size: number;
}

const MAX_PARTICLES = 200;

export default function ParticleSystem() {
  const pointsRef = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      arr.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.02,
          Math.random() * 0.03 + 0.01,
          (Math.random() - 0.5) * 0.02
        ),
        life: Math.random(),
        maxLife: 2 + Math.random() * 3,
        color: new THREE.Color().setHSL(0.1 + Math.random() * 0.2, 0.8, 0.6),
        size: 0.05 + Math.random() * 0.15,
      });
    }
    return arr;
  }, []);

  const positionAttr = useMemo(() => new Float32Array(MAX_PARTICLES * 3), []);
  const colorAttr = useMemo(() => new Float32Array(MAX_PARTICLES * 3), []);
  const sizeAttr = useMemo(() => new Float32Array(MAX_PARTICLES), []);

  useFrame((_state, delta) => {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      p.life += delta / p.maxLife;
      if (p.life > 1) {
        // 重置粒子
        p.position.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        );
        p.velocity.set(
          (Math.random() - 0.5) * 0.02,
          Math.random() * 0.03 + 0.01,
          (Math.random() - 0.5) * 0.02
        );
        p.life = 0;
      }

      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      p.position.z += p.velocity.z;

      const i3 = i * 3;
      positionAttr[i3] = p.position.x;
      positionAttr[i3 + 1] = p.position.y;
      positionAttr[i3 + 2] = p.position.z;

      colorAttr[i3] = p.color.r;
      colorAttr[i3 + 1] = p.color.g;
      colorAttr[i3 + 2] = p.color.b;

      sizeAttr[i] = p.size * (1 - p.life);
    }

    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positionAttr, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colorAttr, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizeAttr, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
