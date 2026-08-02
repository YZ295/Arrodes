/**
 * 相机控制器
 * 使用 OrbitControls + useFrame 逐帧平滑飞行
 */
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useUniverseStore } from '../shared/stores/useUniverseStore';

export default function CameraController() {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const cameraTargetId = useUniverseStore((s) => s.cameraTargetId);
  const planets = useUniverseStore((s) => s.planets);
  const setCameraTarget = useUniverseStore((s) => s.setCameraTarget);

  const flyRef = useRef<{
    active: boolean;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    progress: number;
  } | null>(null);

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!cameraTargetId || inFlightRef.current) return;

    const target = planets.find((p) => p.id === cameraTargetId);
    if (!target?.position) return;

    inFlightRef.current = true;
    const ctrl = controlsRef.current;
    flyRef.current = {
      active: true,
      fromPos: camera.position.clone(),
      fromTarget: ctrl ? ctrl.target.clone() : new THREE.Vector3(0, 0, 0),
      toPos: new THREE.Vector3(
        target.position.x + 5,
        target.position.y + 3,
        target.position.z + 5
      ),
      toTarget: new THREE.Vector3(
        target.position.x,
        target.position.y,
        target.position.z
      ),
      progress: 0,
    };
  }, [cameraTargetId, planets, camera]);

  useFrame((_, delta) => {
    const fly = flyRef.current;
    if (!fly || !fly.active) return;

    fly.progress += delta * 1.5;
    const p = Math.min(fly.progress, 1);

    const t = p < 0.5
      ? 4 * p * p * p
      : 1 - Math.pow(-2 * p + 2, 3) / 2;

    camera.position.lerpVectors(fly.fromPos, fly.toPos, t);
    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(fly.fromTarget, fly.toTarget, t);
      controlsRef.current.update();
    }

    if (p >= 1) {
      fly.active = false;
      inFlightRef.current = false;
      // 退出 useFrame 后再释放 cameraTargetId，避免渲染中更新状态
      setTimeout(() => {
        setCameraTarget(null);
      }, 0);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={60}
      autoRotate={false}
      enablePan={false}
    />
  );
}
