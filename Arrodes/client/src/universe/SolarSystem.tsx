/**
 * 太阳系群组
 * 管理所有非主星球的显示与轨道运动
 *
 * ⚠️ 注意：星球初始位置由 SessionSpawner.calcSpawnPosition 计算并存入 zustand store，
 *   此处直接使用 store 中的 position，不再自行重算。
 *   以前版本每次 sessionPlanets.length 变就重算所有轨道 → 所有星球跳位 → 闪烁。
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Planet from './Planet';
import { useUniverseStore } from '../shared/stores/useUniverseStore';
import { eventBus, EVENTS } from '../shared/events/EventBus';

export default function SolarSystem() {
  const groupRef = useRef<THREE.Group>(null);
  const planets = useUniverseStore((s) => s.planets);
  const selectedPlanetId = useUniverseStore((s) => s.selectedPlanetId);
  const selectPlanet = useUniverseStore((s) => s.selectPlanet);
  const setCameraTarget = useUniverseStore((s) => s.setCameraTarget);

  // 过滤主星球，只看会话星球
  const sessionPlanets = planets.filter((p) => !p.isHome);

  // 直接从 store 取存入的位置，不自己算轨道
  // 以前版本每次 planets 变就重算所有轨道 → 所有星球跳位 → 闪烁

  // 微缓旋转整个星群
  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.02;
    }
  });

  const handlePlanetClick = (sessionId: string) => {
    selectPlanet(sessionId);
    setCameraTarget(sessionId);
    eventBus.emit(EVENTS.UNIVERSE_PLANET_CLICK, { sessionId });
  };

  return (
    <group ref={groupRef}>
      {sessionPlanets.map((planet) => {
        // 直接从 store 取存入的位置，不自己算
        const pos = planet.position || { x: 0, y: 0, z: 0 };
        return (
          <Planet
            key={planet.id}
            position={[pos.x, pos.y, pos.z]}
            color={planet.topic}
            size={0.5 + Math.min(planet.messageCount * 0.05, 0.8)}
            isActive={planet.id === selectedPlanetId}
            title={planet.title}
            onClick={() => handlePlanetClick(planet.id)}
          />
        );
      })}
    </group>
  );
}
