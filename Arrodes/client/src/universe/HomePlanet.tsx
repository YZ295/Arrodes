/**
 * 阿罗德斯主星球
 * 金色核心，带有光晕和 pulsating 效果
 * 高分段 SphereGeometry + 金属质感 + 多层光晕 + 交叉光环
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function HomePlanet() {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const outerGlowRef = useRef<THREE.Mesh>(null);
  const ringHRef = useRef<THREE.Mesh>(null);
  const ringVRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // 主星球自转 + 微摆
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003;
      meshRef.current.rotation.x = Math.sin(t * 0.1) * 0.05;
    }

    // 脉动
    const pulse = 1 + Math.sin(t * 2) * 0.05;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(pulse);
    }
    if (innerGlowRef.current) {
      const opacity = 0.3 + Math.sin(t * 2) * 0.2;
      (innerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
    }

    // 光环旋转
    if (ringHRef.current) {
      ringHRef.current.rotation.z += 0.005;
    }
    if (ringVRef.current) {
      ringVRef.current.rotation.x += 0.003;
    }
  });

  return (
    <group>
      {/* 主星球 - 高分段 + 金属质感 */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[3, 64, 64]} />
        <meshStandardMaterial
          color="#FFD700"
          metalness={0.8}
          roughness={0.2}
          emissive="#FFD700"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* 内层光晕 */}
      <mesh ref={innerGlowRef} scale={1.2}>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial
          color="#FFD700"
          transparent
          opacity={0.3}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 外层光晕（更大更淡） */}
      <mesh ref={outerGlowRef} scale={1.5}>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial
          color="#FFD700"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 水平环 */}
      <mesh ref={ringHRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.5, 0.05, 16, 100]} />
        <meshBasicMaterial color="#FFD700" transparent opacity={0.4} />
      </mesh>

      {/* 垂直环（交叉） */}
      <mesh ref={ringVRef} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[4.5, 0.03, 16, 100]} />
        <meshBasicMaterial color="#FFD700" transparent opacity={0.2} />
      </mesh>
    </group>
  );
}
