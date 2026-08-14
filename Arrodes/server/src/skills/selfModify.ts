/**
 * 自我修改技能（self_modify）
 *
 * 让阿罗德斯「自己更新自己」：把改动任务委派给本机 codex CLI 执行
 * （codex exec 以仓库根为工作目录、非交互式、输出写到临时文件）。
 *
 * 高风险：经 actionGate 确认后才执行；沙箱模式可用 SELF_MODIFY_SANDBOX 覆盖
 * （默认 danger-full-access，本机 Windows 沙箱起不来时兜底）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { registerSkill } from './registry.js';
import { getCommandProvider, type AsyncCommandOutcome } from '../services/commandProvider.js';

function repoRoot(): string {
  return process.env.ARRODES_REPO_ROOT || resolve(process.cwd(), '..', '..');
}

export async function runSelfModify(args: Record<string, unknown>): Promise<string> {
  const task = String(args.task || '').trim();
  if (!task) return '错误: 任务不能为空';

  const root = repoRoot();
  const sandbox = process.env.SELF_MODIFY_SANDBOX || 'danger-full-access';
  const taskFile = join(tmpdir(), `arrodes-selfmodify-task-${Date.now()}.txt`);
  const outFile = join(tmpdir(), `arrodes-selfmodify-out-${Date.now()}.txt`);
  writeFileSync(taskFile, task, 'utf-8');

  const cmd = `codex exec --ephemeral -C "${root}" -s ${sandbox} --color never -o "${outFile}" - < "${taskFile}"`;
  const provider = getCommandProvider();
  const outcome: AsyncCommandOutcome = provider.runAsync
    ? await provider.runAsync(cmd, { cwd: root, timeoutMs: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 })
    : {
        ...provider.run(cmd, { cwd: root, timeoutMs: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 }),
        timedOut: false,
      };

  let summary = '';
  try {
    if (existsSync(outFile)) summary = readFileSync(outFile, 'utf-8').trim();
  } catch {
    // ignore
  }

  const lines = [`codex exit=${outcome.exitCode}${outcome.timedOut ? '（超时）' : ''}`];
  if (summary) lines.push(`最后消息:\n${summary}`);
  const stdoutTail = (outcome.stdout || '').slice(-4000).trim();
  if (stdoutTail) lines.push(`输出片段:\n${stdoutTail}`);
  const stderrTail = (outcome.stderr || '').trim().slice(-1000);
  if (stderrTail) lines.push(`stderr:\n${stderrTail}`);
  return lines.join('\n');
}

registerSkill({
  name: 'self_modify',
  description:
    '修改阿罗德斯自己的代码/项目（委派给本机 codex CLI 执行）。当用户说"改一下代码""更新项目""自己改自己""改这个功能""修这个 bug"等需要改动本项目代码时使用。高风险，执行前需确认。',
  args: [
    { name: 'task', type: 'string', required: true, description: '要做的改动任务描述' },
  ],
  risk: 'high',
  readOnly: false,
  describe: (args) => `自我修改: ${String(args.task ?? '').slice(0, 80)}`,
  execute: runSelfModify,
});
