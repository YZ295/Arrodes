/**
 * 太阳系群组
 * 管理所有非主星球的轨道运动
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Planet from './Planet';
import { useUniverseStore } from '../shared/stores/useUniverseStore';
import { eventBus, EVENTS } from '../shared/events/EventBus';

// 轨道半径常量
const ORBIT_R = 8;
const ORBIT_STEP = 3.5;

export default function SolarSystem() {
  const groupRef = useRef<THREE.Group>(null);
  const planets = useUniverseStore((s) => s.planets);
  const selectedPlanetId = useUniverseStore((s) => s.selectedPlanetId);
  const selectPlanet = useUniverseStore((s) => s.selectPlanet);
  const setCameraTarget = useUniverseStore((s) => s.setCameraTarget);

  // 为非主星球计算轨道位置
  const sessionPlanets = useMemo(() => {
    return planets.filter((p) => !p.isHome);
  }, [planets]);

  // 轨道位置
  const orbits = useMemo(() => {
    return sessionPlanets.map((p, i) => {
      const angle = (i / sessionPlanets.length) * Math.PI * 2;
      const radius = ORBIT_R + (i % 3) * ORBIT_STEP;
      return {
        id: p.id,
        angle,
        radius,
        speed: 0.1 + Math.random() * 0.15,
        offsetY: (i % 5 - 2) * 2,
      };
    });
  }, [sessionPlanets.length]);

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
      {sessionPlanets.map((planet, i) => {
        const orbit = orbits[i];
        if (!orbit) return null;

        const x = Math.cos(orbit.angle) * orbit.radius;
        const z = Math.sin(orbit.angle) * orbit.radius;
        const y = orbit.offsetY;

        return (
          <Planet
            key={planet.id}
            position={[x, y, z]}
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
