import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCommandProvider, type AsyncCommandOutcome } from './commandProvider.js';

/** Agent 调用超时（可配；默认 8 分钟，避免 15 分钟静默被杀） */
const AGENT_TIMEOUT_MS = Number(process.env.ARRODES_AGENT_TIMEOUT_MS || 8 * 60 * 1000);

/** cmd.exe 双引号参数内仍会展开 %VAR%，^ 是转义符，! 在延迟展开时特殊——统一转义 */
function escapeCmdArg(s: string): string {
  return s.replace(/\^/g, '^^').replace(/%/g, '^%').replace(/!/g, '^!');
}

/** 统一结果汇总：优先 -o 输出文件，其次 stdout；超时/中止显式报告；无输出时透出 stderr 诊断 */
function summarizeOutcome(
  outcome: AsyncCommandOutcome,
  summary: string,
  label: string,
): string {
  if (summary) return summary;
  const stderrTail = (outcome.stderr || '').trim().slice(-500);
  const stdout = (outcome.stdout || '').trim();
  if (outcome.timedOut || outcome.aborted || outcome.exitCode === null) {
    const why = outcome.timedOut ? '超时' : outcome.aborted ? '被中止' : '异常退出';
    return `${label} 执行${why}（exit=${outcome.exitCode}）${stderrTail ? `\n诊断信息: ${stderrTail}` : ''}`;
  }
  if (stdout) return stdout;
  if (stderrTail) return `${label} 无输出，诊断信息:\n${stderrTail}`;
  return `${label} 无输出（exit=${outcome.exitCode}）`;
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
    const cmd = `codex exec --ephemeral --skip-git-repo-check -C "${opts.cwd}" -s ${sandbox} --color never -o "${outFile}" - < "${taskFile}"`;
    const provider = getCommandProvider();
    const outcome = provider.runAsync
      ? await provider.runAsync(cmd, { cwd: opts.cwd, timeoutMs: AGENT_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, signal: opts.signal })
      : {
          ...provider.run(cmd, { cwd: opts.cwd, timeoutMs: AGENT_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }),
          timedOut: false,
        };
    let summary = '';
    try {
      if (existsSync(outFile)) summary = readFileSync(outFile, 'utf-8').trim();
    } catch {
      // ignore
    }
    return summarizeOutcome(outcome, summary, 'codex');
  }
}

export class HermesCliAdapter implements AgentChatAdapter {
  async run(task: string, opts: { cwd: string; signal?: AbortSignal }): Promise<string> {
    const safeTask = task.replace(/[\r\n]+/g, ' ').replace(/"/g, "'").slice(0, 4000);
    // hermes chat -q 是非交互单次查询；-Q 静默模式只输出最终回复（-z 不可靠）
    const cmd = `hermes chat -q "${escapeCmdArg(safeTask)}" -Q`;
    const provider = getCommandProvider();
    const outcome = provider.runAsync
      ? await provider.runAsync(cmd, { cwd: opts.cwd, timeoutMs: AGENT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, signal: opts.signal })
      : {
          ...provider.run(cmd, { cwd: opts.cwd, timeoutMs: AGENT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }),
          timedOut: false,
        };
    return summarizeOutcome(outcome, '', 'hermes');
  }
}

/** 全局适配器注册表（codex / hermes，未来 agent 在此追加） */
export const agentAdapters = new AgentAdapterRegistry();
agentAdapters.register('codex', new CodexCliAdapter());
agentAdapters.register('hermes', new HermesCliAdapter());
