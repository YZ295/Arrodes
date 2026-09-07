/**
 * 桌宠交互纯逻辑（可测试）
 *
 * 双宿主模式：
 * - electron：透明置顶窗口，拖拽通过 preload 暴露的 window.arrodesPet.moveBy 移动 OS 窗口
 * - browser：?surface=desktop-pet 标签页，拖拽用 DOM 固定定位并在本地持久化
 */

export type PetHostMode = 'electron' | 'browser';

/** preload（desktop/petPreload.ts）通过 contextBridge 暴露的桌宠控制接口 */
export interface PetHostBridge {
  /** 移动 Electron 桌宠窗口（屏幕坐标增量） */
  moveBy(dx: number, dy: number): void;
  /** 切换点击穿透：false = 鼠标事件穿透到下层窗口 */
  setInteractive(interactive: boolean): void;
  /** 调整 Electron 桌宠窗口整体大小（保持 660:600 比例由调用方计算） */
  resize(width: number, height: number): void;
  /** 向主进程同步当前视觉观察状态（右键菜单标签用） */
  notifyVisionState(on: boolean): void;
  /** 订阅右键菜单的视觉开关命令 */
  onVisionToggle(callback: (on: boolean) => void): void;
}

declare global {
  interface Window {
    arrodesPet?: PetHostBridge;
  }
}

export function resolvePetHostMode(): PetHostMode {
  return typeof window !== 'undefined' && window.arrodesPet ? 'electron' : 'browser';
}

export interface PetPosition {
  x: number;
  y: number;
}

export interface PetSize {
  width: number;
  height: number;
}

export function clampPetPosition(
  position: PetPosition,
  viewport: { width: number; height: number },
  pet: PetSize,
  margin = 8,
): PetPosition {
  const maxX = Math.max(margin, viewport.width - pet.width - margin);
  const maxY = Math.max(margin, viewport.height - pet.height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, position.x)),
    y: Math.min(maxY, Math.max(margin, position.y)),
  };
}

const POSITION_STORAGE_KEY = 'arrodes_desktop_pet_position';

export function loadStoredPetPosition(): PetPosition | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PetPosition>;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function storePetPosition(position: PetPosition): void {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // 持久化失败不影响交互
  }
}

/** 判定一次 pointer 序列是否为点击（位移小、时长短） */
export function isClickGesture(params: {
  totalDelta: number;
  durationMs: number;
  moveThresholdPx?: number;
  durationThresholdMs?: number;
}): boolean {
  const moveThreshold = params.moveThresholdPx ?? 6;
  const durationThreshold = params.durationThresholdMs ?? 600;
  return params.totalDelta <= moveThreshold && params.durationMs <= durationThreshold;
}

/** 点击立绘的随机反应台词（避免连续重复） */
export const PET_REACTIONS = [
  '唔？叫我吗？',
  '我在看着你的屏幕呢。',
  '别戳啦……好吧再戳一下也行。',
  '有需要就开口，我在听。',
  '画面有变化我会提醒你的。',
  '哼，今天也很努力呢。',
] as const;

export function pickPetReaction(previous?: string): string {
  const pool = PET_REACTIONS.filter((line) => line !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}
