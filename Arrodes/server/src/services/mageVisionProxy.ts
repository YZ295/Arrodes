import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ProcessLike = Pick<ChildProcess, 'stdout' | 'stderr' | 'on' | 'kill'>;
type SpawnLike = (
  command: string,
  args: string[],
  options: { windowsHide: boolean; stdio: ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv },
) => ProcessLike;

export interface MageVisionRuntime {
  pythonPath: string;
  scriptPath: string;
  modelPath: string;
  hfHome: string;
  port: number;
  url: string;
}

interface MageVisionDependencies {
  spawn: SpawnLike;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

const currentDir = dirname(fileURLToPath(import.meta.url));

function firstExisting(candidates: Array<string | undefined>): string {
  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

export function resolveMageVisionRuntime(): MageVisionRuntime {
  const port = Number(process.env.MAGEVL_PORT || 12002);
  const modelPath = firstExisting([
    process.env.MAGEVL_MODEL,
    'E:/AI/HF/hub/models--microsoft--Mage-VL/snapshots/d88b153285f1633a61b2f693c59c8576693af185',
  ]) || process.env.MAGEVL_MODEL || 'microsoft/Mage-VL';
  return {
    pythonPath: firstExisting([
      process.env.MAGEVL_PYTHON,
      resolve(currentDir, '../../../vision-sidecar/.venv/Scripts/python.exe'),
      'E:/AI/magevl-env/Scripts/python.exe',
    ]),
    scriptPath: firstExisting([
      resolve(currentDir, '../../../vision-sidecar/mage_vl_sidecar.py'),
      process.env.ARRODES_RESOURCES_PATH
        ? resolve(process.env.ARRODES_RESOURCES_PATH, 'vision-sidecar/mage_vl_sidecar.py')
        : undefined,
    ]),
    modelPath,
    hfHome: firstExisting([process.env.HF_HOME, 'E:/AI/HF']) || process.env.HF_HOME || '',
    port,
    url: (process.env.MAGEVL_SIDECAR_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, ''),
  };
}

export function isMageVisionAutoStartEnabled(): boolean {
  const configured = process.env.MAGEVL_AUTO_START?.toLowerCase();
  if (configured === 'off' || configured === 'false' || configured === '0') return false;
  if (configured === 'on' || configured === 'true' || configured === '1') return true;
  return process.env.NODE_ENV === 'production';
}

export class MageVisionProcess {
  private child: ProcessLike | null = null;
  private starting: Promise<boolean> | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly runtime: MageVisionRuntime,
    private readonly deps: MageVisionDependencies = {
      spawn: nodeSpawn as SpawnLike,
      fetch: globalThis.fetch.bind(globalThis),
      sleep: (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
    },
  ) {}

  getLastError(): string | null {
    return this.lastError;
  }

  private async healthy(): Promise<boolean> {
    try {
      const response = await this.deps.fetch(`${this.runtime.url}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) return false;
      const body = await response.json() as { status?: string };
      return body.status === 'ready' || body.status === 'ok';
    } catch {
      return false;
    }
  }

  async ensureStarted(): Promise<boolean> {
    if (await this.healthy()) return true;
    if (this.starting) return this.starting;
    this.starting = this.startOnce();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async startOnce(): Promise<boolean> {
    if (!this.runtime.pythonPath) {
      this.lastError = '未找到 Mage-VL Python；请设置 MAGEVL_PYTHON';
      return false;
    }
    if (!this.runtime.scriptPath) {
      this.lastError = '未找到 Mage-VL sidecar 脚本';
      return false;
    }

    this.child = this.deps.spawn(
      this.runtime.pythonPath,
      ['-u', this.runtime.scriptPath, '--port', String(this.runtime.port)],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MAGEVL_MODEL: this.runtime.modelPath,
          ...(this.runtime.hfHome ? { HF_HOME: this.runtime.hfHome } : {}),
        },
      },
    );
    this.child.stdout?.on('data', (data) => process.stdout.write(`[Mage-VL] ${String(data)}`));
    this.child.stderr?.on('data', (data) => process.stderr.write(`[Mage-VL] ${String(data)}`));
    this.child.on('exit', (code) => {
      this.child = null;
      if (code && code !== 0) this.lastError = `Mage-VL sidecar 已退出（code=${code}）`;
    });

    for (let attempt = 0; attempt < 60; attempt++) {
      await this.deps.sleep(500);
      if (await this.healthy()) {
        this.lastError = null;
        return true;
      }
    }
    this.lastError = 'Mage-VL sidecar 启动超时（30 秒）';
    return false;
  }

  shutdown(): void {
    this.child?.kill('SIGTERM');
    this.child = null;
  }
}

export const mageVisionProcess = new MageVisionProcess(resolveMageVisionRuntime());
