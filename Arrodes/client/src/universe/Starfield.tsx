/**
 * 星空背景粒子系统 — 数据生成层
 *
 * 职责：
 *  - 生成星星初始数据（位置、颜色、大小、闪烁相位）
 *  - 创建圆形纹理
 *  - 委托 Star 组件完成渲染和动画
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import Star from './Star';
import type { StarData } from './Star';

const STAR_COUNT = 6000;
const SPREAD = 200;

/** 生成圆形渐变纹理，使点呈现柔和圆形而非默认正方形 */
function createCircleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
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
  // 星星基础数据（只生成一次）
  const stars = useMemo<StarData>(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const siz = new Float32Array(STAR_COUNT);
    const pha = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      const i3 = i * 3;
      const radius = 30 + Math.random() * SPREAD;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      pos[i3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i3 + 2] = radius * Math.cos(phi);

      const tint = Math.random();
      if (tint < 0.6) {
        col[i3] = 1; col[i3 + 1] = 1; col[i3 + 2] = 1;
      } else if (tint < 0.8) {
        col[i3] = 0.8; col[i3 + 1] = 0.85; col[i3 + 2] = 1;
      } else {
        col[i3] = 1; col[i3 + 1] = 0.9; col[i3 + 2] = 0.7;
      }

      siz[i] = 0.3 + Math.random() * 1.2;
      pha[i] = Math.random() * Math.PI * 2;
    }

    return { positions: pos, colors: col, sizes: siz, phases: pha };
  }, []);

  // 圆形纹理（只创建一次）
  const circleTexture = useMemo(() => createCircleTexture(), []);

  return (
    <Star data={stars} count={STAR_COUNT} texture={circleTexture} />
  );
}
