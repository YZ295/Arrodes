// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredCameraConfig,
  DEFAULT_CAMERA_CONFIG,
  loadStoredCameraConfig,
  mergeCameraConfig,
  saveCameraConfig,
} from './petCamera';

describe('petCamera config', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns code defaults when nothing is stored', () => {
    expect(mergeCameraConfig()).toEqual(DEFAULT_CAMERA_CONFIG);
    expect(loadStoredCameraConfig()).toEqual({});
  });

  it('applies override on top of stored config on top of defaults', () => {
    saveCameraConfig({ ...DEFAULT_CAMERA_CONFIG, distance: 2.2 });
    const merged = mergeCameraConfig({ fov: 40 });
    expect(merged.distance).toBe(2.2); // localStorage
    expect(merged.fov).toBe(40); // override
    expect(merged.armAngle).toBe(DEFAULT_CAMERA_CONFIG.armAngle); // default
  });

  it('ignores invalid stored values instead of crashing', () => {
    localStorage.setItem('arrodes_desktop_pet_camera', JSON.stringify({ distance: 'big', fov: NaN, armAngle: 0.9 }));
    const stored = loadStoredCameraConfig();
    expect(stored.distance).toBeUndefined();
    expect(stored.fov).toBeUndefined();
    expect(stored.armAngle).toBe(0.9);
    expect(mergeCameraConfig().armAngle).toBe(0.9);
  });

  it('clear removes persisted config', () => {
    saveCameraConfig({ ...DEFAULT_CAMERA_CONFIG, distance: 2.5 });
    clearStoredCameraConfig();
    expect(loadStoredCameraConfig()).toEqual({});
  });
});
