/**
 * 子进程执行能力 seam（Definition / Provider / Consumer）
 *
 * - CommandProvider：Service Definition
 * - LocalCommandProvider：Service Provider（node:child_process）
 * - Consumer：skills/command.ts 的 exec_command 技能
 */
import { execSync } from 'node:child_process';

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
}

let provider: CommandProvider = new LocalCommandProvider();

export function getCommandProvider(): CommandProvider {
  return provider;
}

export function setCommandProvider(p: CommandProvider): void {
  provider = p;
}
