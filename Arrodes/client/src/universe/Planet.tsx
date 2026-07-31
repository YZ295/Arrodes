/**
 * 会话星球
 * 根据主题显示不同颜色，包含大气层辉光、轨道环和动画交互
 */
import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { SessionTopic } from '@shared/types';
import { TOPIC_COLOR_HEX } from '@shared/types';

interface PlanetProps {
  position: [number, number, number];
  color?: SessionTopic;
  size?: number;
  isActive?: boolean;
  title?: string;
  onClick?: () => void;
}

// memo 防止新增星球时老星球全部重渲染
// 自定义比较：只关心实际值是否变，不关心引用地址
function Planet({
  position,
  color = 'other',
  size = 0.6,
  isActive = false,
  title,
  onClick,
}: PlanetProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);

  const hexColor = TOPIC_COLOR_HEX[color] ?? 0x6b7280;
  const colorObj = useMemo(() => new THREE.Color(hexColor), []);

  // 跟踪悬停状态
  const hoverRef = useRef(false);
  const currentScale = useRef(1);
  // 入场生长动画
  const spawnProgress = useRef(0);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;

    // ---- 入场生长动画 ----
    if (spawnProgress.current < 1) {
      spawnProgress.current = Math.min(1, spawnProgress.current + delta / 0.8);
    }
    const spawn = spawnProgress.current;
    // easeOutBack 让生长更有生命力
    const spawnScale = spawn < 1
      ? 1.7 * spawn * spawn * spawn - 2.1 * spawn * spawn + 1.2 * spawn
      : 1;

    // ---- 浮沉呼吸动画 ----
    if (groupRef.current) {
      groupRef.current.position.y =
        position[1] + Math.sin(elapsed * 0.7 + position[0] * 0.5) * 0.06;
    }

    // ---- 自转 + 轴向微摆 ----
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.008;
      meshRef.current.rotation.x = Math.sin(elapsed * 0.25) * 0.08;
    }

    // ---- 缩放过渡 ----
    const baseScale = spawn < 1 ? spawnScale : 1;
    const targetScale = baseScale * (hoverRef.current || isActive ? 1.15 : 1);
    currentScale.current += (targetScale - currentScale.current) * 0.08;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(currentScale.current);
    }

    // ---- 激活光环 ----
    if (isActive) {
      if (ringRef.current) {
        ringRef.current.rotation.z = elapsed * 0.6;
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity =
          0.35 + 0.15 * Math.sin(elapsed * 2.5);
      }
      if (ring2Ref.current) {
        ring2Ref.current.rotation.z = -elapsed * 0.4 + 0.5;
        (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity =
          0.15 + 0.1 * Math.sin(elapsed * 2.0 + 1.0);
      }
    }

    // ---- 光晕呼吸 ----
    if (glowRef.current) {
      const pulse = 0.88 + 0.12 * Math.sin(elapsed * 1.2 + position[0]);
      glowRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* ===== 星球主体 ===== */}
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => {
          hoverRef.current = true;
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          hoverRef.current = false;
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhysicalMaterial
          color={hexColor}
          emissive={hexColor}
          emissiveIntensity={isActive ? 0.35 : 0.06}
          metalness={0.15}
          roughness={0.55}
          clearcoat={0.25}
          clearcoatRoughness={0.4}
        />
      </mesh>

      {/* ===== 大气层辉光（标准材质替换自定义着色器，避免GPU驱动崩溃） ===== */}
      <mesh>
        <sphereGeometry args={[size * 1.2, 16, 16]} />
        <meshPhysicalMaterial
          color={hexColor}
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          envMapIntensity={0.4}
          roughness={0.2}
          metalness={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* ===== 外层柔和光晕 ===== */}
      <sprite ref={glowRef} scale={[size * 3.5, size * 3.5, 1]}>
        <spriteMaterial
          color={hexColor}
          transparent
          opacity={(isActive ? 0.12 : 0.05) * spawnProgress.current}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* ===== 激活状态光环 ===== */}
      {isActive && (
        <>
          {/* 主光环 */}
          <mesh ref={ringRef} rotation={[Math.PI / 2.8, 0.2, 0]}>
            <ringGeometry args={[size * 1.5, size * 1.85, 48]} />
            <meshBasicMaterial
              color={hexColor}
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* 副光环（倾斜） */}
          <mesh ref={ring2Ref} rotation={[Math.PI / 4, 0.8, Math.PI / 5]}>
            <ringGeometry args={[size * 1.6, size * 1.95, 48]} />
            <meshBasicMaterial
              color={hexColor}
              transparent
              opacity={0.15}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

      {/* ===== 轨道指示圈 ===== */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 2.6, size * 2.62, 64]} />
        <meshBasicMaterial
          color={hexColor}
          transparent
          opacity={(isActive ? 0.15 : 0.04) * spawnProgress.current}
          depthWrite={false}
        />
      </mesh>

      {/* ===== 标签 ===== */}
      {title && (
        <Text
          position={[0, -size * 1.8, 0]}
          fontSize={size * 0.45}
          color={hexColor}
          anchorX="center"
          anchorY="top"
          outlineWidth={0.02}
          outlineColor="#000000"
          fillOpacity={0.9 * spawnProgress.current}
          maxWidth={size * 6}
        >
          {title}
        </Text>
      )}
    </group>
  );
}


const PlanetMemo = memo(Planet, (prev, next) =>
  prev.position[0] === next.position[0] &&
  prev.position[1] === next.position[1] &&
  prev.position[2] === next.position[2] &&
  prev.color === next.color &&
  prev.size === next.size &&
  prev.isActive === next.isActive &&
  prev.title === next.title &&
  prev.onClick === next.onClick
);

export default PlanetMemo;
