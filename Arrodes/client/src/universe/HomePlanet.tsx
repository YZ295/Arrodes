/**
 * 阿罗德斯主星球 v2 — 神秘 + 赛博朋克
 *
 * 视觉层次（从内到外）：
 * 1. 暗核 — 深黑色金属球体，微微发红光
 * 2. 线框层 — 青色 wireframe 叠加，全息扫描感
 * 3. 大气光晕 — 多层径向渐变，金色→青色
 * 4. 全息环 — 旋转的霓虹环，带扫描线
 * 5. 音波粒子 — 实时音频反馈（已独立组件）
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import AudioParticles from './effects/AudioParticles';

export default function HomePlanet() {
  const coreRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const outerGlowRef = useRef<THREE.Mesh>(null);
  const ringHRef = useRef<THREE.Mesh>(null);
  const ringVRef = useRef<THREE.Mesh>(null);
  const scanRef = useRef<THREE.Mesh>(null);

  // 程序生成电路纹理
  const circuitTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    // 深色底
    ctx.fillStyle = '#0a0a15';
    ctx.fillRect(0, 0, 256, 256);
    // 电路线条
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      const x1 = Math.random() * 256;
      const y1 = Math.random() * 256;
      ctx.moveTo(x1, y1);
      let x = x1, y = y1;
      for (let j = 0; j < 4; j++) {
        const step = 20 + Math.random() * 40;
        if (Math.random() > 0.5) x += (Math.random() > 0.5 ? step : -step);
        else y += (Math.random() > 0.5 ? step : -step);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 发光节点
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 255, 200, 0.4)';
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // 核心自转 + 微摆
    if (coreRef.current) {
      coreRef.current.rotation.y += 0.002;
      coreRef.current.rotation.x = Math.sin(t * 0.08) * 0.03;
      const pulse = 1 + Math.sin(t * 1.5) * 0.02;
      coreRef.current.scale.setScalar(pulse);
    }

    // 线框层反向旋转
    if (wireRef.current) {
      wireRef.current.rotation.y -= 0.004;
      wireRef.current.rotation.z += 0.001;
      const m = wireRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.15 + Math.sin(t * 2) * 0.05;
    }

    // 内层光晕脉动
    if (innerGlowRef.current) {
      const mat = innerGlowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + Math.sin(t * 2) * 0.08;
    }

    // 全息环旋转
    if (ringHRef.current) {
      ringHRef.current.rotation.z += 0.008;
    }
    if (ringVRef.current) {
      ringVRef.current.rotation.x += 0.005;
    }

    // 扫描线（上下移动）
    if (scanRef.current) {
      scanRef.current.position.y = Math.sin(t * 0.8) * 2.5;
      const m = scanRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.05 + Math.abs(Math.sin(t * 0.8)) * 0.1;
    }
  });

  return (
    <group>
      {/* 1. 暗核 — 深黑金属球体 */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[3, 64, 64]} />
        <meshStandardMaterial
          color="#0d1117"
          metalness={0.9}
          roughness={0.35}
          emissive="#1a0a2e"
          emissiveIntensity={0.4}
          map={circuitTexture}
          emissiveMap={circuitTexture}
        />
      </mesh>

      {/* 2. 线框层 — 青色 wireframe 全息叠加 */}
      <mesh ref={wireRef} scale={1.02}>
        <sphereGeometry args={[3, 24, 16]} />
        <meshBasicMaterial
          color="#00ffc8"
          wireframe
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3a. 内层光晕 — 暗金→暗青 */}
      <mesh ref={innerGlowRef} scale={1.15}>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial
          color="#ffaa00"
          transparent
          opacity={0.15}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3b. 外层光晕 — 更大更淡 */}
      <mesh ref={outerGlowRef} scale={1.4}>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial
          color="#00ffc8"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 4a. 全息水平环 */}
      <mesh ref={ringHRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.8, 0.02, 8, 120]} />
        <meshBasicMaterial color="#00ffc8" transparent opacity={0.3} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 4b. 全息垂直环 */}
      <mesh ref={ringVRef} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[4.8, 0.015, 8, 120]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 5. 扫描线 — 水平面上下移动 */}
      <mesh ref={scanRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0, 4.5, 64]} />
        <meshBasicMaterial
          color="#00ffc8"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 6. 音波粒子大气层 */}
      <AudioParticles />
    </group>
  );
}
