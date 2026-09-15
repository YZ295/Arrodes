/**
 * 桌宠 VRM 机位配置（纯逻辑 + 持久化）
 *
 * 用户通过机位调试面板拖滑条实时调整，保存后写入 localStorage，
 * 下次启动 VRM 控制器时自动应用。优先级：代码默认 < localStorage < 启动参数。
 */

export interface VrmCameraConfig {
  /** 相机距目标点的距离（米），越小越近越大越远 */
  distance: number;
  /** 观察目标相对头骨的垂直偏移（米），负值下移看肩部 */
  targetHeightOffset: number;
  /** 目标的水平偏移（米），正值右移 */
  horizontalOffset: number;
  /** 相机相对目标的额外抬升（米） */
  verticalOffset: number;
  /** 垂直视场角（度） */
  fov: number;
  /** 收臂角度（弧度），0 = T-pose，1.15 ≈ 自然垂下 */
  armAngle: number;
}

export const DEFAULT_CAMERA_CONFIG: VrmCameraConfig = {
  distance: 1.65,
  targetHeightOffset: -0.16,
  horizontalOffset: 0,
  verticalOffset: 0.1,
  fov: 28,
  armAngle: 1.15,
};

/** 各参数的滑条范围与步长（调试面板用） */
export const CAMERA_SLIDER_BOUNDS: Record<keyof VrmCameraConfig, { min: number; max: number; step: number; label: string }> = {
  distance: { min: 0.8, max: 3, step: 0.05, label: '距离' },
  targetHeightOffset: { min: -0.5, max: 0.3, step: 0.01, label: '目标高度' },
  horizontalOffset: { min: -0.5, max: 0.5, step: 0.01, label: '水平偏移' },
  verticalOffset: { min: -0.3, max: 0.6, step: 0.01, label: '相机抬升' },
  fov: { min: 15, max: 50, step: 1, label: '视场角' },
  armAngle: { min: 0, max: 1.57, step: 0.05, label: '收臂角度' },
};

const CAMERA_STORAGE_KEY = 'arrodes_desktop_pet_camera';

export function loadStoredCameraConfig(): Partial<VrmCameraConfig> {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<VrmCameraConfig>;
    const merged: Partial<VrmCameraConfig> = {};
    for (const key of Object.keys(DEFAULT_CAMERA_CONFIG) as (keyof VrmCameraConfig)[]) {
      const value = parsed[key];
      if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value;
    }
    return merged;
  } catch {
    return {};
  }
}

export function saveCameraConfig(config: VrmCameraConfig): void {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 持久化失败不影响运行
  }
}

export function clearStoredCameraConfig(): void {
  try {
    localStorage.removeItem(CAMERA_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 合并配置：代码默认 < localStorage < 覆盖参数 */
export function mergeCameraConfig(...overrides: Array<Partial<VrmCameraConfig>>): VrmCameraConfig {
  return { ...DEFAULT_CAMERA_CONFIG, ...loadStoredCameraConfig(), ...Object.assign({}, ...overrides) };
}
