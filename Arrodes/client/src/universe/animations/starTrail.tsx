/**
 * 星空动画 hook
 * 处理星星系统的自转 + 闪烁动画
 * 提取自 Starfield.tsx，作为可复用动画模块
 */
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 星空自转 + 闪烁动画
 * @param ref       - THREE.Points 引用
 * @param sizes     - 每颗星星的基础大小 (Float32Array)
 * @param phases    - 每颗星星的闪烁相位 (Float32Array)
 * @param count     - 星星数量
 * @param rotSpeed  - 自转速度系数 (默认 1.0)
 */
export function useStarAnimation(
  ref: React.RefObject<THREE.Points | null>,
  sizes: Float32Array,
  phases: Float32Array,
  count: number,
  rotSpeed: number = 1.0,
) {
  useFrame((state, delta) => {
    if (!ref.current) return;

    // ---- 缓慢自转 ----
    ref.current.rotation.y += delta * 0.008 * rotSpeed;
    ref.current.rotation.x += delta * 0.003 * rotSpeed;

    // ---- 闪烁（每帧更新 size attribute） ----
    const time = state.clock.elapsedTime;
    const sizeAttr = ref.current.geometry.getAttribute('size') as THREE.BufferAttribute;
    const arr = sizeAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const base = sizes[i];
      const phase = phases[i];
      // 每颗星星独立闪烁频率 (0.3 ~ 1.2 Hz) 和幅度 (30% ~ 70%)
      const freq = 0.3 + (phase / Math.PI) * 0.45;
      const amp = 0.3 + (phase / (Math.PI * 2)) * 0.4;
      arr[i] = base * (1 + Math.sin(time * freq * Math.PI * 2 + phase) * amp);
    }

    sizeAttr.needsUpdate = true;
  });
}
