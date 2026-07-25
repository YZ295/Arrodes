/**
 * 星球轨道位置计算
 * 黄金角分布，避免重叠，均匀覆盖球面
 */

const ORBIT_R = 8;
const ORBIT_STEP = 3.5;

/**
 * 根据索引计算新星球在轨道上的生成位置
 * @param index 非主星球在列表中的索引（0-based）
 */
export function calcSpawnPosition(index: number): { x: number; y: number; z: number } {
  const angle = (index * 0.618) * Math.PI * 2; // 黄金角分布
  const radius = ORBIT_R + (index % 3) * ORBIT_STEP;
  const y = ((index % 5) - 2) * 2;
  return {
    x: Math.cos(angle) * radius,
    y,
    z: Math.sin(angle) * radius,
  };
}

/**
 * 为会话列表批量计算轨道位置
 * @param sessions 会话节点列表
 * @returns 带 position 的 PlanetVisualData 兼容对象
 */
export function calcSpawnPositionsForSessions<T extends { id: string }>(
  sessions: T[],
): (T & { position: { x: number; y: number; z: number } })[] {
  return sessions.map((s, i) => ({
    ...s,
    position: calcSpawnPosition(i),
  }));
}
