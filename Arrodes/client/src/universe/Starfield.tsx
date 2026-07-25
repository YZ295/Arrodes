/**
 * 星空背景粒子系统
 * 随机分布的数万颗星星，缓慢自转，带闪烁效果
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const STAR_COUNT = 6000;
const SPREAD = 200;

/** 生成圆形渐变纹理，使点呈现柔和圆形而非默认正方形 */
function createCircleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 径向渐变：中心不透明，边缘透明
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export default function Starfield() {
  const ref = useRef<THREE.Points>(null);

  // 每颗星星的基础大小和闪烁相位
  const { positions, colors, sizes, phases } = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const siz = new Float32Array(STAR_COUNT);
    const pha = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3;
      // 球形分布
      const radius = 30 + Math.random() * SPREAD;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = radius * Math.cos(phi);

      // 颜色：白、淡蓝、淡黄
      const tint = Math.random();
      if (tint < 0.6) {
        col[i3] = 1; col[i3 + 1] = 1; col[i3 + 2] = 1;
      } else if (tint < 0.8) {
        col[i3] = 0.8; col[i3 + 1] = 0.85; col[i3 + 2] = 1;
      } else {
        col[i3] = 1; col[i3 + 1] = 0.9; col[i3 + 2] = 0.7;
      }

      siz[i] = 0.3 + Math.random() * 1.2;
      pha[i] = Math.random() * Math.PI * 2; // 随机闪烁相位
    }
    return { positions: pos, colors: col, sizes: siz, phases: pha };
  }, []);

  // 圆形纹理（只创建一次）
  const circleTexture = useMemo(() => createCircleTexture(), []);

  // 星星缓慢自转 + 闪烁
  useFrame((_state, delta) => {
    if (!ref.current) return;

    ref.current.rotation.y += delta * 0.008;
    ref.current.rotation.x += delta * 0.003;

    // 闪烁：根据相位和时间调制每颗星星大小
    const time = _state.clock.elapsedTime;
    const sizeAttr = ref.current.geometry.getAttribute('size') as THREE.BufferAttribute;
    const arr = sizeAttr.array as Float32Array;
    for (let i = 0; i < STAR_COUNT; i++) {
      const base = sizes[i];
      const phase = phases[i];
      // 每颗星星独立闪烁频率 (0.3 ~ 1.2 Hz) 和幅度 (30% ~ 70%)
      const freq = 0.3 + (phase / Math.PI) * 0.45;
      const amp = 0.3 + (phase / (Math.PI * 2)) * 0.4;
      arr[i] = base * (1 + Math.sin(time * freq * Math.PI * 2 + phase) * amp);
    }
    sizeAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
        <bufferAttribute
          attach="attributes-size"
          args={[sizes, 1]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.5}
        map={circleTexture}
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
