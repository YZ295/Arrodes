import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { MageVisionProcess, type MageVisionRuntime } from './mageVisionProxy.js';

function childProcessStub() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

const runtime: MageVisionRuntime = {
  pythonPath: 'E:/AI/magevl-env/Scripts/python.exe',
  scriptPath: 'E:/app/vision-sidecar/mage_vl_sidecar.py',
  modelPath: 'E:/AI/HF/mage',
  hfHome: 'E:/AI/HF',
  port: 12002,
  url: 'http://127.0.0.1:12002',
};

describe('MageVisionProcess lifecycle', () => {
  it('does not spawn when an existing sidecar is healthy', async () => {
    const spawn = vi.fn();
    const process = new MageVisionProcess(runtime, {
      spawn,
      fetch: vi.fn().mockResolvedValue(Response.json({ status: 'ready' })),
      sleep: vi.fn(),
    });

    await expect(process.ensureStarted()).resolves.toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('spawns one bounded local process and waits for health', async () => {
    const child = childProcessStub();
    const spawn = vi.fn().mockReturnValue(child);
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Response.json({ status: 'ready' }));
    const process = new MageVisionProcess(runtime, { spawn, fetch, sleep: vi.fn() });

    await expect(process.ensureStarted()).resolves.toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(runtime.pythonPath, [
      '-u', runtime.scriptPath, '--port', '12002',
    ], expect.objectContaining({ windowsHide: true }));
    expect(spawn.mock.calls[0][2].env).toMatchObject({
      MAGEVL_MODEL: runtime.modelPath,
      HF_HOME: runtime.hfHome,
    });
  });

  it('returns a diagnosable error when runtime paths are missing', async () => {
    const process = new MageVisionProcess({ ...runtime, pythonPath: '' }, {
      spawn: vi.fn(), fetch: vi.fn().mockRejectedValue(new Error('offline')), sleep: vi.fn(),
    });
    await expect(process.ensureStarted()).resolves.toBe(false);
    expect(process.getLastError()).toContain('Python');
  });
});
