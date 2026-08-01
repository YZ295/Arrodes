/**
 * 星球生成动画特效
 * 新会话星球诞生时的光束 + 粒子凝聚 + 冲击波效果
 *
 * 触发条件：通过 EventBus 监听 UNIVERSE_PLANET_SPAWNED 事件
 * 流程：光束从天而降 → 冲击波扩散 → 粒子凝聚 → 星球浮现
 */
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { useUniverseStore } from '../../shared/stores/useUniverseStore';

/* ============================================================
 * 光柱 (Beam)
 * 从天而降的光束，在星球生成位置形成光柱
 * ============================================================ */
function SpawnBeam({
  position,
  progress,
}: {
  position: [number, number, number];
  progress: number; // 0 ~ 1
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    // 光柱高度随进度变化：从天而降
    const height = (1 - progress) * 8;
    const opacity = progress < 0.15
      ? progress / 0.15
      : progress > 0.65
        ? 1 - (progress - 0.65) / 0.35
        : 1;

    meshRef.current.scale.y = height;
    meshRef.current.position.y = position[1] + height / 2;
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity * 0.6;
  });

  return (
    <mesh ref={meshRef} position={[position[0], position[1], position[2]]}>
      <cylinderGeometry args={[0.04, 0.12, 1, 8]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ============================================================
 * 冲击波 (Shockwave)
 * 星球诞生时向外扩散的环形波纹
 * ============================================================ */
function Shockwave({
  position,
  progress,
}: {
  position: [number, number, number];
  progress: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // progress 0.2 ~ 0.5 阶段触发冲击波
  const waveProgress = Math.max(0, Math.min(1, (progress - 0.2) / 0.3));
  const radius = 0.5 + waveProgress * 3;
  const opacity = waveProgress < 0.5
    ? waveProgress / 0.5 * 0.5
    : (1 - waveProgress) / 0.5 * 0.5;

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.scale.setScalar(radius / 0.5);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  if (waveProgress <= 0 || waveProgress >= 1) return null;

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.5, 0.6, 48]} />
      <meshBasicMaterial
        color="#88ccff"
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/* ============================================================
 * 粒子凝聚 (ParticleAccretion)
 * 从四周向中心汇聚的粒子
 * ============================================================ */
function ParticleAccretion({
  position,
  progress,
  color,
}: {
  position: [number, number, number];
  progress: number;
  color: string;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const particleCount = useRef(40);
  const initialPositions = useRef<Float32Array | null>(null);

  // 初始化粒子位置：分布在球体表面
  useEffect(() => {
    const positions = new Float32Array(particleCount.current * 3);
    for (let i = 0; i < particleCount.current; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.5 + Math.random() * 2.5;
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
      positions[i * 3 + 2] = Math.cos(phi) * Math.cos(theta) * r;
    }
    initialPositions.current = positions;
  }, []);

  useFrame(() => {
    if (!pointsRef.current || !initialPositions.current) return;

    // progress 0 ~ 0.4: 粒子静止
    // progress 0.4 ~ 0.8: 粒子向中心凝聚
    // progress > 0.8: 粒子消散
    const accreteProgress = Math.max(0, Math.min(1, (progress - 0.3) / 0.5));
    const dissipate = Math.max(0, Math.min(1, (progress - 0.8) / 0.2));

    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount.current; i++) {
      const i3 = i * 3;
      const origX = initialPositions.current[i3];
      const origY = initialPositions.current[i3 + 1];
      const origZ = initialPositions.current[i3 + 2];

      if (dissipate > 0) {
        // 消散：向外扩散
        const d = 1 + dissipate * 3;
        positions[i3] = origX * (1 - accreteProgress) * d;
        positions[i3 + 1] = origY * (1 - accreteProgress) * d;
        positions[i3 + 2] = origZ * (1 - accreteProgress) * d;
      } else {
        // 凝聚：向中心收缩
        positions[i3] = origX * (1 - accreteProgress);
        positions[i3 + 1] = origY * (1 - accreteProgress);
        positions[i3 + 2] = origZ * (1 - accreteProgress);
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // 粒子透明度变化
    const ptOpacity = dissipate > 0
      ? 1 - dissipate
      : progress < 0.3 ? progress / 0.3 : 1;
    (pointsRef.current.material as THREE.PointsMaterial).opacity = ptOpacity * 0.8;
  });

  const colorObj = new THREE.Color(color);

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[initialPositions.current || new Float32Array(particleCount.current * 3), 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color={colorObj}
        transparent
        opacity={0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ============================================================
 * SpawnAnimation — 主组件
 * ============================================================ */
interface SpawnAnimationState {
  active: boolean;
  position: [number, number, number];
  color: string;
  title: string;
  progress: number; // 0 ~ 1
}

export default function SpawnAnimation() {
  const animRef = useRef<SpawnAnimationState>({
    active: false,
    position: [0, 0, 0],
    color: '#6B7280',
    title: '',
    progress: 0,
  });

  // 监听星球真正写入宇宙后的事件，确保动画位置与实际星球一致。
  useEffect(() => {
    const unsubscribe = eventBus.on(EVENTS.UNIVERSE_PLANET_SPAWNED, (data: unknown) => {
      const { sessionId, position } = (data as {
        sessionId?: string;
        position?: { x: number; y: number; z: number };
      }) || {};
      if (!sessionId || !position) return;

      const planet = useUniverseStore.getState().planets.find((p) => p.id === sessionId);

      // 从主题获取颜色
      const colorMap: Record<string, string> = {
        work: '#3B82F6',
        life: '#10B981',
        creative: '#8B5CF6',
        emotion: '#EF4444',
        study: '#F59E0B',
        other: '#6B7280',
      };

      animRef.current = {
        active: true,
        position: [position.x, position.y, position.z],
        color: colorMap[planet?.topic || 'other'] || '#6B7280',
        title: planet?.title || '新会话',
        progress: 0,
      };
    });

    return unsubscribe;
  }, []);

  // 动画循环
  useFrame((_state, delta) => {
    if (!animRef.current.active) return;

    animRef.current.progress = Math.min(1, animRef.current.progress + delta / 1.5);

    // 动画结束后重置
    if (animRef.current.progress >= 1) {
      animRef.current.active = false;
      animRef.current.progress = 0;
    }
  });

  const anim = animRef.current;
  if (!anim.active) return null;

  return (
    <group>
      <SpawnBeam position={anim.position} progress={anim.progress} />
      <Shockwave position={anim.position} progress={anim.progress} />
      <ParticleAccretion position={anim.position} progress={anim.progress} color={anim.color} />
    </group>
  );
}
