/**
 * 音波粒子大气层
 *
 * 围绕主星球分布的粒子系统，根据音频电平实时变化：
 * - 录音时：红色粒子随用户音量脉动
 * - TTS 播放时：金色粒子随阿罗德斯输出脉动
 * - 空闲时：微弱呼吸动画
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioLevelStore } from '../../shared/stores/useAudioLevelStore';

const PARTICLE_COUNT = 800;
const PLANET_RADIUS = 3.2;

export default function AudioParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);

  // 预计算粒子位置 + 创建几何体
  const { geometry, basePositions, velocities } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const basePositions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLE_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const r = PLANET_RADIUS + Math.random() * 0.3;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      basePositions[i * 3] = x;
      basePositions[i * 3 + 1] = y;
      basePositions[i * 3 + 2] = z;
      velocities[i] = Math.random() * 0.5 + 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return { geometry: geo, basePositions, velocities };
  }, []);

  const colorGold = useMemo(() => new THREE.Color('#FFD700'), []);
  const colorRed = useMemo(() => new THREE.Color('#ff4444'), []);

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) return;

    const t = state.clock.elapsedTime;
    const store = useAudioLevelStore.getState();
    const level = store.getActiveLevel();
    const normalizedLevel = level / 255;

    // 颜色 + 尺寸
    if (materialRef.current) {
      const targetColor = store.mode === 'recording' ? colorRed : colorGold;
      materialRef.current.color.lerp(targetColor, 0.05);
      const targetSize = 0.03 + normalizedLevel * 0.12;
      materialRef.current.size = THREE.MathUtils.lerp(materialRef.current.size, targetSize, 0.1);
      materialRef.current.opacity = 0.4 + normalizedLevel * 0.5;
    }

    // 粒子位置脉动
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const bx = basePositions[i3];
      const by = basePositions[i3 + 1];
      const bz = basePositions[i3 + 2];

      const len = Math.sqrt(bx * bx + by * by + bz * bz);
      const dx = bx / len;
      const dy = by / len;
      const dz = bz / len;

      const wave = Math.sin(t * 2 + i * 0.1) * 0.05;
      const pulse = normalizedLevel * 0.8 * velocities[i] + wave;

      arr[i3] = bx + dx * pulse;
      arr[i3 + 1] = by + dy * pulse;
      arr[i3 + 2] = bz + dz * pulse;
    }

    posAttr.needsUpdate = true;
    points.rotation.y += 0.001;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        ref={materialRef}
        size={0.04}
        color="#FFD700"
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
