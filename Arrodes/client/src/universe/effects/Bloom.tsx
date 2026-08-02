/**
 * Bloom 后期特效
 * 使用 @react-three/postprocessing 的 Bloom 通道
 *
 * 修复历史：
 * - v1: EffectComposer 每次渲染重建 → 闪屏
 * - v2: useMemo 稳定引用 + 降低强度 + lazyload → 不再闪屏
 */
import { Bloom as PostBloom, EffectComposer } from '@react-three/postprocessing';
import { useMemo } from 'react';

export default function Bloom() {
  // useMemo 保证 EffectComposer 和 Bloom 只在挂载时创建一次
  const effects = useMemo(
    () => (
      <EffectComposer multisampling={0}>
        <PostBloom
          intensity={0.25}
          luminanceThreshold={0.3}
          luminanceSmoothing={0.05}
          mipmapBlur
        />
      </EffectComposer>
    ),
    [],
  );

  return <>{effects}</>;
}
