/**
 * 桌宠机位调试面板
 *
 * 拖滑条实时预览（调 controller.setCamera），保存写入 localStorage 持久生效，
 * 重置恢复代码默认。仅 VRM 视觉模式下可用。
 */

import { useEffect, useState } from 'react';
import {
  CAMERA_SLIDER_BOUNDS,
  clearStoredCameraConfig,
  DEFAULT_CAMERA_CONFIG,
  loadStoredCameraConfig,
  saveCameraConfig,
  mergeCameraConfig,
  type VrmCameraConfig,
} from './petCamera';
import type { VrmPetController } from './vrmPet';
import './petCameraPanel.css';

export default function PetCameraPanel({
  controller,
  onClose,
}: {
  controller: VrmPetController;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<VrmCameraConfig>(() => mergeCameraConfig());
  const [saved, setSaved] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem('arrodes_pet_window_width'));
      return Number.isFinite(v) && v >= 440 && v <= 990 ? v : 660;
    } catch { return 660; }
  });

  // 打开面板时同步一次控制器当前生效值（含已保存的 localStorage 配置）
  useEffect(() => {
    setConfig(mergeCameraConfig());
  }, []);

  const update = (key: keyof VrmCameraConfig, value: number) => {
    const next = { ...config, [key]: value };
    setConfig(next);
    setSaved(false);
    controller.setCamera({ [key]: value });
  };

  const onSave = () => {
    saveCameraConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const onReset = () => {
    clearStoredCameraConfig();
    setConfig({ ...DEFAULT_CAMERA_CONFIG });
    controller.setCamera(DEFAULT_CAMERA_CONFIG);
    // 同时应用回代码默认（重置 localStorage 后 merge 回默认值）
    const restored = { ...DEFAULT_CAMERA_CONFIG, ...loadStoredCameraConfig() };
    controller.setCamera(restored);
    setSaved(false);
  };

  const keys = Object.keys(CAMERA_SLIDER_BOUNDS) as (keyof VrmCameraConfig)[];

  return (
    <section className="pet-camera-panel" data-role="camera-panel" aria-label="桌宠机位调试">
      <header className="pet-camera-panel__header">
        <span>机位调试</span>
        <button type="button" onClick={onClose} aria-label="关闭机位面板">×</button>
      </header>
      {keys.map((key) => {
        const bounds = CAMERA_SLIDER_BOUNDS[key];
        return (
          <label key={key} className="pet-camera-panel__row">
            <span className="pet-camera-panel__label">{bounds.label}</span>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={bounds.step}
              value={config[key]}
              onChange={(event) => update(key, Number(event.target.value))}
            />
            <span className="pet-camera-panel__value">{config[key].toFixed(2)}</span>
          </label>
        );
      })}
      <label className="pet-camera-panel__row">
        <span className="pet-camera-panel__label">窗口大小</span>
        <input
          type="range"
          min={440}
          max={990}
          step={10}
          value={windowWidth}
          onChange={(event) => {
            const width = Number(event.target.value);
            setWindowWidth(width);
            const height = Math.round((width * 600) / 660);
            try { localStorage.setItem('arrodes_pet_window_width', String(width)); } catch { /* 忽略 */ }
            window.arrodesPet?.resize(width, height);
          }}
        />
        <span className="pet-camera-panel__value">{windowWidth}</span>
      </label>
      <footer className="pet-camera-panel__footer">
        <button type="button" data-role="cam-save" onClick={onSave}>{saved ? '已保存 ✓' : '保存'}</button>
        <button type="button" data-role="cam-reset" onClick={onReset}>重置</button>
      </footer>
    </section>
  );
}
