/**
 * 子进程执行能力 seam（Definition / Provider / Consumer）
 *
 * - CommandProvider：Service Definition
 * - LocalCommandProvider：Service Provider（node:child_process）
 * - Consumer：skills/command.ts 的 exec_command 技能
 */
import { execSync, spawn } from 'node:child_process';

export interface CommandOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CommandProvider {
  run(
    command: string,
    opts: { cwd: string; timeoutMs: number; maxBuffer: number },
  ): CommandOutcome;
  /** 异步执行（不阻塞事件循环），用于长任务 */
  runAsync?(
    command: string,
    opts: { cwd: string; timeoutMs: number; maxBuffer: number; signal?: AbortSignal },
  ): Promise<AsyncCommandOutcome>;
}

export interface AsyncCommandOutcome {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted?: boolean;
}

export class LocalCommandProvider implements CommandProvider {
  run(command: string, opts: { cwd: string; timeoutMs: number; maxBuffer: number }): CommandOutcome {
    try {
      const stdout = execSync(command, {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        maxBuffer: opts.maxBuffer,
        encoding: 'utf-8',
        windowsHide: true,
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: '',
        stderr: err.stderr || err.message || String(err),
        exitCode: err.status ?? 1,
      };
    }
  }

  async runAsync(
    command: string,
    opts: { cwd: string; timeoutMs: number; maxBuffer: number; signal?: AbortSignal },
  ): Promise<AsyncCommandOutcome> {
    return new Promise((resolvePromise) => {
      const child = spawn(command, [], {
        cwd: opts.cwd,
        windowsHide: true,
        shell: true,
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
      const onAbort = () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        resolvePromise({ stdout, stderr: stderr || err.message, exitCode: -1, timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
        resolvePromise({ stdout, stderr, exitCode: code, timedOut, aborted: opts.signal?.aborted ?? false });
      });
    });
  }
}

let provider: CommandProvider = new LocalCommandProvider();

export function getCommandProvider(): CommandProvider {
  return provider;
}

export function setCommandProvider(p: CommandProvider): void {
  provider = p;
}
