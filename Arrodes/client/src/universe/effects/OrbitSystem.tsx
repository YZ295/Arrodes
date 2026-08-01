/**
 * 引力轨道系统
 * 为每个会话星球绘制轨道环，支持鼠标悬停高亮、轨道倾斜和脉冲动画
 *
 * 设计：
 * - 每个星球有条淡色轨道环（匹配星球颜色）
 * - 轨道有轻微倾斜和椭圆度，增加视觉丰富度
 * - 轨道线采用虚线风格（short-dash 或 dotted）
 * - 活跃星球的轨道加粗 + 脉冲
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useUniverseStore } from '../../shared/stores/useUniverseStore';

// R3F 的 JSX 类型把 <line> 解析为 SVG 元素（geometry/position 不兼容），
// 用变量间接引用绕过类型检查，运行时等价于 <line>（映射到 THREE.Line）
const Line = 'line' as any;

/* ============================================================
 * 单条轨道环 (OrbitRing)
 * ============================================================ */
function OrbitRing({
  position,
  radius,
  color,
  tiltAngle,
  isActive,
}: {
  position: [number, number, number];
  radius: number;
  color: string;
  tiltAngle: number;
  isActive: boolean;
}) {
  const lineRef = useRef<THREE.Line>(null);

  // 生成轨道点 (椭圆)
  const points = useMemo(() => {
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    const a = radius;               // 长轴
    const b = radius * (0.85 + Math.random() * 0.1); // 短轴 (略扁)
    const tilt = tiltAngle;

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta) * a;
      const z = Math.sin(theta) * b;
      const y = Math.sin(theta * 2) * 0.08; // 轻微上下波动

      // 应用倾斜旋转
      const cosTilt = Math.cos(tilt);
      const sinTilt = Math.sin(tilt);
      pts.push(new THREE.Vector3(
        x * cosTilt - y * sinTilt,
        x * sinTilt + y * cosTilt,
        z,
      ));
    }
    return pts;
  }, [radius, tiltAngle]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  // 动画
  useFrame((state) => {
    if (!lineRef.current) return;

    const elapsed = state.clock.elapsedTime;
    const baseOpacity = 0.12;
    const targetOpacity = isActive ? 0.45 : baseOpacity;

    // 活跃轨道加上脉冲呼吸
    if (isActive) {
      const pulse = 0.25 + 0.2 * Math.sin(elapsed * 2.0);
      (lineRef.current.material as THREE.LineBasicMaterial).opacity = pulse;
      (lineRef.current.material as THREE.LineBasicMaterial).linewidth = 2;
    } else {
      // 缓动到基础透明度
      const mat = lineRef.current.material as THREE.LineBasicMaterial;
      mat.opacity += (targetOpacity - mat.opacity) * 0.03;
      mat.linewidth = 1;
    }
  });

  const colorObj = new THREE.Color(color);

  return (
    <Line ref={lineRef} geometry={geometry} position={position}>
      <lineBasicMaterial
        color={colorObj}
        transparent
        opacity={0.12}
        depthWrite={false}
        linewidth={1}
      />
    </Line>
  );
}

/* ============================================================
 * OrbitSystem — 主组件
 * ============================================================ */
export default function OrbitSystem() {
  const planets = useUniverseStore((s) => s.planets);
  const selectedPlanetId = useUniverseStore((s) => s.selectedPlanetId);

  // 过滤主星球，只显示会话星球轨道
  const sessionPlanets = planets.filter((p) => !p.isHome);

  // 颜色映射
  const getColor = (topic?: string): string => {
    const colorMap: Record<string, string> = {
      work: '#3B82F6',
      life: '#10B981',
      creative: '#8B5CF6',
      emotion: '#EF4444',
      study: '#F59E0B',
      other: '#6B7280',
    };
    return colorMap[topic || 'other'] || '#6B7280';
  };

  // 计算轨道半径（从星球位置计算到原点的距离）
  const orbitData = useMemo(() => {
    return sessionPlanets.map((planet) => {
      const pos = planet.position || { x: 0, y: 0, z: 0 };
      const radius = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      const tiltAngle = (Math.random() - 0.5) * 0.3; // -0.15 ~ 0.15 弧度
      return {
        id: planet.id,
        position: [pos.x, pos.y, pos.z] as [number, number, number],
        radius,
        color: getColor(planet.topic),
        tiltAngle,
        isActive: planet.id === selectedPlanetId,
      };
    });
  }, [sessionPlanets, selectedPlanetId]);

  return (
    <group>
      {orbitData.map((orbit) => (
        <OrbitRing
          key={orbit.id}
          position={orbit.position}
          radius={orbit.radius}
          color={orbit.color}
          tiltAngle={orbit.tiltAngle}
          isActive={orbit.isActive}
        />
      ))}
    </group>
  );
}
