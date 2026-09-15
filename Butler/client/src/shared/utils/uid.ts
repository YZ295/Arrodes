/**
 * 简易唯一 ID 生成
 * 优先使用 crypto.randomUUID()，降级为时间戳+随机数
 */
export function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
