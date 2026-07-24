/**
 * Bloom 后期特效
 * 使用 @react-three/postprocessing 的 Bloom 通道
 */
import { Bloom as PostBloom } from '@react-three/postprocessing';

export default function Bloom() {
  return (
    <PostBloom
      intensity={0.3}
      luminanceThreshold={0.2}
      luminanceSmoothing={0.025}
      mipmapBlur
    />
  );
}
