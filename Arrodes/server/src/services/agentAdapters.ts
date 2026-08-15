import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCommandProvider } from './commandProvider.js';

/** cmd.exe 双引号参数内仍会展开 %VAR%，^ 是转义符，! 在延迟展开时特殊——统一转义 */
function escapeCmdArg(s: string): string {
  return s.replace(/\^/g, '^^').replace(/%/g, '^%').replace(/!/g, '^!');
}

export interface AgentChatAdapter {
  run(task: string, opts: { cwd: string; signal?: AbortSignal }): Promise<string>;
}

export class AgentAdapterRegistry {
  private map = new Map<string, AgentChatAdapter>();

  register(id: string, adapter: AgentChatAdapter): () => void {
    this.map.set(id, adapter);
    return () => {
      this.map.delete(id);
    };
  }

  get(id: string): AgentChatAdapter | undefined {
    return this.map.get(id);
  }
}

export class CodexCliAdapter implements AgentChatAdapter {
  async run(task: string, opts: { cwd: string; signal?: AbortSignal }): Promise<string> {
    const sandbox = process.env.SELF_MODIFY_SANDBOX || 'danger-full-access';
    const taskFile = join(tmpdir(), `arrodes-agent-chat-task-${Date.now()}.txt`);
    const outFile = join(tmpdir(), `arrodes-agent-chat-out-${Date.now()}.txt`);
    writeFileSync(taskFile, task, 'utf-8');
    const cmd = `codex exec --ephemeral -C "${opts.cwd}" -s ${sandbox} --color never -o "${outFile}" - < "${taskFile}"`;
    const provider = getCommandProvider();
    const outcome = provider.runAsync
      ? await provider.runAsync(cmd, { cwd: opts.cwd, timeoutMs: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, signal: opts.signal })
      : {
          ...provider.run(cmd, { cwd: opts.cwd, timeoutMs: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 }),
          timedOut: false,
        };
    let summary = '';
    try {
      if (existsSync(outFile)) summary = readFileSync(outFile, 'utf-8').trim();
    } catch {
      // ignore
    }
    return summary || (outcome.stdout || '').trim() || `（codex 无输出，exit=${outcome.exitCode}）`;
  }
}

export class HermesCliAdapter implements AgentChatAdapter {
  async run(task: string, opts: { cwd: string; signal?: AbortSignal }): Promise<string> {
    const safeTask = task.replace(/[\r\n]+/g, ' ').replace(/"/g, "'").slice(0, 4000);
    const cmd = `hermes -z "${escapeCmdArg(safeTask)}"`;
    const provider = getCommandProvider();
    const outcome = provider.runAsync
      ? await provider.runAsync(cmd, { cwd: opts.cwd, timeoutMs: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024, signal: opts.signal })
      : {
          ...provider.run(cmd, { cwd: opts.cwd, timeoutMs: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }),
          timedOut: false,
        };
    return (outcome.stdout || '').trim() || (outcome.stderr || '').trim().slice(-500) || `（hermes 无输出，exit=${outcome.exitCode}）`;
  }
}

/** 全局适配器注册表（codex / hermes，未来 agent 在此追加） */
export const agentAdapters = new AgentAdapterRegistry();
agentAdapters.register('codex', new CodexCliAdapter());
agentAdapters.register('hermes', new HermesCliAdapter());
