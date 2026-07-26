/**
 * 阿罗德斯 3D 宇宙场景
 * 使用 React Three Fiber 渲染的沉浸式星系空间
 */
import { Canvas } from '@react-three/fiber';
import Starfield from './Starfield';
import HomePlanet from './HomePlanet';
import SolarSystem from './SolarSystem';
import CameraController from './CameraController';
import ParticleSystem from './effects/ParticleSystem';
import SessionSpawner from './SessionSpawner';

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
      dpr={[1, 1.5]}
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

      {/* 主星球 */}
      <HomePlanet />

      {/* 会话星球轨道系统 */}
      <SolarSystem />

      {/* 语音创建会话事件桥接 */}
      <SessionSpawner />

      {/* 相机控制 */}
      <CameraController />

      {/* 后期特效：Bloom — 临时注释掉排查闪屏 */}
      {/* <EffectComposer>
        <Bloom />
      </EffectComposer> */}
    </Canvas>
  );
}
