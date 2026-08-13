import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type WinOp =
  | 'open-app'
  | 'list-windows'
  | 'focus-window'
  | 'close-window'
  | 'type-text'
  | 'send-hotkey'
  | 'volume'
  | 'media'
  | 'clipboard-get'
  | 'clipboard-set'
  | 'screenshot'
  | 'lock-screen'
  | 'get-foreground'
  | 'system-stats';

export interface WinOpResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface SpawnOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { env: NodeJS.ProcessEnv; windowsHide: boolean; timeoutMs: number },
) => Promise<SpawnOutcome>;

const DEFAULT_TIMEOUT_MS = 20000;

const realSpawn: SpawnFn = (cmd, args, opts) =>
  new Promise<SpawnOutcome>((resolvePromise) => {
    const child = spawn(cmd, args, {
      windowsHide: opts.windowsHide,
      env: { ...opts.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, opts.timeoutMs);
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr: stderr || err.message, exitCode: -1, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, exitCode: code, timedOut });
    });
  });

let runner: SpawnFn = realSpawn;

export function setWinopsRunnerForTest(fn: SpawnFn): void {
  runner = fn;
}

export function resetWinopsRunnerForTest(): void {
  runner = realSpawn;
}

export function isDesktopToolsEnabled(): boolean {
  return process.env.DESKTOP_TOOLS !== 'off';
}

export function resolveWinopsScriptPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '../../scripts/winops.ps1');
}

export async function runWinOp(op: WinOp, payload?: unknown): Promise<WinOpResult> {
  if (!isDesktopToolsEnabled()) {
    throw new Error('桌面操控已关闭（DESKTOP_TOOLS=off）');
  }
  const script = resolveWinopsScriptPath();
  if (!existsSync(script)) {
    throw new Error(`winops 脚本不存在: ${script}`);
  }
  const outcome = await runner('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    script,
    '-Op',
    op,
    '-Payload',
    JSON.stringify(payload ?? {}),
  ], {
    env: { ...process.env },
    windowsHide: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  if (outcome.timedOut) {
    return { ok: false, error: `操作超时（${DEFAULT_TIMEOUT_MS / 1000}s）` };
  }
  const jsonLine = outcome.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))
    .pop();
  if (jsonLine) {
    try {
      return JSON.parse(jsonLine) as WinOpResult;
    } catch {
      // fallthrough
    }
  }
  const stderrTail = outcome.stderr.trim().slice(-300);
  return { ok: false, error: stderrTail || `winops 执行失败（exit=${outcome.exitCode}）` };
}
