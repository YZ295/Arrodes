/**
 * 阿罗德斯 3D 背景场景
 * 纯星空氛围背景（会话不再以星球呈现，会话管理在左侧栏）
 */
import { Canvas } from '@react-three/fiber';
import Starfield from './Starfield';
import ParticleSystem from './effects/ParticleSystem';
import CameraController from './CameraController';

export default function Universe() {
  return (
    <Canvas
      camera={{
        position: [0, 4, 14],
        fov: 55,
        near: 0.1,
        far: 300,
      }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      }}
      dpr={[1, 2]}
      style={{ background: '#0a0e27' }}
      onCreated={({ gl }) => { gl.setClearColor('#0a0e27'); }}
    >
      {/* 环境光 + 点光源 */}
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 5, 10]} intensity={0.8} />
      <pointLight position={[0, -5, -10]} intensity={0.3} color="#4466ff" />

      {/* 星空背景 */}
      <Starfield />

      {/* 粒子特效 */}
      <ParticleSystem />

      {/* 相机控制 */}
      <CameraController />

      {/* 后期特效：Bloom — 部分GPU驱动会蓝屏，默认关闭；可手动启用 */}
      {/* <Bloom /> */}
    </Canvas>
  );
}
