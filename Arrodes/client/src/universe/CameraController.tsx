/**
 * 相机控制器
 * 使用 OrbitControls 允许用户自由旋转/缩放
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useUniverseStore } from '../shared/stores/useUniverseStore';

export default function CameraController() {
  const cameraTargetId = useUniverseStore((s) => s.cameraTargetId);
  const planets = useUniverseStore((s) => s.planets);
  const setCameraTarget = useUniverseStore((s) => s.setCameraTarget);

  const { camera } = useThree();

  useEffect(() => {
    if (cameraTargetId) {
      const target = planets.find((p) => p.id === cameraTargetId);
      if (target?.position) {
        camera.position.lerp(
          new THREE.Vector3(
            target.position.x + 5,
            target.position.y + 3,
            target.position.z + 5
          ),
          0.05
        );
        const timer = setTimeout(() => setCameraTarget(null), 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [cameraTargetId, planets, camera, setCameraTarget]);

  return (
    <OrbitControls
      enableDamping
      dampingFactor={0.08}
      minDistance={4}
      maxDistance={60}
      autoRotate={false}
      enablePan={false}
    />
  );
}
