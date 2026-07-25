/**
 * 星空粒子渲染组件
 * 接收预先计算的 star 数据，渲染为单次 draw call 的 THREE.Points
 * 动画交由 useStarAnimation 驱动
 */
import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useStarAnimation } from './animations/starTrail';

export interface StarData {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  phases: Float32Array;
}

interface StarProps {
  data: StarData;
  count: number;
  texture: THREE.Texture;
  rotSpeed?: number;
}

/**
 * 星空组件
 * forwardRef 暴露 Points 实例以便外部操控
 */
const Star = forwardRef<THREE.Points, StarProps>(function Star(
  { data, count, texture, rotSpeed = 1.0 },
  ref,
) {
  const pointsRef = useRef<THREE.Points>(null);

  // 暴露 points ref 给父组件
  useImperativeHandle(ref, () => pointsRef.current!);

  // 挂载动画 hook
  useStarAnimation(pointsRef, data.sizes, data.phases, count, rotSpeed);

  // 创建 geometry 和 material（仅首次）
  const [geometry, material] = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(data.sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: texture,
      sizeAttenuation: true,
    });

    return [geom, mat];
  }, []); // 仅初始化一次

  // 当 stars data 变化时更新 geometry attributes
  // 但本设计中 data 由 parent 用 useMemo 保持稳定引用
  return <points ref={pointsRef} geometry={geometry} material={material} />;
});

export default Star;
